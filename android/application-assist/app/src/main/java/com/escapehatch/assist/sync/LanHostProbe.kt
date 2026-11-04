package com.escapehatch.assist.sync

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.Executors

/**
 * Best-effort discovery of the EscapeHatch phone-proof LAN host (:18765).
 * Prefers UDP beacon :18767 (`EHPHONESYNC/1 <port>`), then HTTP /health sweep.
 * Never reads or stores pairing codes — only /health with pairingCode=never.
 */
object LanHostProbe {
    const val BEACON_PORT = 18767
    private val executor = Executors.newSingleThreadExecutor()

    fun discoverAsync(onResult: (String?) -> Unit) {
        executor.execute {
            onResult(discoverBlocking())
        }
    }

    fun isHealthyBase(raw: String): Boolean {
        val base = LanSealedFetch.normalizeBaseUrl(raw) ?: return false
        val hostPort = base.removePrefix("http://").removePrefix("https://")
        return probeHealth(hostPort)
    }

    /** Parse value-free beacon body; returns HTTP port or null. */
    fun parseBeaconPayload(text: String): Int? {
        val m = Regex("""^EHPHONESYNC/1\s+(\d{2,5})\s*$""").matchEntire(text.trim()) ?: return null
        val port = m.groupValues[1].toIntOrNull() ?: return null
        return if (port == LanSealedFetch.PHONE_PROOF_PORT) port else null
    }

    fun discoverBlocking(): String? {
        listenBeacon()?.let { return it }

        val candidates = linkedSetOf<String>()
        // Emulator loopback to host machine (must win over a stale host Wi‑Fi IP).
        candidates.add("10.0.2.2:${LanSealedFetch.PHONE_PROOF_PORT}")
        candidates.add("127.0.0.1:${LanSealedFetch.PHONE_PROOF_PORT}")
        for (addr in localIpv4Addresses()) {
            val parts = addr.split('.')
            if (parts.size != 4) continue
            val a = parts[0].toIntOrNull() ?: continue
            val b = parts[1].toIntOrNull() ?: continue
            val c = parts[2].toIntOrNull() ?: continue
            val d = parts[3].toIntOrNull() ?: continue
            // Prefer known lab desktop (.80), then nearby DHCP neighbors, then sparse /24 sweep.
            val guesses = linkedSetOf<Int>()
            guesses.add(80)
            guesses.add(1)
            for (delta in -8..8) {
                val n = d + delta
                if (n in 1..254 && n != d) guesses.add(n)
            }
            // Sparse sweep catches desktops outside ±8 without probing all 254 first.
            for (n in 2..254 step 5) {
                if (n != d) guesses.add(n)
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

    private fun listenBeacon(timeoutMs: Int = 1600): String? {
        var socket: DatagramSocket? = null
        return try {
            socket =
                DatagramSocket(null).apply {
                    reuseAddress = true
                    soTimeout = timeoutMs
                    bind(InetSocketAddress(BEACON_PORT))
                }
            val buf = ByteArray(256)
            val packet = DatagramPacket(buf, buf.size)
            val deadline = System.currentTimeMillis() + timeoutMs
            while (System.currentTimeMillis() < deadline) {
                try {
                    socket.receive(packet)
                } catch (_: Exception) {
                    break
                }
                val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
                val httpPort = parseBeaconPayload(text) ?: continue
                val host = packet.address?.hostAddress ?: continue
                if (host.startsWith("127.") || host == "::1") continue
                val hostPort = "$host:$httpPort"
                if (probeHealth(hostPort)) {
                    return LanSealedFetch.normalizeBaseUrl(hostPort)
                }
            }
            null
        } catch (_: Exception) {
            null
        } finally {
            try {
                socket?.close()
            } catch (_: Exception) {
                /* ignore */
            }
        }
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
