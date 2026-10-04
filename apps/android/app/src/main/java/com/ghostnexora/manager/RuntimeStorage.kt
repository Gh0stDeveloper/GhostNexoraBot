package com.ghostnexora.manager

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.time.Instant

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
            writeAtomically(
                activeFile,
                JSONObject()
                    .put("activeSlot", "a")
                    .put("previousSlot", JSONObject.NULL)
                    .put("updatedAt", Instant.now().toString())
                    .toString(2),
            )
        }

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

    fun activeEntryFile(): File = File(activeSlotDirectory(), "dist-mobile/mobile-lite.js")

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
}
