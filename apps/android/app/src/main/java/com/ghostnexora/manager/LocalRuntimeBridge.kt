package com.ghostnexora.manager

import android.app.IntentService
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.util.concurrent.atomic.AtomicInteger

data class LocalCommandResult(
    val requestId: Int,
    val kind: String,
    val stdout: String,
    val stderr: String,
    val exitCode: Int,
    val errorCode: Int,
    val errorMessage: String,
) {
    val successful: Boolean get() = errorCode == -1 && exitCode == 0
}

object LocalRuntimeEvents {
    private val _results = MutableSharedFlow<LocalCommandResult>(
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val results = _results.asSharedFlow()

    internal fun emit(result: LocalCommandResult) {
        _results.tryEmit(result)
    }
}

@Suppress("DEPRECATION")
class TermuxResultService : IntentService("GhostNexoraTermuxResult") {
    override fun onHandleIntent(intent: Intent?) {
        if (intent == null) return
        val bundle = intent.getBundleExtra(RESULT_BUNDLE)
        LocalRuntimeEvents.emit(
            LocalCommandResult(
                requestId = intent.getIntExtra(EXTRA_REQUEST_ID, -1),
                kind = intent.getStringExtra(EXTRA_KIND).orEmpty(),
                stdout = bundle?.getString("stdout").orEmpty(),
                stderr = bundle?.getString("stderr").orEmpty(),
                exitCode = bundle?.getInt("exitCode", -1) ?: -1,
                errorCode = bundle?.getInt("err", 0) ?: 0,
                errorMessage = bundle?.getString("errmsg").orEmpty(),
            ),
        )
    }

    companion object {
        const val EXTRA_REQUEST_ID = "ghost_nexora_request_id"
        const val EXTRA_KIND = "ghost_nexora_request_kind"
        private const val RESULT_BUNDLE = "result"
    }
}

class LocalRuntimeBridge(private val context: Context) {
    private val requestCounter = AtomicInteger(2000)

