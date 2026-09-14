package com.ghostnexora.manager.ui

import android.graphics.Bitmap
import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.List
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ghostnexora.manager.LogUi
import com.ghostnexora.manager.ManagerUiState
import com.ghostnexora.manager.ManagerViewModel
import com.ghostnexora.manager.PlatformUi
import com.ghostnexora.manager.R
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

enum class ManagerDestination(@StringRes val labelRes: Int, val icon: ImageVector) {
    Home(R.string.nav_home, Icons.Rounded.Home),
    Pair(R.string.nav_pair, Icons.Rounded.Link),
    Activity(R.string.nav_activity, Icons.Rounded.List),
    Settings(R.string.nav_settings, Icons.Rounded.Settings),
}

@Composable
fun ManagerApp(vm: ManagerViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    var destination by remember { mutableStateOf(ManagerDestination.Home) }

    Scaffold(
        containerColor = GhostBackground,
        bottomBar = {
            NavigationBar(
                modifier = Modifier.navigationBarsPadding(),
                containerColor = GhostSurface.copy(alpha = 0.98f),
                tonalElevation = 0.dp,
            ) {
                ManagerDestination.entries.forEach { item ->
                    NavigationBarItem(
                        selected = destination == item,
                        onClick = { destination = item },
                        icon = { Icon(item.icon, contentDescription = null) },
                        label = { Text(stringResource(item.labelRes)) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color.White,
                            selectedTextColor = Color.White,
                            indicatorColor = GhostPrimary.copy(alpha = 0.24f),
                            unselectedIconColor = GhostTextMuted,
                            unselectedTextColor = GhostTextMuted,
                        ),
                    )
                }
            }
        },
    ) { innerPadding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (destination) {
                ManagerDestination.Home -> HomeScreen(state, vm)
                ManagerDestination.Pair -> PairScreen(state, vm)
                ManagerDestination.Activity -> ActivityScreen(state, vm)
                ManagerDestination.Settings -> SettingsScreen(state, vm)
            }

            if (state.busy) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter),
                    color = GhostPrimarySoft,
                    trackColor = GhostSurfaceSoft,
                )
            }
        }
    }
}

@Composable
private fun HomeScreen(state: ManagerUiState, vm: ManagerViewModel) {
    val runtimeOffline = state.runtimeState == "offline"

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = screenPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = "GHOST NEXORA / V2",
                title = stringResource(R.string.dashboard_title),
                subtitle = stringResource(R.string.dashboard_subtitle),
                connected = state.connected,
                onRefresh = vm::refresh,
                refreshEnabled = state.connected && !state.busy,
            )
        }

        state.error?.let { error ->
            item { ErrorBanner(error) }
        }

        if (!state.connected) {
            item {
                ConnectionCard(
                    state = state,
                    vm = vm,
                    compact = false,
                )
            }
        }

        item {
            RuntimeHeroCard(
                state = state,
                runtimeOffline = runtimeOffline,
                vm = vm,
            )
        }

        item {
            SectionTitle(
                title = stringResource(R.string.platforms),
                subtitle = stringResource(R.string.platforms_subtitle),
            )
        }

        if (state.platforms.isEmpty()) {
            item {
                EmptyStateCard(
                    title = if (state.connected) stringResource(R.string.no_platforms) else stringResource(R.string.connect_to_load),
                    subtitle = stringResource(R.string.platforms_empty_hint),
                )
            }
        } else {
            items(state.platforms, key = { it.id }) { platform ->
                PlatformCard(
                    platform = platform,
                    runtimeOffline = runtimeOffline,
                    busy = state.busy,
                    managerConnected = state.connected,
                    onToggle = { vm.platform(platform.id, !platform.connected) },
                )
            }
        }

        item {
            QuickUpdateCard(
                enabled = state.connected && !state.busy,
                onUpdate = vm::requestUpdate,
            )
        }
    }
}

@Composable
private fun RuntimeHeroCard(
    state: ManagerUiState,
    runtimeOffline: Boolean,
    vm: ManagerViewModel,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = GhostSurfaceElevated),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(GhostBorder)),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.runtime_control),
                        style = MaterialTheme.typography.labelMedium,
                        color = GhostTextMuted,
                    )
                    Text(
                        state.botName,
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
                StatusPill(
                    text = if (runtimeOffline) stringResource(R.string.offline) else stringResource(R.string.online),
                    active = !runtimeOffline,
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Metric(
                    label = stringResource(R.string.status),
                    value = state.runtimeState.replaceFirstChar { it.uppercase() },
                    modifier = Modifier.weight(1f),
                )
                Metric(
                    label = stringResource(R.string.uptime),
                    value = formatUptime(state.uptimeSeconds),
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Button(
                    onClick = { vm.runtime("start") },
                    enabled = state.connected && !state.busy && runtimeOffline,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 13.dp),
                ) {
                    Icon(Icons.Rounded.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(7.dp))
                    Text(stringResource(R.string.start_runtime))
                }
                OutlinedButton(
                    onClick = { vm.runtime("stop") },
                    enabled = state.connected && !state.busy && !runtimeOffline,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 13.dp),
                ) {
                    Icon(Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(7.dp))
                    Text(stringResource(R.string.stop_runtime))
                }
            }

            FilledTonalButton(
                onClick = { vm.runtime("restart") },
                enabled = state.connected && !state.busy && !runtimeOffline,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.restart_runtime))
            }
        }
    }
}

