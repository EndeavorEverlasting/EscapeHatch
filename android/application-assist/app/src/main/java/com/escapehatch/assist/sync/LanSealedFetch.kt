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
            onResult(httpExchange(base, path, "GET", null))
        }
    }

    /** POST value-free phone proof JSON to desktop :18765/proof (never pairing codes). */
    fun postProofJson(
        baseUrl: String,
        proofJson: String,
        onResult: (Outcome) -> Unit,
    ) {
        val base = normalizeBaseUrl(baseUrl)
        if (base == null) {
            onResult(Outcome.Err("LAN_URL_REFUSED"))
            return
        }
        if (proofJson.isBlank()) {
            onResult(Outcome.Err("PROOF_EMPTY"))
            return
        }
        executor.execute {
            onResult(httpExchange(base, "/proof", "POST", proofJson))
        }
    }

    private fun httpExchange(
        base: String,
        path: String,
        method: String,
        body: String?,
    ): Outcome {
        return try {
            val url = URL("$base$path")
            val conn =
                (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8_000
                    readTimeout = 20_000
                    requestMethod = method
                    instanceFollowRedirects = false
                    if (body != null) {
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    }
                }
            try {
                if (body != null) {
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }
                val code = conn.responseCode
                if (code !in 200..299) {
                    return Outcome.Err("HTTP_$code")
                }
                val response =
                    BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
                if (response.contains("\"pairingCode\"") || response.contains("pairing-code.local")) {
                    return Outcome.Err("PAIRING_CODE_REFUSED")
                }
                Outcome.Ok(response)
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            val detail = (e.message ?: "").replace('\n', ' ').take(80)
            val reason =
                if (detail.isBlank()) {
                    e.javaClass.simpleName
                } else {
                    "${e.javaClass.simpleName}:$detail"
                }
            Outcome.Err(reason)
        }
    }
}
