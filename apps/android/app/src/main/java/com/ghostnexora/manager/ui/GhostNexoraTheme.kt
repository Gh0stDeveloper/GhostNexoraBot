package com.ghostnexora.manager.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val GhostBackground = Color(0xFF05060A)
internal val GhostSurface = Color(0xFF0D1017)
internal val GhostSurfaceElevated = Color(0xFF131824)
internal val GhostSurfaceSoft = Color(0xFF181E2A)
internal val GhostBorder = Color(0xFF252C3A)
internal val GhostTextMuted = Color(0xFF8992A3)
internal val GhostTextSubtle = Color(0xFF5F6878)
internal val GhostPrimary = Color(0xFF7C6CFF)
internal val GhostPrimarySoft = Color(0xFFB8AEFF)
internal val GhostCyan = Color(0xFF55D7FF)
internal val GhostSuccess = Color(0xFF53D39A)
internal val GhostWarning = Color(0xFFFFC857)
internal val GhostDanger = Color(0xFFFF6B7A)

private val GhostColors = darkColorScheme(
    primary = GhostPrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF292251),
    onPrimaryContainer = Color(0xFFE7E2FF),
    secondary = GhostCyan,
    onSecondary = Color(0xFF002C38),
    background = GhostBackground,
    onBackground = Color(0xFFF5F7FB),
    surface = GhostSurface,
    onSurface = Color(0xFFF5F7FB),
    surfaceVariant = GhostSurfaceElevated,
    onSurfaceVariant = Color(0xFFC8CEDA),
    outline = GhostBorder,
    error = GhostDanger,
    onError = Color.White,
)

private val GhostTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Black,
        fontSize = 34.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.8).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        lineHeight = 31.sp,
        letterSpacing = (-0.35).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 25.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 21.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 23.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 17.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 10.sp,
        lineHeight = 13.sp,
        letterSpacing = 0.6.sp,
    ),
)

private val GhostShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp),
    small = RoundedCornerShape(14.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(34.dp),
)

@Composable
fun GhostNexoraTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = GhostColors,
        typography = GhostTypography,
        shapes = GhostShapes,
        content = content,
    )
}
