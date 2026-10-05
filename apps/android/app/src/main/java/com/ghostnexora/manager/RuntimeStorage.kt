package com.ghostnexora.manager

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.time.Instant
import java.util.zip.ZipInputStream

data class RuntimePaths(
    val runtimeRoot: File,
    val slotA: File,
    val slotB: File,
    val stateRoot: File,
    val session: File,
    val data: File,
    val subbots: File,
    val logs: File,
    val mediaCache: File,
    val secrets: File,
)

class RuntimeStorage(private val context: Context) {
    val paths = RuntimePaths(
        runtimeRoot = File(context.filesDir, "runtime"),
        slotA = File(context.filesDir, "runtime/slot-a"),
        slotB = File(context.filesDir, "runtime/slot-b"),
        stateRoot = File(context.filesDir, "state"),
        session = File(context.filesDir, "state/session"),
        data = File(context.filesDir, "state/data"),
        subbots = File(context.filesDir, "state/subbots"),
        logs = File(context.filesDir, "state/logs"),
        mediaCache = File(context.cacheDir, "media"),
        secrets = File(context.noBackupFilesDir, "secrets"),
    )

    private val activeFile = File(paths.runtimeRoot, "active.json")
    private val statusFile = File(paths.stateRoot, "runtime-status.json")
    private val logFile = File(paths.logs, "runtime.log")
    private val configFile = File(paths.data, "mobile-config.json")

    fun prepare() {
        listOf(
            paths.runtimeRoot,
            paths.slotA,
            paths.slotB,
            paths.stateRoot,
            paths.session,
            paths.data,
            paths.subbots,
            paths.logs,
            paths.mediaCache,
            paths.secrets,
        ).forEach { directory ->
            check(directory.exists() || directory.mkdirs()) { "cannot_create_runtime_directory:${directory.absolutePath}" }
        }

        if (!activeFile.exists()) {
            writeActiveSlot("a", null)
        }

        installBundledRuntimeIfNeeded()

        if (!statusFile.exists()) {
            writeStatus(
                JSONObject()
                    .put("installed", activeEntryFile().isFile)
                    .put("running", false)
                    .put("runtimeState", "offline")
                    .put("whatsappConnected", false)
                    .put("paired", File(paths.session, "creds.json").isFile)
                    .put("uptimeSeconds", 0)
                    .put("profile", "mobile-lite")
                    .put("nodeVersion", EmbeddedNodeHost.expectedNodeVersion)
                    .put("version", "2.0.0")
                    .put("installDir", activeSlotDirectory().absolutePath)
                    .put("stateDir", paths.stateRoot.absolutePath),
            )
        }
    }

    fun activeSlotName(): String {
        prepareParentOnly()
        return runCatching {
            JSONObject(activeFile.readText()).optString("activeSlot", "a")
        }.getOrDefault("a").let { if (it == "b") "b" else "a" }
    }

    fun activeSlotDirectory(): File = if (activeSlotName() == "b") paths.slotB else paths.slotA

    fun inactiveSlotDirectory(): File = if (activeSlotName() == "b") paths.slotA else paths.slotB

    fun activeEntryFile(): File = File(activeSlotDirectory(), RUNTIME_ENTRY)

    fun isRuntimePackInstalled(): Boolean = activeEntryFile().isFile

    fun readStatus(): JSONObject {
        prepare()
        return runCatching { JSONObject(statusFile.readText()) }.getOrElse {
            JSONObject()
                .put("installed", isRuntimePackInstalled())
                .put("running", false)
                .put("runtimeState", "offline")
                .put("whatsappConnected", false)
                .put("paired", File(paths.session, "creds.json").isFile)
                .put("profile", "mobile-lite")
        }
    }

    fun writeStatus(status: JSONObject) {
        prepareParentOnly()
        status.put("installed", isRuntimePackInstalled())
        status.put("profile", "mobile-lite")
        status.put("installDir", activeSlotDirectory().absolutePath)
        status.put("stateDir", paths.stateRoot.absolutePath)
        writeAtomically(statusFile, status.toString())
    }

    fun updateStatus(block: (JSONObject) -> Unit): JSONObject {
        val next = readStatus()
        block(next)
        writeStatus(next)
        return next
    }

    fun saveConfig(botName: String, prefix: String, language: String) {
        prepare()
        val value = JSONObject()
            .put("botName", botName)
            .put("prefix", prefix)
            .put("language", language)
            .put("updatedAt", Instant.now().toString())
        writeAtomically(configFile, value.toString(2))
    }

    fun appendLog(level: String, message: String) {
        prepareParentOnly()
        paths.logs.mkdirs()
        val safeMessage = message.replace("\n", " ").replace("\r", " ").take(4_000)
        logFile.appendText("${Instant.now()} [${level.uppercase()}] $safeMessage\n")
        rotateLogIfNeeded()
    }

    fun readLogs(maxLines: Int = 200): String {
        if (!logFile.isFile) return ""
        return logFile.readLines().takeLast(maxLines).joinToString("\n")
    }

