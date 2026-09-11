package com.ghostnexora.manager

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class PlatformUi(val id: String, val connected: Boolean, val enabled: Boolean, val state: String, val label: String?)
data class LogUi(val cursor: String, val timestamp: String, val level: String, val message: String)

data class ManagerUiState(
    val baseUrl: String = "",
    val token: String = "",
    val busy: Boolean = false,
    val connected: Boolean = false,
    val error: String? = null,
    val runtimeState: String = "offline",
    val uptimeSeconds: Long = 0,
    val botName: String = "Ghost Nexora Bot",
    val prefix: String = ".",
    val language: String = "es",
    val platforms: List<PlatformUi> = emptyList(),
    val logs: List<LogUi> = emptyList(),
    val pairState: String = "idle",
    val qr: String? = null,
    val pairingCode: String? = null,
)

class ManagerViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SecureTokenStore(application)
    private val _state = MutableStateFlow(ManagerUiState(baseUrl = store.baseUrl(), token = store.token()))
    val state: StateFlow<ManagerUiState> = _state.asStateFlow()

    fun setBaseUrl(value: String) { _state.value = _state.value.copy(baseUrl = value) }
    fun setToken(value: String) { _state.value = _state.value.copy(token = value) }
    fun setBotName(value: String) { _state.value = _state.value.copy(botName = value) }
    fun setPrefix(value: String) { _state.value = _state.value.copy(prefix = value) }
    fun setLanguage(value: String) { _state.value = _state.value.copy(language = value) }

    private fun client(): ControlApiClient = ControlApiClient(_state.value.baseUrl.trim(), _state.value.token.trim())

    fun connect() = launchAction(saveConnection = true) { refreshInternal(client()) }
    fun refresh() = launchAction { refreshInternal(client()) }

    fun runtime(action: String) = launchAction {
        val safeAction = when (action) {
            "start", "stop", "restart", "update" -> action
            else -> error("invalid_runtime_action")
        }
        val result = client().post("/v2/runtime/$safeAction")
        if (!result.optBoolean("accepted", false) && result.optBoolean("managerRequired", false)) {
            error("manager_agent_required")
        }
        refreshInternal(client())
    }

    fun platform(id: String, connect: Boolean) = launchAction {
        val safeId = when (id) { "whatsapp", "telegram", "discord" -> id; else -> error("invalid_platform") }
        client().post("/v2/platforms/$safeId/${if (connect) "connect" else "disconnect"}")
        refreshInternal(client())
    }

    fun pair(mode: String, phone: String) = launchAction {
        val payload = JSONObject().put("platform", "whatsapp").put("mode", mode)
        if (mode == "code") payload.put("phoneNumber", phone)
        val result = client().post("/v2/pair/start", payload)
        _state.value = _state.value.copy(
            pairState = result.optString("state", "waiting"),
            qr = result.optString("qr").takeIf { it.isNotBlank() && it != "null" },
            pairingCode = result.optString("pairingCode").takeIf { it.isNotBlank() && it != "null" },
        )
    }

    fun saveConfig() = launchAction {
        val current = _state.value
        val payload = JSONObject()
            .put("botName", current.botName)
            .put("prefix", current.prefix)
            .put("language", current.language)
        client().patch("/v2/config", payload)
        refreshInternal(client())
    }

    fun requestUpdate() = runtime("update")

    private fun launchAction(saveConnection: Boolean = false, block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            try {
                withContext(Dispatchers.IO) { block() }
                if (saveConnection) store.save(_state.value.baseUrl.trim(), _state.value.token.trim())
            } catch (error: Throwable) {
                _state.value = _state.value.copy(error = error.message ?: "control_failed")
            } finally {
                _state.value = _state.value.copy(busy = false)
            }
        }
    }

    private fun refreshInternal(api: ControlApiClient) {
        val status = api.get("/v2/status")
        val runtime = status.getJSONObject("runtime")
        val platformRows = status.optJSONArray("platforms") ?: JSONArray()
        val runtimeState = runtime.optString("state", "offline")

        _state.value = _state.value.copy(
            connected = true,
            runtimeState = runtimeState,
            uptimeSeconds = runtime.optLong("uptimeSeconds", 0),
            botName = runtime.optString("botName", _state.value.botName),
            prefix = runtime.optString("prefix", _state.value.prefix),
            platforms = List(platformRows.length()) { index ->
                val item = platformRows.getJSONObject(index)
                PlatformUi(item.getString("id"), item.optBoolean("connected"), item.optBoolean("enabled"), item.optString("state"), item.optString("accountLabel").takeIf { it.isNotBlank() && it != "null" })
            },
            logs = if (runtimeState == "offline") emptyList() else _state.value.logs,
        )

        if (runtimeState == "offline") return

        val config = runCatching { api.get("/v2/config").getJSONObject("config") }.getOrNull()
        val logs = runCatching { api.get("/v2/logs").optJSONArray("entries") ?: JSONArray() }.getOrNull()

        _state.value = _state.value.copy(
            botName = config?.optString("botName", _state.value.botName) ?: _state.value.botName,
            prefix = config?.optString("prefix", _state.value.prefix) ?: _state.value.prefix,
            language = config?.optString("language", _state.value.language) ?: _state.value.language,
            logs = logs?.let { rows ->
                List(rows.length()) { index ->
                    val item = rows.getJSONObject(index)
                    LogUi(item.optString("cursor", index.toString()), item.optString("timestamp"), item.optString("level"), item.optString("message"))
                }
            } ?: _state.value.logs,
        )
    }
}