@Composable
private fun PlatformCard(
    platform: PlatformUi,
    runtimeOffline: Boolean,
    busy: Boolean,
    managerConnected: Boolean,
    onToggle: () -> Unit,
) {
    val platformName = platform.id.replaceFirstChar { it.uppercase() }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = GhostSurface),
        shape = RoundedCornerShape(22.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (platform.connected) GhostSuccess.copy(alpha = 0.12f) else GhostSurfaceSoft),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    platformName.take(1),
                    fontWeight = FontWeight.Black,
                    color = if (platform.connected) GhostSuccess else GhostTextMuted,
                )
            }

            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(platformName, style = MaterialTheme.typography.titleMedium)
                Text(
                    platform.label ?: platform.state,
                    style = MaterialTheme.typography.bodySmall,
                    color = GhostTextMuted,
                    maxLines = 1,
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                StatusPill(
                    text = if (platform.connected) stringResource(R.string.online) else stringResource(R.string.offline),
                    active = platform.connected,
                )
                Spacer(Modifier.height(7.dp))
                TextButtonCompact(
                    text = if (platform.connected) stringResource(R.string.disconnect) else stringResource(R.string.connect),
                    enabled = managerConnected && !runtimeOffline && !busy && (platform.enabled || platform.connected),
                    onClick = onToggle,
                )
            }
        }
    }
}

@Composable
private fun PairScreen(state: ManagerUiState, vm: ManagerViewModel) {
    var phone by remember { mutableStateOf("") }
    val runtimeOffline = state.runtimeState == "offline"

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = screenPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = stringResource(R.string.whatsapp),
                title = stringResource(R.string.pairing),
                subtitle = stringResource(R.string.pairing_subtitle),
                connected = state.connected && !runtimeOffline,
            )
        }

        state.error?.let { error -> item { ErrorBanner(error) } }

        item {
            AppCard {
                Text(stringResource(R.string.pairing_method), style = MaterialTheme.typography.titleMedium)
                Text(
                    stringResource(R.string.pairing_method_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = GhostTextMuted,
                    modifier = Modifier.padding(top = 4.dp, bottom = 14.dp),
                )

                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it.filter { char -> char.isDigit() || char == '+' } },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.phone)) },
                    placeholder = { Text("+52 664 000 0000") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                )

                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = { vm.pair("qr", phone) },
                        enabled = state.connected && !runtimeOffline && !state.busy,
                        modifier = Modifier.weight(1f),
                    ) { Text(stringResource(R.string.request_qr)) }
                    FilledTonalButton(
                        onClick = { vm.pair("code", phone) },
                        enabled = state.connected && !runtimeOffline && !state.busy && phone.isNotBlank(),
                        modifier = Modifier.weight(1f),
                    ) { Text(stringResource(R.string.request_code)) }
                }
            }
        }

        if (!state.connected || runtimeOffline) {
            item {
                EmptyStateCard(
                    title = stringResource(R.string.pairing_unavailable),
                    subtitle = stringResource(R.string.pairing_unavailable_hint),
                )
            }
        }

        if (state.pairState != "idle" || state.pairingCode != null || state.qr != null) {
            item {
                PairingResultCard(state)
            }
        }
    }
}

@Composable
private fun PairingResultCard(state: ManagerUiState) {
    AppCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.pairing_session), style = MaterialTheme.typography.titleMedium)
                Text(
                    state.pairState.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.bodySmall,
                    color = GhostPrimarySoft,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
            StatusPill(state.pairState.uppercase(), state.pairState != "error")
        }

        state.pairingCode?.let { code ->
            Spacer(Modifier.height(18.dp))
            Surface(
                color = GhostSurfaceSoft,
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    Modifier.padding(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(stringResource(R.string.pairing_code), style = MaterialTheme.typography.labelMedium, color = GhostTextMuted)
                    Text(
                        code,
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }

        state.qr?.let { raw ->
            remember(raw) { qrBitmap(raw) }?.let { bitmap ->
                Spacer(Modifier.height(18.dp))
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color.White,
                    shape = RoundedCornerShape(22.dp),
                ) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = stringResource(R.string.whatsapp_qr),
                        modifier = Modifier.padding(18.dp).size(240.dp).align(Alignment.CenterHorizontally),
                    )
                }
            }
        }
    }
}

