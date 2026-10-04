package com.ghostnexora.manager

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.ArrayDeque

class BotRuntimeService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var storage: RuntimeStorage
    private lateinit var host: EmbeddedNodeHost
    private var runtimeJob: Job? = null
    private var notificationJob: Job? = null
    private var desiredRunning = false
    private var startedAtMillis = 0L
    private val crashTimes = ArrayDeque<Long>()

    override fun onCreate() {
        super.onCreate()
        storage = RuntimeStorage(this)
        host = EmbeddedNodeHost()
        storage.prepare()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            if (storage.readStatus().optBoolean("desiredRunning", false)) {
                ensureForeground()
                startRuntime(-1, "restore")
            }
            return START_STICKY
        }

        val requestId = intent.getIntExtra(EXTRA_REQUEST_ID, -1)
        val kind = intent.getStringExtra(EXTRA_KIND).orEmpty()

        when (intent.action) {
            ACTION_START -> {
                ensureForeground()
                startRuntime(requestId, kind.ifBlank { "start" })
            }
            ACTION_STOP -> stopRuntime(requestId, kind.ifBlank { "stop" }, stopService = true)
            ACTION_RESTART -> {
                ensureForeground()
                restartRuntime(requestId, kind.ifBlank { "restart" })
            }
            ACTION_PAIR_QR, ACTION_PAIR_CODE -> {
                ensureForeground()
                emitFailure(
                    requestId,
                    kind.ifBlank { "pair-start" },
                    "pairing_bridge_pending",
                    "The native service boundary is ready; pairing will be connected to the mobile-lite runtime control channel next.",
                )
            }
            ACTION_PAIR_CANCEL -> {
                storage.updateStatus {
                    it.put("pairState", "idle")
                    it.remove("qr")
                    it.remove("pairingCode")
                    it.remove("pairMessage")
                }
                emitSuccess(requestId, kind.ifBlank { "pair-cancel" }, JSONObject().put("ok", true).toString())
            }
            else -> emitFailure(requestId, kind, "unknown_runtime_action", intent.action.orEmpty())
        }

        return START_STICKY
    }

    override fun onDestroy() {
        host.requestStop()
        runtimeJob?.cancel()
        notificationJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startRuntime(requestId: Int, kind: String) {
        if (runtimeJob?.isActive == true) {
            emitSuccess(requestId, kind, storage.readStatus().toString())
            return
        }

        storage.prepare()
        if (!storage.isRuntimePackInstalled()) {
            val status = storage.updateStatus {
                it.put("running", false)
                it.put("desiredRunning", false)
                it.put("runtimeState", "runtime_missing")
                it.put("engineAvailable", host.available)
                it.put("nodeVersion", host.runtimeVersion)
            }
            emitFailure(requestId, kind, "mobile_runtime_pack_missing", status.toString())
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }

        if (!host.available) {
            val status = storage.updateStatus {
                it.put("running", false)
                it.put("desiredRunning", false)
                it.put("runtimeState", "engine_missing")
                it.put("engineAvailable", false)
                it.put("nodeVersion", EmbeddedNodeHost.expectedNodeVersion)
            }
            emitFailure(requestId, kind, "embedded_node_unavailable", status.toString())
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }

        desiredRunning = true
        startedAtMillis = System.currentTimeMillis()
        storage.updateStatus {
            it.put("running", true)
            it.put("desiredRunning", true)
            it.put("runtimeState", "starting")
            it.put("engineAvailable", true)
            it.put("nodeVersion", host.runtimeVersion)
            it.put("startedAtMillis", startedAtMillis)
            it.put("uptimeSeconds", 0)
        }
        storage.appendLog("info", "Starting Ghost Nexora mobile-lite runtime")
        updateNotification()
        startNotificationTicker()

        runtimeJob = scope.launch {
            val exitCode = runCatching {
                host.start(
                    entryFile = storage.activeEntryFile().absolutePath,
                    stateDir = storage.paths.stateRoot.absolutePath,
                    sessionDir = storage.paths.session.absolutePath,
                    dataDir = storage.paths.data.absolutePath,
                    cacheDir = storage.paths.mediaCache.absolutePath,
                )
            }.getOrElse { error ->
                storage.appendLog("error", "Embedded runtime exception: ${error.message}")
                -1
            }

            val requestedStop = !desiredRunning
            if (requestedStop || exitCode == 0) {
                storage.updateStatus {
                    it.put("running", false)
                    it.put("runtimeState", "offline")
                    it.put("uptimeSeconds", uptimeSeconds())
                }
                updateNotification()
                if (!desiredRunning) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
                return@launch
            }

            storage.appendLog("error", "Embedded runtime exited with code $exitCode")
            registerCrash()
            val canRecover = desiredRunning && crashTimes.size <= MAX_CRASHES
            storage.updateStatus {
                it.put("running", false)
                it.put("runtimeState", if (canRecover) "recovering" else "crash_loop")
                it.put("lastExitCode", exitCode)
                it.put("crashCount", crashTimes.size)
            }
            updateNotification()

            if (canRecover) {
                delay(RESTART_DELAY_MS)
                runtimeJob = null
                startRuntime(-1, "crash-recovery")
            } else {
                desiredRunning = false
                storage.updateStatus { it.put("desiredRunning", false) }
            }
        }

        emitSuccess(requestId, kind, storage.readStatus().toString())
    }

    private fun stopRuntime(requestId: Int, kind: String, stopService: Boolean) {
        desiredRunning = false
        host.requestStop()
        storage.updateStatus {
            it.put("desiredRunning", false)
            it.put("runtimeState", "stopping")
            it.put("uptimeSeconds", uptimeSeconds())
        }
        storage.appendLog("info", "Stopping Ghost Nexora mobile-lite runtime")
        emitSuccess(requestId, kind, storage.readStatus().toString())

        scope.launch {
            delay(500)
            runtimeJob?.cancel()
            runtimeJob = null
            storage.updateStatus {
                it.put("running", false)
                it.put("runtimeState", "offline")
                it.put("uptimeSeconds", uptimeSeconds())
            }
            updateNotification()
            if (stopService) {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
    }

    private fun restartRuntime(requestId: Int, kind: String) {
        desiredRunning = false
        host.requestStop()
        scope.launch {
            delay(600)
            runtimeJob?.cancel()
            runtimeJob = null
            desiredRunning = true
            startRuntime(requestId, kind)
        }
    }

    private fun registerCrash() {
        val now = System.currentTimeMillis()
        crashTimes.addLast(now)
        while (crashTimes.isNotEmpty() && now - crashTimes.first() > CRASH_WINDOW_MS) {
            crashTimes.removeFirst()
        }
    }

    private fun startNotificationTicker() {
        if (notificationJob?.isActive == true) return
        notificationJob = scope.launch {
            while (isActive) {
                updateNotification()
                delay(30_000)
            }
        }
    }

    private fun ensureForeground() {
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val status = storage.readStatus()
        val runtimeState = status.optString("runtimeState", "offline")
        val whatsappConnected = status.optBoolean("whatsappConnected", false)
        val summary = buildString {
            append(if (whatsappConnected) "WhatsApp conectado" else "WhatsApp desconectado")
            if (status.optBoolean("running", false)) append(" · ${formatUptime(uptimeSeconds())}")
        }

        val openIntent = PendingIntent.getActivity(
            this,
            10,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopIntent = PendingIntent.getService(
            this,
            11,
            Intent(this, BotRuntimeService::class.java).setAction(ACTION_STOP)
                .putExtra(EXTRA_REQUEST_ID, -1)
                .putExtra(EXTRA_KIND, "notification-stop"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val restartIntent = PendingIntent.getService(
            this,
            12,
            Intent(this, BotRuntimeService::class.java).setAction(ACTION_RESTART)
                .putExtra(EXTRA_REQUEST_ID, -1)
                .putExtra(EXTRA_KIND, "notification-restart"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_runtime_notification)
            .setContentTitle("Ghost Nexora Bot · ${runtimeState.replaceFirstChar { it.uppercase() }}")
            .setContentText(summary)
            .setContentIntent(openIntent)
            .setOngoing(status.optBoolean("running", false))
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .addAction(Notification.Action.Builder(null, "Detener", stopIntent).build())
            .addAction(Notification.Action.Builder(null, "Reiniciar", restartIntent).build())
            .addAction(Notification.Action.Builder(null, "Abrir", openIntent).build())
            .build()
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Ghost Nexora runtime",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Estado y controles del runtime local de Ghost Nexora Bot"
                setShowBadge(false)
            },
        )
    }

    private fun uptimeSeconds(): Long =
        if (startedAtMillis <= 0L) 0L else ((System.currentTimeMillis() - startedAtMillis) / 1_000L).coerceAtLeast(0L)

    private fun formatUptime(seconds: Long): String {
        val hours = seconds / 3_600
        val minutes = (seconds % 3_600) / 60
        return if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
    }

    private fun emitSuccess(requestId: Int, kind: String, stdout: String) {
        emitResult(requestId, kind, stdout, "", 0, 0, "")
    }

    private fun emitFailure(requestId: Int, kind: String, error: String, detail: String) {
        storage.appendLog("error", "$error: $detail")
        emitResult(requestId, kind, "", detail, 1, 1, error)
    }

    private fun emitResult(
        requestId: Int,
        kind: String,
        stdout: String,
        stderr: String,
        exitCode: Int,
        errorCode: Int,
        errorMessage: String,
    ) {
        sendBroadcast(
            Intent(ACTION_EVENT)
                .setPackage(packageName)
                .putExtra(EXTRA_REQUEST_ID, requestId)
                .putExtra(EXTRA_KIND, kind)
                .putExtra(EXTRA_STDOUT, stdout)
                .putExtra(EXTRA_STDERR, stderr)
                .putExtra(EXTRA_EXIT_CODE, exitCode)
                .putExtra(EXTRA_ERROR_CODE, errorCode)
                .putExtra(EXTRA_ERROR_MESSAGE, errorMessage),
        )
    }

    companion object {
        const val ACTION_EVENT = "com.ghostnexora.manager.runtime.EVENT"
        const val ACTION_START = "com.ghostnexora.manager.runtime.START"
        const val ACTION_STOP = "com.ghostnexora.manager.runtime.STOP"
        const val ACTION_RESTART = "com.ghostnexora.manager.runtime.RESTART"
        const val ACTION_PAIR_QR = "com.ghostnexora.manager.runtime.PAIR_QR"
        const val ACTION_PAIR_CODE = "com.ghostnexora.manager.runtime.PAIR_CODE"
        const val ACTION_PAIR_CANCEL = "com.ghostnexora.manager.runtime.PAIR_CANCEL"

        const val EXTRA_REQUEST_ID = "request_id"
        const val EXTRA_KIND = "kind"
        const val EXTRA_PHONE = "phone"
        const val EXTRA_STDOUT = "stdout"
        const val EXTRA_STDERR = "stderr"
        const val EXTRA_EXIT_CODE = "exit_code"
        const val EXTRA_ERROR_CODE = "error_code"
        const val EXTRA_ERROR_MESSAGE = "error_message"

        private const val CHANNEL_ID = "ghost_nexora_runtime"
        private const val NOTIFICATION_ID = 2107
        private const val MAX_CRASHES = 3
        private const val CRASH_WINDOW_MS = 5 * 60 * 1_000L
        private const val RESTART_DELAY_MS = 2_500L
    }
}
