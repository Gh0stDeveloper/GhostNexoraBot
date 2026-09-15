package com.ghostnexora.manager.ui

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.material3.Switch
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ghostnexora.manager.LocalRuntimeBridge
import com.ghostnexora.manager.LogUi
import com.ghostnexora.manager.ManagerUiState
import com.ghostnexora.manager.ManagerViewModel
import com.ghostnexora.manager.PlatformUi
import com.ghostnexora.manager.R
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

private enum class ManagerDestination(@StringRes val labelRes: Int, val icon: ImageVector) {
    Home(R.string.nav_home, Icons.Rounded.Home),
    Pair(R.string.nav_pair, Icons.Rounded.Link),
    Activity(R.string.nav_activity, Icons.Rounded.List),
    Settings(R.string.nav_settings, Icons.Rounded.Settings),
}

@Composable
fun ManagerApp(vm: ManagerViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    var destination by remember { mutableStateOf(ManagerDestination.Home) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { vm.refreshLocalEnvironment() }

    Scaffold(
        containerColor = GhostBackground,
        bottomBar = {
            NavigationBar(
                modifier = Modifier.navigationBarsPadding(),
                containerColor = GhostSurface,
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
        Box(Modifier.fillMaxSize().padding(innerPadding)) {
            when (destination) {
                ManagerDestination.Home -> HomeScreen(
                    state = state,
                    vm = vm,
                    onRequestPermission = {
                        permissionLauncher.launch(LocalRuntimeBridge.RUN_COMMAND_PERMISSION)
                    },
                )
                ManagerDestination.Pair -> PairScreen(state, vm)
                ManagerDestination.Activity -> ActivityScreen(state, vm)
                ManagerDestination.Settings -> SettingsScreen(
                    state = state,
                    vm = vm,
                    onRequestPermission = {
                        permissionLauncher.launch(LocalRuntimeBridge.RUN_COMMAND_PERMISSION)
                    },
                )
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
private fun HomeScreen(
    state: ManagerUiState,
    vm: ManagerViewModel,
    onRequestPermission: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = screenPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = "GHOST NEXORA / LOCAL",
                title = stringResource(R.string.dashboard_title),
                subtitle = stringResource(R.string.dashboard_subtitle),
                connected = state.localInstalled && state.runtimeState != "offline",
                onRefresh = vm::refresh,
                refreshEnabled = !state.busy,
            )
        }

        state.error?.let { error -> item { ErrorBanner(error) } }

        if (!state.localInstalled) {
            item { SetupCard(state, vm, onRequestPermission) }
        } else {
            item { RuntimeHeroCard(state, vm) }
            item { LocalEnvironmentCard(state) }

            item {
                SectionTitle(
                    stringResource(R.string.platforms),
                    stringResource(R.string.platforms_subtitle),
                )
            }

            if (state.platforms.isEmpty()) {
                item {
                    EmptyStateCard(
                        stringResource(R.string.no_platforms),
                        stringResource(R.string.platforms_empty_hint),
                    )
                }
            } else {
                items(state.platforms, key = { it.id }) { platform ->
                    PlatformCard(platform)
                }
            }

            item {
                QuickUpdateCard(
                    enabled = !state.busy,
                    onUpdate = vm::requestUpdate,
                )
            }
        }
    }
}

@Composable
private fun SetupCard(
    state: ManagerUiState,
    vm: ManagerViewModel,
    onRequestPermission: () -> Unit,
) {
    val title: String
    val body: String
    when (state.setupState) {
        "termux_missing" -> {
            title = stringResource(R.string.termux_missing)
            body = stringResource(R.string.termux_missing_hint)
        }
        "permission_required" -> {
            title = stringResource(R.string.permission_required)
            body = stringResource(R.string.permission_required_hint)
        }
        "termux_configuration_required" -> {
            title = stringResource(R.string.termux_configuration_required)
            body = stringResource(R.string.termux_configuration_hint)
        }
        "installing" -> {
            title = stringResource(R.string.installing_runtime)
            body = stringResource(R.string.installing_runtime_hint)
        }
        "checking" -> {
            title = stringResource(R.string.local_engine)
            body = stringResource(R.string.local_engine_subtitle)
        }
        else -> {
            title = stringResource(R.string.runtime_not_installed)
            body = stringResource(R.string.runtime_not_installed_hint)
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = GhostSurfaceElevated),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(GhostPrimary.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("GN", fontWeight = FontWeight.Black, color = GhostPrimarySoft)
                }
                Column(Modifier.weight(1f).padding(start = 13.dp)) {
                    Text(title, style = MaterialTheme.typography.titleLarge)
                    Text(body, style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 4.dp))
                }
            }

            if (state.setupState == "installing" || state.setupState == "checking") {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = GhostPrimarySoft,
                    trackColor = GhostSurfaceSoft,
                )
            }

            when (state.setupState) {
                "termux_missing" -> Button(
                    onClick = vm::openTermuxDownload,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(stringResource(R.string.download_termux)) }

                "permission_required" -> {
                    Button(
                        onClick = onRequestPermission,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.grant_permission)) }
                    OutlinedButton(
                        onClick = vm::openPermissionSettings,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.open_app_settings)) }
                }

                "termux_configuration_required" -> {
                    Button(onClick = vm::openTermux, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.open_termux))
                    }
                    OutlinedButton(onClick = vm::refreshLocalEnvironment, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.retry_check))
                    }
                }

                "checking", "installing" -> Unit

                else -> Button(
                    onClick = vm::installLocalRuntime,
                    enabled = state.termuxInstalled && state.termuxPermissionGranted && !state.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(stringResource(R.string.install_runtime)) }
            }

            Surface(
                color = GhostSurfaceSoft,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(14.dp)) {
                    Text(stringResource(R.string.local_security), style = MaterialTheme.typography.labelLarge)
                    Text(
                        stringResource(R.string.local_security_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = GhostTextMuted,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RuntimeHeroCard(state: ManagerUiState, vm: ManagerViewModel) {
    val offline = state.runtimeState == "offline"
    val active = state.runtimeState == "online"
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = GhostSurfaceElevated),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.local_runtime), style = MaterialTheme.typography.labelMedium, color = GhostPrimarySoft)
                    Text(state.botName, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 3.dp))
                }
                StatusPill(
                    text = when {
                        active -> stringResource(R.string.online)
                        offline -> stringResource(R.string.offline)
                        else -> stringResource(R.string.starting)
                    },
                    active = active,
                )
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Metric(stringResource(R.string.status), state.runtimeState.uppercase(), Modifier.weight(1f))
                Metric(stringResource(R.string.uptime), formatUptime(state.uptimeSeconds), Modifier.weight(1f))
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { vm.runtime("start") },
                    enabled = !state.busy && offline,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 13.dp),
                ) {
                    Icon(Icons.Rounded.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(7.dp))
                    Text(stringResource(R.string.start_runtime))
                }
                OutlinedButton(
                    onClick = { vm.runtime("stop") },
                    enabled = !state.busy && !offline,
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
                enabled = !state.busy && !offline,
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
private fun LocalEnvironmentCard(state: ManagerUiState) {
    AppCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Metric(
                stringResource(R.string.runtime_version),
                state.localVersion.ifBlank { "2.0.0" },
                Modifier.weight(1f),
            )
            Metric(
                stringResource(R.string.node_version),
                state.nodeVersion.ifBlank { "—" },
                Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Metric(
                stringResource(R.string.whatsapp),
                if (state.paired) stringResource(R.string.paired) else stringResource(R.string.not_paired),
                Modifier.weight(1f),
            )
            Metric(
                stringResource(R.string.local_web),
                if (state.webEnabled) "ON" else "OFF",
                Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun PlatformCard(platform: PlatformUi) {
    val platformName = platform.id.replaceFirstChar { it.uppercase() }
    AppCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
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
                    when (platform.state) {
                        "paired" -> stringResource(R.string.paired)
                        "unpaired" -> stringResource(R.string.not_paired)
                        else -> platform.state.uppercase()
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = GhostTextMuted,
                )
            }
            StatusPill(
                if (platform.connected) stringResource(R.string.online) else stringResource(R.string.offline),
                platform.connected,
            )
        }
    }
}

@Composable
private fun PairScreen(state: ManagerUiState, vm: ManagerViewModel) {
    var phone by remember { mutableStateOf("") }
    val pairActive = state.pairState in setOf("starting", "waiting", "accepted")

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
                connected = state.paired,
            )
        }

        state.error?.let { error -> item { ErrorBanner(error) } }

        if (!state.localInstalled) {
            item {
                EmptyStateCard(
                    stringResource(R.string.pairing_unavailable),
                    stringResource(R.string.pairing_unavailable_hint),
                )
            }
        } else {
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
                        onValueChange = { phone = it.filter { char -> char.isDigit() || char == '+' || char == ' ' } },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.phone)) },
                        placeholder = { Text("+52 664 000 0000") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        enabled = !pairActive,
                    )

                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { vm.pair("qr", phone) },
                            enabled = !state.busy && !pairActive,
                            modifier = Modifier.weight(1f),
                        ) { Text(stringResource(R.string.request_qr)) }
                        FilledTonalButton(
                            onClick = { vm.pair("code", phone) },
                            enabled = !state.busy && !pairActive && phone.filter(Char::isDigit).length in 8..15,
                            modifier = Modifier.weight(1f),
                        ) { Text(stringResource(R.string.request_code)) }
                    }

                    if (pairActive) {
                        Spacer(Modifier.height(10.dp))
                        OutlinedButton(onClick = vm::cancelPairing, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.cancel_pairing))
                        }
                    }
                }
            }

            if (state.pairState != "idle" || state.pairingCode != null || state.qr != null) {
                item { PairingResultCard(state) }
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
                    state.pairState.uppercase(),
                    style = MaterialTheme.typography.bodySmall,
                    color = GhostPrimarySoft,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
            StatusPill(state.pairState.uppercase(), state.pairState == "linked")
        }

        state.pairMessage?.let { message ->
            Text(message, style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 12.dp))
        }

        state.pairingCode?.let { code ->
            Spacer(Modifier.height(18.dp))
            Surface(color = GhostSurfaceSoft, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
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
                Surface(color = Color.White, shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(18.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = stringResource(R.string.whatsapp_qr),
                            modifier = Modifier.size(240.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ActivityScreen(state: ManagerUiState, vm: ManagerViewModel) {
    val visibleLogs = state.logs.takeLast(120).asReversed()

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
                connected = state.localInstalled && state.runtimeState != "offline",
                onRefresh = vm::loadLogs,
                refreshEnabled = state.localInstalled && !state.busy,
            )
        }

        state.error?.let { error -> item { ErrorBanner(error) } }

        if (!state.localInstalled) {
            item { EmptyStateCard(stringResource(R.string.connect_to_load), stringResource(R.string.setup_required)) }
        } else if (visibleLogs.isEmpty()) {
            item { EmptyStateCard(stringResource(R.string.no_activity), stringResource(R.string.no_activity_hint)) }
        } else {
            items(visibleLogs, key = { "${it.cursor}-${it.message.hashCode()}" }) { log -> LogRow(log) }
        }
    }
}

@Composable
private fun SettingsScreen(
    state: ManagerUiState,
    vm: ManagerViewModel,
    onRequestPermission: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = screenPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = "GHOST NEXORA",
                title = stringResource(R.string.settings),
                subtitle = stringResource(R.string.settings_subtitle),
                connected = state.localInstalled,
            )
        }

        state.error?.let { error -> item { ErrorBanner(error) } }

        item {
            AppCard {
                Text(stringResource(R.string.local_engine), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.local_engine_subtitle), style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 4.dp))
                Spacer(Modifier.height(14.dp))
                InfoLine("Termux", if (state.termuxInstalled) "OK" else "—")
                InfoLine("RUN_COMMAND", if (state.termuxPermissionGranted) "OK" else "—")
                InfoLine(stringResource(R.string.runtime_version), state.localVersion.ifBlank { "—" })
                InfoLine(stringResource(R.string.node_version), state.nodeVersion.ifBlank { "—" })
                Spacer(Modifier.height(12.dp))
                if (!state.termuxInstalled) {
                    Button(onClick = vm::openTermuxDownload, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.download_termux))
                    }
                } else if (!state.termuxPermissionGranted) {
                    Button(onClick = onRequestPermission, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.grant_permission))
                    }
                } else {
                    OutlinedButton(onClick = vm::openTermux, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.open_termux))
                    }
                }
            }
        }

        if (state.localInstalled) {
            item {
                AppCard {
                    Text(stringResource(R.string.bot_configuration), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.bot_configuration_hint), style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 4.dp, bottom = 14.dp))
                    OutlinedTextField(
                        value = state.botName,
                        onValueChange = vm::setBotName,
                        label = { Text(stringResource(R.string.bot_name)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = state.prefix,
                        onValueChange = vm::setPrefix,
                        label = { Text(stringResource(R.string.command_prefix)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.language), style = MaterialTheme.typography.labelMedium, color = GhostTextMuted)
                    Row(Modifier.padding(top = 7.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = state.language == "es",
                            onClick = { vm.setLanguage("es") },
                            label = { Text("Español") },
                        )
                        FilterChip(
                            selected = state.language == "en",
                            onClick = { vm.setLanguage("en") },
                            label = { Text("English") },
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = vm::saveConfig, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Rounded.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.save))
                    }
                }
            }

            item {
                AppCard {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(R.string.local_web), style = MaterialTheme.typography.titleMedium)
                            Text(
                                stringResource(R.string.local_web_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = GhostTextMuted,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                        Switch(
                            checked = state.webEnabled,
                            onCheckedChange = vm::setWebEnabled,
                            enabled = !state.busy,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    StatusPill(
                        if (state.webEnabled) stringResource(R.string.web_enabled) else stringResource(R.string.web_disabled),
                        state.webEnabled,
                    )
                    Text(
                        stringResource(R.string.web_restart_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = GhostTextSubtle,
                        modifier = Modifier.padding(top = 9.dp),
                    )
                    if (state.webEnabled && state.runtimeState != "offline") {
                        Spacer(Modifier.height(12.dp))
                        OutlinedButton(onClick = vm::openLocalWeb, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.open_web))
                        }
                    }
                }
            }

            item {
                AppCard {
                    Text(stringResource(R.string.local_paths), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(12.dp))
                    PathLine(stringResource(R.string.code_path), state.installDir)
                    Spacer(Modifier.height(9.dp))
                    PathLine(stringResource(R.string.data_path), state.stateDir)
                }
            }
        }

        item { RemoteConnectionCard(state, vm) }

        item {
            Surface(
                color = GhostPrimary.copy(alpha = 0.08f),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(15.dp)) {
                    Text(stringResource(R.string.local_security), style = MaterialTheme.typography.labelLarge, color = GhostPrimarySoft)
                    Text(
                        stringResource(R.string.local_security_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = GhostTextMuted,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RemoteConnectionCard(state: ManagerUiState, vm: ManagerViewModel) {
    AppCard {
        Text(stringResource(R.string.remote_optional), style = MaterialTheme.typography.titleMedium)
        Text(
            stringResource(R.string.remote_optional_hint),
            style = MaterialTheme.typography.bodySmall,
            color = GhostTextMuted,
            modifier = Modifier.padding(top = 4.dp, bottom = 14.dp),
        )
        OutlinedTextField(
            value = state.baseUrl,
            onValueChange = vm::setBaseUrl,
            label = { Text(stringResource(R.string.server_url)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text("https://server.example/manager") },
        )
        Spacer(Modifier.height(9.dp))
        OutlinedTextField(
            value = state.token,
            onValueChange = vm::setToken,
            label = { Text(stringResource(R.string.access_token)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = vm::connect,
            enabled = state.baseUrl.isNotBlank() && state.token.length >= 12 && !state.busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(if (state.remoteConnected) R.string.reconnect else R.string.connect)) }
        Text(
            stringResource(if (state.remoteConnected) R.string.manager_connected else R.string.manager_disconnected),
            style = MaterialTheme.typography.bodySmall,
            color = if (state.remoteConnected) GhostSuccess else GhostTextMuted,
            modifier = Modifier.padding(top = 9.dp),
        )
        Text(
            stringResource(R.string.remote_https),
            style = MaterialTheme.typography.bodySmall,
            color = GhostTextSubtle,
            modifier = Modifier.padding(top = 7.dp),
        )
    }
}

@Composable
private fun QuickUpdateCard(enabled: Boolean, onUpdate: () -> Unit) {
    AppCard {
        Text(stringResource(R.string.update_runtime), style = MaterialTheme.typography.titleMedium)
        Text(
            stringResource(R.string.update_runtime_hint),
            style = MaterialTheme.typography.bodySmall,
            color = GhostTextMuted,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
        )
        FilledTonalButton(onClick = onUpdate, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.update))
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
    Row(
        modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f)) {
            Text(eyebrow, style = MaterialTheme.typography.labelSmall, color = GhostPrimarySoft)
            Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 5.dp))
        }
        Column(horizontalAlignment = Alignment.End) {
            StatusDot(connected)
            if (onRefresh != null) {
                IconButton(onClick = onRefresh, enabled = refreshEnabled, modifier = Modifier.padding(top = 5.dp)) {
                    Icon(Icons.Rounded.Refresh, contentDescription = stringResource(R.string.refresh), tint = GhostTextMuted)
                }
            }
        }
    }
}

@Composable
private fun StatusDot(active: Boolean) {
    Box(
        Modifier
            .size(11.dp)
            .clip(CircleShape)
            .background(if (active) GhostSuccess else GhostTextSubtle),
    )
}

@Composable
private fun StatusPill(text: String, active: Boolean) {
    Surface(
        color = if (active) GhostSuccess.copy(alpha = 0.12f) else GhostSurfaceSoft,
        shape = RoundedCornerShape(99.dp),
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            style = MaterialTheme.typography.labelSmall,
            color = if (active) GhostSuccess else GhostTextMuted,
        )
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, color = GhostSurfaceSoft, shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(13.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = GhostTextMuted)
            Text(value, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp), maxLines = 1)
        }
    }
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Column(Modifier.padding(top = 4.dp)) {
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
        content = { Column(Modifier.padding(17.dp), content = content) },
    )
}