@Composable
private fun ActivityScreen(state: ManagerUiState, vm: ManagerViewModel) {
    val visibleLogs = state.logs.takeLast(80).asReversed()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = screenPadding(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = stringResource(R.string.monitoring),
                title = stringResource(R.string.logs),
                subtitle = stringResource(R.string.logs_subtitle),
                connected = state.connected && state.runtimeState != "offline",
                onRefresh = vm::refresh,
                refreshEnabled = state.connected && !state.busy,
            )
        }

        state.error?.let { error -> item { ErrorBanner(error) } }

        if (visibleLogs.isEmpty()) {
            item {
                EmptyStateCard(
                    title = stringResource(R.string.no_activity),
                    subtitle = if (state.runtimeState == "offline") stringResource(R.string.runtime_offline_logs) else stringResource(R.string.no_activity_hint),
                )
            }
        } else {
            items(visibleLogs, key = { it.cursor }) { row ->
                LogRow(row)
            }
        }
    }
}

@Composable
private fun LogRow(row: LogUi) {
    val accent = when (row.level.lowercase()) {
        "error" -> GhostDanger
        "warn", "warning" -> GhostWarning
        "success", "ok" -> GhostSuccess
        else -> GhostCyan
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = GhostSurface),
        shape = RoundedCornerShape(18.dp),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .padding(top = 5.dp)
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(accent),
            )
            Column(Modifier.padding(start = 11.dp).weight(1f)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        row.level.uppercase(),
                        color = accent,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                    )
                    if (row.timestamp.isNotBlank()) {
                        Text(row.timestamp.takeLast(8), color = GhostTextSubtle, style = MaterialTheme.typography.labelSmall)
                    }
                }
                Text(
                    row.message,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFFD8DDEA),
                    modifier = Modifier.padding(top = 5.dp),
                )
            }
        }
    }
}

@Composable
private fun SettingsScreen(state: ManagerUiState, vm: ManagerViewModel) {
    val runtimeOffline = state.runtimeState == "offline"

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = screenPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = "MANAGER",
                title = stringResource(R.string.settings),
                subtitle = stringResource(R.string.settings_subtitle),
                connected = state.connected,
            )
        }

        state.error?.let { error -> item { ErrorBanner(error) } }

        item {
            SectionTitle(stringResource(R.string.bot_configuration), stringResource(R.string.bot_configuration_hint))
        }

        item {
            AppCard {
                OutlinedTextField(
                    value = state.botName,
                    onValueChange = vm::setBotName,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.bot_name)) },
                    singleLine = true,
                    enabled = state.connected && !runtimeOffline,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.prefix,
                    onValueChange = vm::setPrefix,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.command_prefix)) },
                    singleLine = true,
                    enabled = state.connected && !runtimeOffline,
                )

                Spacer(Modifier.height(14.dp))
                Text(stringResource(R.string.language), style = MaterialTheme.typography.labelMedium, color = GhostTextMuted)
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(
                        selected = state.language == "es",
                        onClick = { vm.setLanguage("es") },
                        enabled = state.connected && !runtimeOffline,
                        label = { Text("Español") },
                    )
                    FilterChip(
                        selected = state.language == "en",
                        onClick = { vm.setLanguage("en") },
                        enabled = state.connected && !runtimeOffline,
                        label = { Text("English") },
                    )
                }

                Spacer(Modifier.height(14.dp))
                Button(
                    onClick = vm::saveConfig,
                    enabled = state.connected && !runtimeOffline && !state.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Rounded.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.save))
                }
            }
        }

        item {
            SectionTitle(stringResource(R.string.manager_connection), stringResource(R.string.manager_connection_hint))
        }

        item {
            ConnectionCard(state = state, vm = vm, compact = true)
        }

        item {
            AppCard {
                Text(stringResource(R.string.security_note), style = MaterialTheme.typography.titleMedium)
                Text(
                    stringResource(R.string.remote_https),
                    color = GhostTextMuted,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 6.dp),
                )
                HorizontalDivider(Modifier.padding(vertical = 12.dp), color = GhostBorder)
                Text(stringResource(R.string.remote_only), color = GhostTextMuted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun ConnectionCard(state: ManagerUiState, vm: ManagerViewModel, compact: Boolean) {
    AppCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.manager_connection), style = MaterialTheme.typography.titleMedium)
                Text(
                    if (state.connected) stringResource(R.string.manager_connected) else stringResource(R.string.manager_disconnected),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (state.connected) GhostSuccess else GhostTextMuted,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
            StatusPill(
                text = if (state.connected) stringResource(R.string.connected) else stringResource(R.string.disconnected),
                active = state.connected,
            )
        }

        Spacer(Modifier.height(if (compact) 14.dp else 18.dp))
        OutlinedTextField(
            value = state.baseUrl,
            onValueChange = vm::setBaseUrl,
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.server_url)) },
            placeholder = { Text("https://host/manager") },
            singleLine = true,
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = state.token,
            onValueChange = vm::setToken,
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.access_token)) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        Spacer(Modifier.height(14.dp))
        Button(
            onClick = vm::connect,
            enabled = !state.busy && state.baseUrl.isNotBlank() && state.token.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (state.connected) stringResource(R.string.reconnect) else stringResource(R.string.connect))
        }
    }
}

