package com.ghostnexora.manager

import android.graphics.Bitmap
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val colors = darkColorScheme(
                primary = Color(0xFF3B82F6),
                background = Color(0xFF070708),
                surface = Color(0xFF111114),
                surfaceVariant = Color(0xFF18181B),
                onBackground = Color(0xFFF4F4F5),
                onSurface = Color(0xFFF4F4F5),
            )
            MaterialTheme(colorScheme = colors) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    ManagerScreen(viewModel())
                }
            }
        }
    }
}

@Composable
private fun ManagerScreen(vm: ManagerViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    var phone by remember { mutableStateOf("") }
    val scroll = rememberScrollState()

    Column(
        Modifier.fillMaxSize().verticalScroll(scroll).padding(horizontal = 18.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("NEXORA / V2", color = Color(0xFF60A5FA), style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace)
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
        Text(stringResource(R.string.subtitle), color = Color(0xFFA1A1AA))

        ManagerCard {
            OutlinedTextField(state.baseUrl, vm::setBaseUrl, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.server_url)) }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(state.token, vm::setToken, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.access_token)) }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation())
            Spacer(Modifier.height(12.dp))
            Button(onClick = vm::connect, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.connect)) }
            Spacer(Modifier.height(9.dp))
            Text(stringResource(R.string.remote_https), color = Color(0xFF71717A), style = MaterialTheme.typography.bodySmall)
            Text(stringResource(R.string.remote_only), color = Color(0xFF71717A), style = MaterialTheme.typography.bodySmall)
            state.error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = Color(0xFFFDA4AF), style = MaterialTheme.typography.bodySmall) }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatCard(stringResource(R.string.status), state.runtimeState, Modifier.weight(1f))
            StatCard("Uptime", "${state.uptimeSeconds / 60} min", Modifier.weight(1f))
        }

        ManagerCard {
            Header(stringResource(R.string.platforms))
            if (state.platforms.isEmpty()) Text("—", color = Color(0xFF71717A))
            state.platforms.forEach { platform ->
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(platform.id.replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.Bold)
                        Text(platform.label ?: platform.state, color = Color(0xFF71717A), style = MaterialTheme.typography.bodySmall)
                    }
                    Text(if (platform.connected) "ONLINE" else "OFFLINE", color = if (platform.connected) Color(0xFF86EFAC) else Color(0xFFA1A1AA), style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.width(8.dp))
                    FilledTonalButton(onClick = { vm.platform(platform.id, !platform.connected) }, enabled = !state.busy && (platform.enabled || platform.connected)) {
                        Text(if (platform.connected) stringResource(R.string.disconnect) else stringResource(R.string.connect))
                    }
                }
            }
        }

        ManagerCard {
            Header(stringResource(R.string.pairing))
            OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.phone)) }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { vm.pair("qr", phone) }, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.request_qr)) }
                FilledTonalButton(onClick = { vm.pair("code", phone) }, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.request_code)) }
            }
            if (state.pairState != "idle") {
                Spacer(Modifier.height(12.dp)); Text(state.pairState.uppercase(), color = Color(0xFF93C5FD), style = MaterialTheme.typography.labelSmall)
            }
            state.pairingCode?.let { Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 10.dp)) }
            state.qr?.let { raw ->
                remember(raw) { qrBitmap(raw) }?.let { bitmap ->
                    Spacer(Modifier.height(12.dp)); Image(bitmap.asImageBitmap(), contentDescription = "WhatsApp QR", modifier = Modifier.size(220.dp).align(Alignment.CenterHorizontally))
                }
            }
        }

        ManagerCard {
            Header(stringResource(R.string.settings))
            OutlinedTextField(state.botName, vm::setBotName, Modifier.fillMaxWidth(), label = { Text("Bot") }, singleLine = true)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.prefix, vm::setPrefix, Modifier.fillMaxWidth(), label = { Text("Prefix") }, singleLine = true)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = state.language == "es", onClick = { vm.setLanguage("es") }, label = { Text("Español") })
                FilterChip(selected = state.language == "en", onClick = { vm.setLanguage("en") }, label = { Text("English") })
            }
            Spacer(Modifier.height(10.dp))
            Button(onClick = vm::saveConfig, enabled = state.connected && !state.busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.save)) }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = vm::requestUpdate, enabled = state.connected && !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Runtime update") }
        }

        ManagerCard {
            Header(stringResource(R.string.logs))
            if (state.logs.isEmpty()) Text("—", color = Color(0xFF71717A))
            state.logs.takeLast(50).forEach { row ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(row.level.uppercase(), color = when (row.level) { "error" -> Color(0xFFFDA4AF); "warn" -> Color(0xFFFDE68A); else -> Color(0xFF93C5FD) }, style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace)
                    Text(row.message, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = Color(0xFFD4D4D8))
                }
            }
        }

        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun ManagerCard(content: @Composable ColumnScope.() -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF111114)), shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), content = content)
    }
}

@Composable private fun Header(text: String) { Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)) }

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = Color(0xFF111114)), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(15.dp)) { Text(label, color = Color(0xFF71717A), style = MaterialTheme.typography.labelSmall); Text(value, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp)) }
    }
}

private fun qrBitmap(value: String): Bitmap? = runCatching {
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 640, 640)
    Bitmap.createBitmap(640, 640, Bitmap.Config.ARGB_8888).apply {
        for (x in 0 until 640) for (y in 0 until 640) setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
    }
}.getOrNull()