@Composable
private fun EmptyStateCard(title: String, subtitle: String) {
    Surface(color = GhostSurface, shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = GhostTextMuted,
                modifier = Modifier.padding(top = 5.dp),
            )
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Surface(color = GhostDanger.copy(alpha = 0.10f), shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(stringResource(R.string.connection_error), style = MaterialTheme.typography.labelLarge, color = GhostDanger)
            Text(message, style = MaterialTheme.typography.bodySmall, color = GhostTextMuted, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun LogRow(log: LogUi) {
    val accent = when (log.level.lowercase()) {
        "error", "fatal" -> GhostDanger
        "warn", "warning" -> GhostWarning
        "success" -> GhostSuccess
        else -> GhostCyan
    }
    Surface(color = GhostSurface, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(13.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.padding(top = 5.dp).size(7.dp).clip(CircleShape).background(accent))
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Text(log.message, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
                if (log.timestamp.isNotBlank()) {
                    Text(log.timestamp, style = MaterialTheme.typography.labelSmall, color = GhostTextSubtle, modifier = Modifier.padding(top = 5.dp))
                }
            }
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = GhostTextMuted)
        Text(value, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun PathLine(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = GhostTextMuted)
        Text(
            value.ifBlank { "—" },
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

private fun screenPadding() = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp)

private fun formatUptime(seconds: Long): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    return if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
}

private fun qrBitmap(content: String): Bitmap? = runCatching {
    val size = 768
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    for (x in 0 until size) {
        for (y in 0 until size) {
            bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
    bitmap
}.getOrNull()
