package com.ghostnexora.manager

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class PlatformUi(
    val id: String,
    val connected: Boolean,
    val enabled: Boolean,
    val state: String,
    val label: String?,
)

data class LogUi(
    val cursor: String,
    val timestamp: String,
    val level: String,
    val message: String,
)

data class ManagerUiState(
    val baseUrl: String = "",
    val token: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val setupState: String = "checking",
    val localInstalled: Boolean = false,
    val engineAvailable: Boolean = false,
    val runtimeState: String = "offline",
    val uptimeSeconds: Long = 0,
    val botName: String = "Ghost Nexora Bot",
    val prefix: String = ".",
    val language: String = "es",
    val localVersion: String = "",
    val nodeVersion: String = "",
    val installDir: String = "",
    val stateDir: String = "",
    val paired: Boolean = false,
    val webEnabled: Boolean = false,
    val platforms: List<PlatformUi> = emptyList(),
    val logs: List<LogUi> = emptyList(),
    val pairState: String = "idle",
    val qr: String? = null,
    val pairingCode: String? = null,
    val pairMessage: String? = null,
    val remoteConnected: Boolean = false,
)

class ManagerViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SecureTokenStore(application)
    private val localRuntime = NativeRuntimeController(application)
    private val _state = MutableStateFlow(
        ManagerUiState(
            baseUrl = store.baseUrl(),
            token = store.token(),
        ),
    )
    val state: StateFlow<ManagerUiState> = _state.asStateFlow()
    private var pairPollJob: Job? = null

    init {
        viewModelScope.launch {
            LocalRuntimeEvents.results.collect(::handleLocalResult)
        }
        refreshLocalEnvironment()
    }

    override fun onCleared() {
        pairPollJob?.cancel()
        localRuntime.close()
        super.onCleared()
    }

    fun setBaseUrl(value: String) { _state.value = _state.value.copy(baseUrl = value) }
    fun setToken(value: String) { _state.value = _state.value.copy(token = value) }
    fun setBotName(value: String) { _state.value = _state.value.copy(botName = value) }
    fun setPrefix(value: String) { _state.value = _state.value.copy(prefix = value) }
    fun setLanguage(value: String) { _state.value = _state.value.copy(language = value) }

    fun refreshLocalEnvironment() {
        _state.value = _state.value.copy(busy = true, setupState = "checking", error = null)
        dispatchLocal { localRuntime.probe() }
    }

    fun installLocalRuntime() {
        _state.value = _state.value.copy(busy = true, setupState = "preparing", error = null)
        dispatchLocal { localRuntime.prepare() }
    }

    fun runtime(action: String) {
        _state.value = _state.value.copy(busy = true, error = null)
        dispatchLocal {
            when (action) {
                "start" -> localRuntime.start()
                "stop" -> localRuntime.stop()
                "restart" -> localRuntime.restart()
                "update" -> localRuntime.update()
                else -> error("invalid_runtime_action")
            }
        }
    }

    fun refresh() {
        _state.value = _state.value.copy(busy = true, error = null)
        dispatchLocal { localRuntime.probe() }
        dispatchLocal { localRuntime.logs() }
    }

    fun loadLogs() {
        dispatchLocal { localRuntime.logs() }
    }

    fun pair(mode: String, phone: String) {
        pairPollJob?.cancel()
        _state.value = _state.value.copy(
            busy = true,
            error = null,
            pairState = "starting",
            qr = null,
            pairingCode = null,
            pairMessage = null,
        )
        dispatchLocal { localRuntime.pairStart(mode, phone) }
    }

    fun cancelPairing() {
        pairPollJob?.cancel()
        dispatchLocal { localRuntime.pairCancel() }
    }

    fun saveConfig() {
        val current = _state.value
        _state.value = current.copy(busy = true, error = null)
        dispatchLocal { localRuntime.saveConfig(current.botName, current.prefix, current.language) }
    }

    fun requestUpdate() = runtime("update")

    fun connect() = launchRemoteAction(saveConnection = true) {
        client().get("/v2/status")
        _state.value = _state.value.copy(remoteConnected = true)
    }

    fun remoteRuntime(action: String) = launchRemoteAction {
        val safeAction = when (action) {
            "start", "stop", "restart", "update" -> action
            else -> error("invalid_runtime_action")
        }
        client().post("/v2/runtime/$safeAction")
    }

    private fun client(): ControlApiClient = ControlApiClient(_state.value.baseUrl.trim(), _state.value.token.trim())

    private fun dispatchLocal(block: () -> Int) {
        runCatching(block).onFailure { error ->
            _state.value = _state.value.copy(
                busy = false,
                error = error.message ?: "native_runtime_failed",
                setupState = "error",
            )
        }
    }

    private fun handleLocalResult(result: LocalCommandResult) {
        if (!result.successful) {
            if (result.kind.startsWith("pair")) pairPollJob?.cancel()
            _state.value = _state.value.copy(
                busy = false,
                error = listOf(result.errorMessage, result.stderr)
                    .filter { it.isNotBlank() }
                    .joinToString("\n")
                    .ifBlank { "native_runtime_failed" },
                pairState = if (result.kind.startsWith("pair")) "error" else _state.value.pairState,
            )
            return
        }

        when (result.kind) {
            "probe" -> applyProbe(result.stdout)
            "install" -> {
                applyProbe(result.stdout)
                dispatchLocal { localRuntime.logs() }
            }
            "start", "stop", "restart" -> {
                _state.value = _state.value.copy(busy = true, error = null)
                dispatchLocal { localRuntime.probe() }
                dispatchLocal { localRuntime.logs() }
            }
            "logs" -> applyLogs(result.stdout)
            "config-save" -> {
                val json = parseJson(result.stdout)
                _state.value = _state.value.copy(
                    busy = false,
                    error = null,
                    botName = json?.optString("botName", _state.value.botName) ?: _state.value.botName,
                    prefix = json?.optString("prefix", _state.value.prefix) ?: _state.value.prefix,
                    language = json?.optString("language", _state.value.language) ?: _state.value.language,
                )
            }
            "pair-start" -> {
                _state.value = _state.value.copy(busy = false, pairState = "starting")
                schedulePairPoll(500)
            }
            "pair-status" -> applyPairStatus(result.stdout)
            "pair-cancel" -> {
                pairPollJob?.cancel()
                _state.value = _state.value.copy(
                    busy = false,
                    pairState = "idle",
                    qr = null,
                    pairingCode = null,
                    pairMessage = null,
                )
                dispatchLocal { localRuntime.probe() }
            }
        }
    }

    private fun applyProbe(output: String) {
        val json = parseJson(output) ?: run {
            _state.value = _state.value.copy(busy = false, setupState = "error", error = "invalid_local_status")
            return
        }

        val running = json.optBoolean("running", false)
        val whatsappConnected = json.optBoolean("whatsappConnected", false)
        val paired = json.optBoolean("paired", false)
        val installed = json.optBoolean("installed", false)
        val engineAvailable = json.optBoolean("engineAvailable", false)

        _state.value = _state.value.copy(
            busy = false,
            error = null,
            setupState = when {
                installed && engineAvailable -> "ready"
                !engineAvailable -> "engine_missing"
                !installed -> "runtime_missing"
                else -> "ready"
            },
            localInstalled = installed,
            engineAvailable = engineAvailable,
            runtimeState = json.optString("runtimeState", if (running) "starting" else "offline"),
            uptimeSeconds = json.optLong("uptimeSeconds", 0),
            botName = json.optString("botName", _state.value.botName),
            prefix = json.optString("prefix", _state.value.prefix),
            language = json.optString("language", _state.value.language),
            localVersion = json.optString("version", "2.0.0"),
            nodeVersion = json.optString("nodeVersion", EmbeddedNodeHost.expectedNodeVersion),
            installDir = json.optString("installDir"),
            stateDir = json.optString("stateDir"),
            paired = paired,
            webEnabled = false,
            platforms = listOf(
                PlatformUi(
                    id = "whatsapp",
                    connected = whatsappConnected,
                    enabled = true,
                    state = when {
                        whatsappConnected -> "online"
                        paired -> "paired"
                        else -> "unpaired"
                    },
                    label = if (paired) "WhatsApp" else null,
                ),
            ),
        )
    }

    private fun applyLogs(output: String) {
        val rows = output.lineSequence()
            .filter { it.isNotBlank() }
            .takeLastCompat(120)
            .mapIndexed { index, line ->
                val level = when {
                    line.contains("fatal", ignoreCase = true) || line.contains("error", ignoreCase = true) -> "error"
                    line.contains("warn", ignoreCase = true) -> "warn"
                    line.contains("connected", ignoreCase = true) || line.contains("iniciado", ignoreCase = true) -> "success"
                    else -> "info"
                }
                LogUi(index.toString(), "", level, line)
            }
            .toList()
        _state.value = _state.value.copy(logs = rows, busy = false)
    }

    private fun applyPairStatus(output: String) {
        val json = parseJson(output) ?: run {
            _state.value = _state.value.copy(pairState = "error", pairMessage = "invalid_pair_status", busy = false)
            return
        }
        val nextState = json.optString("state", "idle")
        _state.value = _state.value.copy(
            busy = false,
            pairState = nextState,
            qr = json.optString("qr").takeIf { it.isNotBlank() && it != "null" },
            pairingCode = json.optString("pairingCode").takeIf { it.isNotBlank() && it != "null" },
            pairMessage = json.optString("message").takeIf { it.isNotBlank() && it != "null" },
        )
        when (nextState) {
            "starting", "waiting", "accepted" -> schedulePairPoll(1_200)
            "linked" -> {
                pairPollJob?.cancel()
                dispatchLocal { localRuntime.probe() }
            }
            else -> pairPollJob?.cancel()
        }
    }

    private fun schedulePairPoll(delayMs: Long) {
        pairPollJob?.cancel()
        pairPollJob = viewModelScope.launch {
            delay(delayMs)
            dispatchLocal { localRuntime.pairStatus() }
        }
    }

    private fun parseJson(output: String): JSONObject? = output.lineSequence()
        .map(String::trim)
        .filter { it.startsWith("{") && it.endsWith("}") }
        .mapNotNull { runCatching { JSONObject(it) }.getOrNull() }
        .lastOrNull()

    private fun launchRemoteAction(saveConnection: Boolean = false, block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            try {
                withContext(Dispatchers.IO) { block() }
                if (saveConnection) store.save(_state.value.baseUrl.trim(), _state.value.token.trim())
            } catch (error: Throwable) {
                _state.value = _state.value.copy(remoteConnected = false, error = error.message ?: "control_failed")
            } finally {
                _state.value = _state.value.copy(busy = false)
            }
        }
    }
}

private fun Sequence<String>.takeLastCompat(count: Int): Sequence<String> = toList().takeLast(count).asSequence()