@Composable
private fun QuickUpdateCard(enabled: Boolean, onUpdate: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = GhostPrimary.copy(alpha = 0.11f)),
        shape = RoundedCornerShape(22.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.update_runtime), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.update_runtime_hint), color = GhostTextMuted, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.width(12.dp))
            FilledTonalButton(onClick = onUpdate, enabled = enabled) {
                Text(stringResource(R.string.update))
            }
        }
    }
}

@Composable
private fun ScreenHeader(
    eyebrow: String,
    title: String,
    subtitle: String,
    connected: Boolean,
    onRefresh: (() -> Unit)? = null,
    refreshEnabled: Boolean = true,
) {
    Column(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp, bottom = 6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(eyebrow, style = MaterialTheme.typography.labelSmall, color = GhostPrimarySoft)
                Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 5.dp))
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = GhostTextMuted, modifier = Modifier.padding(top = 4.dp))
            }
            if (onRefresh != null) {
                IconButton(onClick = onRefresh, enabled = refreshEnabled) {
                    Icon(Icons.Rounded.Refresh, contentDescription = stringResource(R.string.refresh), tint = if (refreshEnabled) Color.White else GhostTextSubtle)
                }
            } else {
                Box(Modifier.padding(top = 2.dp)) {
                    StatusDot(active = connected)
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Column(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 2.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 3.dp))
    }
}

@Composable
private fun AppCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = GhostSurface),
    ) {
        Column(Modifier.padding(16.dp), content = content)
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = GhostSurfaceSoft,
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = GhostTextMuted)
            Text(value, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 5.dp), maxLines = 1)
        }
    }
}

@Composable
private fun StatusPill(text: String, active: Boolean) {
    Surface(
        color = if (active) GhostSuccess.copy(alpha = 0.13f) else GhostSurfaceSoft,
        shape = RoundedCornerShape(100.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (active) GhostSuccess else GhostTextSubtle),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text,
                style = MaterialTheme.typography.labelSmall,
                color = if (active) GhostSuccess else GhostTextMuted,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun StatusDot(active: Boolean) {
    Surface(color = GhostSurface, shape = CircleShape) {
        Box(Modifier.padding(11.dp)) {
            Box(
                Modifier
                    .size(9.dp)
                    .clip(CircleShape)
                    .background(if (active) GhostSuccess else GhostTextSubtle),
            )
        }
    }
}

@Composable
private fun TextButtonCompact(text: String, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        contentPadding = PaddingValues(horizontal = 11.dp, vertical = 3.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun ErrorBanner(error: String) {
    AnimatedVisibility(visible = error.isNotBlank()) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = GhostDanger.copy(alpha = 0.10f),
            shape = RoundedCornerShape(18.dp),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(stringResource(R.string.connection_error), color = GhostDanger, style = MaterialTheme.typography.labelMedium)
                Text(error, color = Color(0xFFFFC6CD), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 3.dp))
            }
        }
    }
}

@Composable
private fun EmptyStateCard(title: String, subtitle: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = GhostSurface,
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(Modifier.padding(18.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 5.dp))
        }
    }
}

private fun screenPadding() = PaddingValues(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 28.dp)

private fun formatUptime(seconds: Long): String {
    if (seconds <= 0) return "—"
    val days = seconds / 86_400
    val hours = (seconds % 86_400) / 3_600
    val minutes = (seconds % 3_600) / 60
    return when {
        days > 0 -> "${days}d ${hours}h"
        hours > 0 -> "${hours}h ${minutes}m"
        else -> "${minutes}m"
    }
}

private fun qrBitmap(value: String): Bitmap? = runCatching {
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 640, 640)
    Bitmap.createBitmap(640, 640, Bitmap.Config.ARGB_8888).apply {
        for (x in 0 until 640) {
            for (y in 0 until 640) {
                setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            }
        }
    }
}.getOrNull()
