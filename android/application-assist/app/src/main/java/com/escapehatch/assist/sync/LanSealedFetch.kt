package com.escapehatch.assist.sync

import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.Executors

/**
 * Fetches sealed phone-proof artifacts from the desktop LAN install server (:18765).
 * Only http(s) to RFC1918 / link-local hosts on the EscapeHatch phone-proof port.
 * Never requests or accepts pairing codes.
 */
object LanSealedFetch {
    const val PHONE_PROOF_PORT = 18765
    private val executor = Executors.newSingleThreadExecutor()

    sealed class Outcome {
        data class Ok(val body: String) : Outcome()

        data class Err(val reason: String) : Outcome()
    }

    fun normalizeBaseUrl(raw: String): String? {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isEmpty()) return null
        val withScheme =
            if (trimmed.contains("://")) {
                trimmed
            } else {
                "http://$trimmed"
            }
        return try {
            val uri = URI(withScheme)
            if (!isAllowedLanUri(uri)) null else "${uri.scheme}://${uri.host}:${uri.port.takeIf { it > 0 } ?: PHONE_PROOF_PORT}"
        } catch (_: Exception) {
            null
        }
    }

    fun isAllowedLanUri(uri: URI): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != "http" && scheme != "https") return false
        val host = uri.host ?: return false
        if (!isPrivateOrLocalHost(host)) return false
        // Missing port means the phone-proof LAN default (:18765), not http/80.
        val port = if (uri.port > 0) uri.port else PHONE_PROOF_PORT
        return port == PHONE_PROOF_PORT
    }

    fun isPrivateOrLocalHost(host: String): Boolean {
        val h = host.lowercase()
        if (h == "localhost" || h == "127.0.0.1" || h == "[::1]" || h == "::1") return true
        val parts = h.split('.')
        if (parts.size == 4 && parts.all { it.toIntOrNull() != null }) {
            val a = parts[0].toInt()
            val b = parts[1].toInt()
            if (a == 10) return true
            if (a == 192 && b == 168) return true
            if (a == 172 && b in 16..31) return true
        }
        return false
    }

    fun fetchText(
        baseUrl: String,
        path: String,
        onResult: (Outcome) -> Unit,
    ) {
        val base = normalizeBaseUrl(baseUrl)
        if (base == null) {
            onResult(Outcome.Err("LAN_URL_REFUSED"))
            return
        }
        if (path != "/offer" && path != "/capsule" && path != "/health") {
            onResult(Outcome.Err("LAN_PATH_REFUSED"))
            return
        }
        executor.execute {
            try {
                val url = URL("$base$path")
                val conn =
                    (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 8_000
                        readTimeout = 20_000
                        requestMethod = "GET"
                        instanceFollowRedirects = false
                    }
                try {
                    val code = conn.responseCode
                    if (code != 200) {
                        onResult(Outcome.Err("HTTP_$code"))
                        return@execute
                    }
                    val body =
                        BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
                    if (body.contains("\"pairingCode\"") || body.contains("pairing-code.local")) {
                        onResult(Outcome.Err("PAIRING_CODE_REFUSED"))
                        return@execute
                    }
                    onResult(Outcome.Ok(body))
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                onResult(Outcome.Err(e.javaClass.simpleName))
            }
        }
    }
}
