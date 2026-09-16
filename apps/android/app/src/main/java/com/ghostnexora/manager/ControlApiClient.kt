package com.ghostnexora.manager

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

class ControlApiClient(private val baseUrl: String, private val token: String) {
    init {
        require(token.length >= 12) { "invalid_token" }
        validateBaseUrl(baseUrl)
    }

    fun get(path: String): JSONObject = request("GET", path, null)
    fun post(path: String, body: JSONObject? = null): JSONObject = request("POST", path, body)
    fun patch(path: String, body: JSONObject): JSONObject = request("PATCH", path, body)

    private fun request(method: String, path: String, body: JSONObject?): JSONObject {
        require(path == "/health" || path.startsWith("/v2/")) { "unsupported_control_path" }
        require(!path.contains("..") && !path.contains('\n') && !path.contains('\r')) { "invalid_control_path" }
        val url = URL(baseUrl.trimEnd('/') + path)
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 25_000
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "GhostNexoraAndroid/0.1")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        if (text.isBlank()) throw IllegalStateException("empty_control_response")
        val json = JSONObject(text)
        if (json.optBoolean("ok", true).not()) throw IllegalStateException(json.optString("error", "control_failed"))
        return json
    }

    companion object {
        fun validateBaseUrl(raw: String) {
            val uri = URI(raw)
            require(uri.scheme == "http" || uri.scheme == "https") { "unsupported_protocol" }
            val host = uri.host?.lowercase().orEmpty()
            val local = host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "::1"
            require(uri.scheme == "https" || (local && uri.scheme == "http")) { "https_required_for_remote_control" }
            require(uri.userInfo == null && uri.query == null && uri.fragment == null) { "invalid_base_url" }
        }
    }
}
