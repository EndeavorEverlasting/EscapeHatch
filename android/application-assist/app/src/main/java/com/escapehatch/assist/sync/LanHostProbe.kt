package com.escapehatch.assist.sync

import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.Executors

/**
 * Best-effort discovery of the EscapeHatch phone-proof LAN host (:18765).
 * Never reads or stores pairing codes — only /health with pairingCode=never.
 */
object LanHostProbe {
    private val executor = Executors.newSingleThreadExecutor()

    fun discoverAsync(onResult: (String?) -> Unit) {
        executor.execute {
            onResult(discoverBlocking())
        }
    }

    fun discoverBlocking(): String? {
        val candidates = linkedSetOf<String>()
        // Emulator loopback to host machine.
        candidates.add("10.0.2.2:${LanSealedFetch.PHONE_PROOF_PORT}")
        candidates.add("127.0.0.1:${LanSealedFetch.PHONE_PROOF_PORT}")
        for (addr in localIpv4Addresses()) {
            val parts = addr.split('.')
            if (parts.size != 4) continue
            val a = parts[0].toIntOrNull() ?: continue
            val b = parts[1].toIntOrNull() ?: continue
            val c = parts[2].toIntOrNull() ?: continue
            val d = parts[3].toIntOrNull() ?: continue
            // Prefer .1 (router often not PC) skip; try .80 common lab host, then neighbors.
            val guesses = linkedSetOf<Int>()
            guesses.add(80)
            guesses.add(1)
            for (delta in -5..5) {
                val n = d + delta
                if (n in 1..254 && n != d) guesses.add(n)
            }
            for (hostOctet in guesses) {
                candidates.add("$a.$b.$c.$hostOctet:${LanSealedFetch.PHONE_PROOF_PORT}")
            }
        }
        for (host in candidates) {
            if (probeHealth(host)) {
                return LanSealedFetch.normalizeBaseUrl(host)
            }
        }
        return null
    }

    private fun localIpv4Addresses(): List<String> {
        val out = mutableListOf<String>()
        try {
            val ifaces = NetworkInterface.getNetworkInterfaces() ?: return out
            while (ifaces.hasMoreElements()) {
                val nif = ifaces.nextElement()
                if (!nif.isUp || nif.isLoopback) continue
                val addrs = nif.inetAddresses
                while (addrs.hasMoreElements()) {
                    val a = addrs.nextElement()
                    if (a is Inet4Address && !a.isLoopbackAddress) {
                        out.add(a.hostAddress ?: continue)
                    }
                }
            }
        } catch (_: Exception) {
            /* ignore */
        }
        return out
    }

    private fun probeHealth(hostPort: String): Boolean {
        return try {
            val url = URL("http://$hostPort/health")
            val conn =
                (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 400
                    readTimeout = 600
                    requestMethod = "GET"
                    instanceFollowRedirects = false
                }
            try {
                if (conn.responseCode != 200) return false
                val body = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                body.contains("\"ok\":true") &&
                    body.contains("\"pairingCode\":\"never\"") &&
                    !body.contains("pairing-code.local")
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            false
        }
    }
}