    private fun installBundledRuntimeIfNeeded() {
        if (activeEntryFile().isFile) return

        val slotAEntry = File(paths.slotA, RUNTIME_ENTRY)
        if (slotAEntry.isFile) {
            writeActiveSlot("a", activeSlotName())
            return
        }

        val expectedChecksum = runCatching {
            context.assets.open(BUNDLED_RUNTIME_CHECKSUM_ASSET).bufferedReader().use { reader ->
                reader.readLine().trim().substringBefore(' ')
            }
        }.getOrNull()?.takeIf { it.matches(Regex("[a-fA-F0-9]{64}")) } ?: return

        val tempZip = File(context.cacheDir, "mobile-lite-runtime.bootstrap.zip")
        val staging = File(paths.runtimeRoot, ".bootstrap-install")

        try {
            val digest = MessageDigest.getInstance("SHA-256")
            context.assets.open(BUNDLED_RUNTIME_ASSET).use { input ->
                tempZip.outputStream().buffered().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var totalCompressed = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        totalCompressed += count
                        check(totalCompressed <= MAX_COMPRESSED_RUNTIME_BYTES) { "bundled_runtime_too_large" }
                        digest.update(buffer, 0, count)
                        output.write(buffer, 0, count)
                    }
                }
            }

            val actualChecksum = digest.digest().joinToString("") { "%02x".format(it) }
            check(actualChecksum.equals(expectedChecksum, ignoreCase = true)) {
                "bundled_runtime_checksum_mismatch"
            }

            staging.deleteRecursively()
            check(staging.mkdirs()) { "cannot_create_runtime_staging" }
            extractRuntimeZip(tempZip, staging)

            check(File(staging, RUNTIME_ENTRY).isFile) { "bundled_runtime_entry_missing" }
            check(File(staging, "runtime-manifest.json").isFile) { "bundled_runtime_manifest_missing" }
            File(staging, ".bundled-runtime.sha256").writeText(actualChecksum + "\n")

            paths.slotA.deleteRecursively()
            check(staging.renameTo(paths.slotA)) { "cannot_activate_bundled_runtime" }
            writeActiveSlot("a", activeSlotName())
        } finally {
            tempZip.delete()
            if (staging.exists()) staging.deleteRecursively()
        }
    }

    private fun extractRuntimeZip(zipFile: File, destination: File) {
        val rootPath = destination.canonicalPath + File.separator
        var fileCount = 0
        var expandedBytes = 0L

        ZipInputStream(FileInputStream(zipFile).buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                fileCount += 1
                check(fileCount <= MAX_RUNTIME_FILES) { "bundled_runtime_too_many_files" }

                val target = File(destination, entry.name)
                val canonicalTarget = target.canonicalPath
                check(canonicalTarget == destination.canonicalPath || canonicalTarget.startsWith(rootPath)) {
                    "bundled_runtime_invalid_path"
                }

                if (entry.isDirectory) {
                    check(target.exists() || target.mkdirs()) { "cannot_create_runtime_directory" }
                } else {
                    target.parentFile?.let { parent ->
                        check(parent.exists() || parent.mkdirs()) { "cannot_create_runtime_parent" }
                    }
                    target.outputStream().buffered().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val count = zip.read(buffer)
                            if (count < 0) break
                            expandedBytes += count
                            check(expandedBytes <= MAX_EXPANDED_RUNTIME_BYTES) { "bundled_runtime_expanded_too_large" }
                            output.write(buffer, 0, count)
                        }
                    }
                }
                zip.closeEntry()
            }
        }
    }

    private fun writeActiveSlot(active: String, previous: String?) {
        writeAtomically(
            activeFile,
            JSONObject()
                .put("activeSlot", if (active == "b") "b" else "a")
                .put("previousSlot", previous ?: JSONObject.NULL)
                .put("updatedAt", Instant.now().toString())
                .toString(2),
        )
    }

    private fun rotateLogIfNeeded() {
        if (!logFile.isFile || logFile.length() <= 2L * 1024 * 1024) return
        val keep = logFile.readLines().takeLast(2_000).joinToString("\n", postfix = "\n")
        writeAtomically(logFile, keep)
    }

    private fun prepareParentOnly() {
        if (!paths.runtimeRoot.exists()) paths.runtimeRoot.mkdirs()
        if (!paths.stateRoot.exists()) paths.stateRoot.mkdirs()
    }

    private fun writeAtomically(target: File, content: String) {
        target.parentFile?.mkdirs()
        val temp = File(target.parentFile, ".${target.name}.tmp")
        temp.writeText(content)
        if (!temp.renameTo(target)) {
            target.writeText(content)
            temp.delete()
        }
    }

    companion object {
        private const val RUNTIME_ENTRY = "dist-mobile/mobile-bootstrap.js"
        private const val BUNDLED_RUNTIME_ASSET = "runtime/mobile-lite-runtime.zip"
        private const val BUNDLED_RUNTIME_CHECKSUM_ASSET = "runtime/mobile-lite-runtime.zip.sha256"
        private const val MAX_COMPRESSED_RUNTIME_BYTES = 256L * 1024 * 1024
        private const val MAX_EXPANDED_RUNTIME_BYTES = 512L * 1024 * 1024
        private const val MAX_RUNTIME_FILES = 75_000
    }
}