    fun isTermuxInstalled(): Boolean = try {
        context.packageManager.getPackageInfo(TERMUX_PACKAGE, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    fun hasRunCommandPermission(): Boolean =
        context.checkSelfPermission(RUN_COMMAND_PERMISSION) == PackageManager.PERMISSION_GRANTED

    fun probe(): Int = managerCommand("probe", "app-status")
    fun start(): Int = managerCommand("start", "start")
    fun stop(): Int = managerCommand("stop", "stop")
    fun restart(): Int = managerCommand("restart", "restart")
    fun update(): Int = managerCommand("update", "update")
    fun logs(): Int = managerCommand("logs", "app-logs")
    fun pairStatus(): Int = managerCommand("pair-status", "app-pair-status")
    fun pairCancel(): Int = managerCommand("pair-cancel", "app-pair-cancel")

    fun pairStart(mode: String, phone: String): Int {
        require(mode == "qr" || mode == "code") { "invalid_pairing_mode" }
        val cleaned = phone.filter(Char::isDigit)
        if (mode == "code") require(cleaned.length in 8..15) { "invalid_phone_number" }
        return managerCommand("pair-start", "app-pair-start", mode, cleaned)
    }

    fun saveConfig(botName: String, prefix: String, language: String): Int {
        val safeName = botName.trim()
        val safePrefix = prefix.trim()
        require(safeName.length in 2..60) { "invalid_bot_name" }
        require(safePrefix.isNotBlank() && safePrefix.length <= 4 && safePrefix.none(Char::isWhitespace)) { "invalid_prefix" }
        require(language == "es" || language == "en") { "invalid_language" }
        return managerCommand("config-save", "app-config-set", safeName, safePrefix, language)
    }

    fun setWebEnabled(enabled: Boolean): Int = managerCommand("web", "web", if (enabled) "on" else "off")

    fun install(): Int = runCommand(
        kind = "install",
        commandPath = TERMUX_BASH,
        arguments = arrayOf("-s"),
        stdin = bootstrapScript,
    )

    fun openTermux() {
        context.packageManager.getLaunchIntentForPackage(TERMUX_PACKAGE)?.let {
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(it)
        }
    }

    fun openPermissionSettings() {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    fun openTermuxDownload() {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(TERMUX_DOWNLOAD_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    fun openLocalWeb() {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:3001/"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    private fun managerCommand(kind: String, vararg args: String): Int = runCommand(
        kind = kind,
        commandPath = GHOST_NEXORA_COMMAND,
        arguments = arrayOf(*args),
    )

    private fun runCommand(
        kind: String,
        commandPath: String,
        arguments: Array<String> = emptyArray(),
        stdin: String? = null,
    ): Int {
        check(isTermuxInstalled()) { "termux_not_installed" }
        check(hasRunCommandPermission()) { "termux_run_command_permission_required" }

        val requestId = requestCounter.incrementAndGet()
        val resultIntent = Intent(context, TermuxResultService::class.java).apply {
            putExtra(TermuxResultService.EXTRA_REQUEST_ID, requestId)
            putExtra(TermuxResultService.EXTRA_KIND, kind)
        }
        val pendingIntent = PendingIntent.getService(
            context,
            requestId,
            resultIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )

        val intent = Intent().apply {
            setClassName(TERMUX_PACKAGE, TERMUX_RUN_COMMAND_SERVICE)
            action = TERMUX_RUN_COMMAND_ACTION
            putExtra(EXTRA_COMMAND_PATH, commandPath)
            putExtra(EXTRA_ARGUMENTS, arguments)
            putExtra(EXTRA_WORKDIR, TERMUX_HOME)
            putExtra(EXTRA_BACKGROUND, true)
            putExtra(EXTRA_PENDING_INTENT, pendingIntent)
            putExtra(EXTRA_COMMAND_LABEL, "Ghost Nexora Bot")
            putExtra(EXTRA_COMMAND_DESCRIPTION, "Ghost Nexora local runtime: $kind")
            if (stdin != null) putExtra(EXTRA_STDIN, stdin)
        }
        context.startService(intent)
        return requestId
    }

    private val bootstrapScript: String
        get() {
            val ref = BuildConfig.GHOST_NEXORA_SOURCE_REF
                .takeIf { it.matches(Regex("^[A-Za-z0-9._/-]{1,120}$")) }
                ?: "main"
            return """
                set -Eeuo pipefail
                REPO_URL='https://github.com/Gh0stDeveloper/GhostNexoraBot.git'
                BRANCH='$ref'
                INSTALL_DIR="${'$'}HOME/GhostNexoraBot"
                STATE_DIR="${'$'}HOME/.ghostnexora"
                mkdir -p "${'$'}STATE_DIR"
                pkg update -y
                pkg install -y git nodejs ffmpeg python curl unzip procps coreutils
                if [ -d "${'$'}INSTALL_DIR/.git" ]; then
                  git -C "${'$'}INSTALL_DIR" fetch origin "${'$'}BRANCH"
                  git -C "${'$'}INSTALL_DIR" checkout "${'$'}BRANCH"
                  git -C "${'$'}INSTALL_DIR" pull --ff-only origin "${'$'}BRANCH"
                else
                  git clone --depth 1 --branch "${'$'}BRANCH" "${'$'}REPO_URL" "${'$'}INSTALL_DIR"
                fi
                cd "${'$'}INSTALL_DIR"
                GHOST_NEXORA_NONINTERACTIVE=1 BRANCH="${'$'}BRANCH" INSTALL_DIR="${'$'}INSTALL_DIR" STATE_DIR="${'$'}STATE_DIR" bash scripts/install-termux.sh </dev/null
            """.trimIndent()
        }

    companion object {
        const val RUN_COMMAND_PERMISSION = "com.termux.permission.RUN_COMMAND"
        private const val TERMUX_PACKAGE = "com.termux"
        private const val TERMUX_RUN_COMMAND_SERVICE = "com.termux.app.RunCommandService"
        private const val TERMUX_RUN_COMMAND_ACTION = "com.termux.RUN_COMMAND"
        private const val EXTRA_COMMAND_PATH = "com.termux.RUN_COMMAND_PATH"
        private const val EXTRA_ARGUMENTS = "com.termux.RUN_COMMAND_ARGUMENTS"
        private const val EXTRA_STDIN = "com.termux.RUN_COMMAND_STDIN"
        private const val EXTRA_WORKDIR = "com.termux.RUN_COMMAND_WORKDIR"
        private const val EXTRA_BACKGROUND = "com.termux.RUN_COMMAND_BACKGROUND"
        private const val EXTRA_PENDING_INTENT = "com.termux.RUN_COMMAND_PENDING_INTENT"
        private const val EXTRA_COMMAND_LABEL = "com.termux.RUN_COMMAND_COMMAND_LABEL"
        private const val EXTRA_COMMAND_DESCRIPTION = "com.termux.RUN_COMMAND_COMMAND_DESCRIPTION"
        private const val TERMUX_HOME = "/data/data/com.termux/files/home"
        private const val TERMUX_BASH = "/data/data/com.termux/files/usr/bin/bash"
        private const val GHOST_NEXORA_COMMAND = "/data/data/com.termux/files/usr/bin/ghostnexora"
        private const val TERMUX_DOWNLOAD_URL = "https://f-droid.org/packages/com.termux/"
    }
}
