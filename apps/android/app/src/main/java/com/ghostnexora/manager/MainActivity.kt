package com.ghostnexora.manager

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ghostnexora.manager.ui.GhostNexoraTheme
import com.ghostnexora.manager.ui.ManagerApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GhostNexoraTheme {
                ManagerApp(viewModel())
            }
        }
    }
}
