package com.ghostnexora.manager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
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
    val successful: Boolean get() = errorCode == 0 && exitCode == 0
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

class NativeRuntimeController(context: Context) {
    private val appContext = context.applicationContext
    private val requestCounter = AtomicInteger(3000)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val storage = RuntimeStorage(appContext)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != BotRuntimeService.ACTION_EVENT) return
            LocalRuntimeEvents.emit(
                LocalCommandResult(
                    requestId = intent.getIntExtra(BotRuntimeService.EXTRA_REQUEST_ID, -1),
                    kind = intent.getStringExtra(BotRuntimeService.EXTRA_KIND).orEmpty(),
                    stdout = intent.getStringExtra(BotRuntimeService.EXTRA_STDOUT).orEmpty(),
                    stderr = intent.getStringExtra(BotRuntimeService.EXTRA_STDERR).orEmpty(),
                    exitCode = intent.getIntExtra(BotRuntimeService.EXTRA_EXIT_CODE, 0),
                    errorCode = intent.getIntExtra(BotRuntimeService.EXTRA_ERROR_CODE, 0),
                    errorMessage = intent.getStringExtra(BotRuntimeService.EXTRA_ERROR_MESSAGE).orEmpty(),
                ),
            )
        }
    }

    init {
        appContext.registerReceiver(
            receiver,
            IntentFilter(BotRuntimeService.ACTION_EVENT),
            Context.RECEIVER_NOT_EXPORTED,
        )
        storage.prepare()
    }

    fun probe(): Int = asyncLocal("probe") {
        storage.readStatus()
            .put("engineAvailable", EmbeddedNodeHost().available)
            .put("nodeVersion", EmbeddedNodeHost.expectedNodeVersion)
            .toString()
    }

    fun prepare(): Int = asyncLocal("install") {
        storage.prepare()
        storage.readStatus()
            .put("engineAvailable", EmbeddedNodeHost().available)
            .put("nodeVersion", EmbeddedNodeHost.expectedNodeVersion)
            .toString()
    }

    fun start(): Int = serviceCommand("start", BotRuntimeService.ACTION_START)
    fun stop(): Int = serviceCommand("stop", BotRuntimeService.ACTION_STOP)
    fun restart(): Int = serviceCommand("restart", BotRuntimeService.ACTION_RESTART)

    fun update(): Int = asyncFailure(
        kind = "update",
        error = "signed_runtime_update_not_ready",
        detail = "The A/B updater accepts only signed runtime packs; network installation is intentionally disabled.",
    )

    fun logs(): Int = asyncLocal("logs") { storage.readLogs() }

    fun pairStatus(): Int = asyncLocal("pair-status") {
        val status = storage.readStatus()
        JSONObject()
            .put("ok", true)
            .put("state", status.optString("pairState", if (status.optBoolean("paired", false)) "linked" else "idle"))
            .put("qr", status.optString("qr").ifBlank { JSONObject.NULL })
            .put("pairingCode", status.optString("pairingCode").ifBlank { JSONObject.NULL })
            .put("message", status.optString("pairMessage").ifBlank { JSONObject.NULL })
            .toString()
    }

    fun pairCancel(): Int = serviceCommand("pair-cancel", BotRuntimeService.ACTION_PAIR_CANCEL)

    fun pairStart(mode: String, phone: String): Int {
        require(mode == "qr" || mode == "code") { "invalid_pairing_mode" }
        val cleaned = phone.filter(Char::isDigit)
        if (mode == "code") require(cleaned.length in 8..15) { "invalid_phone_number" }
        val action = if (mode == "qr") BotRuntimeService.ACTION_PAIR_QR else BotRuntimeService.ACTION_PAIR_CODE
        return serviceCommand("pair-start", action) {
            putExtra(BotRuntimeService.EXTRA_PHONE, cleaned)
        }
    }

    fun saveConfig(botName: String, prefix: String, language: String): Int {
        val safeName = botName.trim()
        val safePrefix = prefix.trim()
        require(safeName.length in 2..60) { "invalid_bot_name" }
        require(safePrefix.isNotBlank() && safePrefix.length <= 4 && safePrefix.none(Char::isWhitespace)) { "invalid_prefix" }
        require(language == "es" || language == "en") { "invalid_language" }

        return asyncLocal("config-save") {
            storage.saveConfig(safeName, safePrefix, language)
            JSONObject()
                .put("ok", true)
                .put("botName", safeName)
                .put("prefix", safePrefix)
                .put("language", language)
                .toString()
        }
    }

    fun setWebEnabled(enabled: Boolean): Int = asyncLocal("web") {
        JSONObject().put("ok", true).put("webEnabled", false).put("requested", enabled).toString()
    }

    fun close() {
        runCatching { appContext.unregisterReceiver(receiver) }
    }

    private fun serviceCommand(kind: String, action: String, extras: Intent.() -> Unit = {}): Int {
        val requestId = requestCounter.incrementAndGet()
        val intent = Intent(appContext, BotRuntimeService::class.java).apply {
            this.action = action
            putExtra(BotRuntimeService.EXTRA_REQUEST_ID, requestId)
            putExtra(BotRuntimeService.EXTRA_KIND, kind)
            extras()
        }
        if (action == BotRuntimeService.ACTION_START || action == BotRuntimeService.ACTION_RESTART) {
            appContext.startForegroundService(intent)
        } else {
            runCatching { appContext.startService(intent) }
                .onFailure { appContext.startForegroundService(intent) }
        }
        return requestId
    }

    private fun asyncLocal(kind: String, block: () -> String): Int {
        val requestId = requestCounter.incrementAndGet()
        scope.launch {
            runCatching(block)
                .onSuccess { output ->
                    LocalRuntimeEvents.emit(LocalCommandResult(requestId, kind, output, "", 0, 0, ""))
                }
                .onFailure { error ->
                    LocalRuntimeEvents.emit(
                        LocalCommandResult(
                            requestId,
                            kind,
                            "",
                            error.message.orEmpty(),
                            1,
                            1,
                            error.message ?: "native_runtime_failed",
                        ),
                    )
                }
        }
        return requestId
    }

    private fun asyncFailure(kind: String, error: String, detail: String): Int {
        val requestId = requestCounter.incrementAndGet()
        scope.launch {
            LocalRuntimeEvents.emit(LocalCommandResult(requestId, kind, "", detail, 1, 1, error))
        }
        return requestId
    }
}
