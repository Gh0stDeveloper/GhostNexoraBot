package com.ghostnexora.manager

import java.util.concurrent.atomic.AtomicBoolean

class EmbeddedNodeHost {
    private val stopRequested = AtomicBoolean(false)

    val available: Boolean
        get() = nativeLibraryLoaded

    val runtimeVersion: String
        get() = if (nativeLibraryLoaded) runCatching { nativeVersion() }.getOrDefault(expectedNodeVersion) else expectedNodeVersion

    fun start(entryFile: String, stateDir: String, sessionDir: String, dataDir: String): Int {
        if (!nativeLibraryLoaded) return ERROR_LIBRARY_UNAVAILABLE
        stopRequested.set(false)
        return nativeStart(
            arrayOf(
                "node",
                entryFile,
                "--nexora-mobile-lite",
                "--state-dir=$stateDir",
                "--session-dir=$sessionDir",
                "--data-dir=$dataDir",
            ),
        )
    }

    fun requestStop() {
        stopRequested.set(true)
        if (nativeLibraryLoaded) runCatching { nativeRequestStop() }
    }

    private external fun nativeStart(argv: Array<String>): Int
    private external fun nativeRequestStop()
    private external fun nativeVersion(): String

    companion object {
        const val expectedNodeVersion = "v24.21.0"
        const val ERROR_LIBRARY_UNAVAILABLE = -78

        private val nativeLibraryLoaded: Boolean by lazy {
            runCatching {
                System.loadLibrary("nexora_node_bridge")
                true
            }.getOrDefault(false)
        }
    }
}
