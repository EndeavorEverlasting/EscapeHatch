package com.escapehatch.assist

import android.content.Intent
import android.net.Uri
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

data class HandoffContext(
    val sessionId: String?,
    val url: String?,
    val company: String?,
    val role: String?,
    val questionText: String?,
    val source: String,
)

object HandoffIntents {
    private val deepLinkPattern =
        Regex("""^escapehatch://assist(?:\?([^#]*))?$""", RegexOption.IGNORE_CASE)

    fun fromIntent(intent: Intent?): HandoffContext? {
        if (intent == null) return null
        when (intent.action) {
            Intent.ACTION_VIEW -> {
                val data = intent.data ?: return null
                return parseDeepLink(data)
            }
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return null
                return parseShareText(text)
            }
        }
        return null
    }

    fun parseDeepLink(uri: Uri): HandoffContext? {
        if (!uri.scheme.equals("escapehatch", ignoreCase = true)) return null
        if (!uri.host.equals("assist", ignoreCase = true)) return null
        return HandoffContext(
            sessionId = uri.getQueryParameter("session"),
            url = uri.getQueryParameter("url"),
            company = uri.getQueryParameter("company"),
            role = uri.getQueryParameter("role"),
            questionText = uri.getQueryParameter("q"),
            source = "deep_link",
        )
    }

    /** JVM-safe string parser (no Android Uri dependency). */
    fun parseDeepLink(uri: String): HandoffContext? {
        val match = deepLinkPattern.matchEntire(uri.trim()) ?: return null
        val query = match.groupValues.getOrNull(1).orEmpty()
        val params = query.split('&').filter { it.isNotEmpty() }.associate {
            val parts = it.split('=', limit = 2)
            val key = parts[0]
            val value = if (parts.size > 1) decode(parts[1]) else ""
            key to value
        }
        return HandoffContext(
            sessionId = params["session"],
            url = params["url"],
            company = params["company"],
            role = params["role"],
            questionText = params["q"],
            source = "deep_link",
        )
    }

    fun parseShareText(text: String): HandoffContext {
        val url = Regex("""https?://\S+""", RegexOption.IGNORE_CASE).find(text)?.value
        return HandoffContext(
            sessionId = null,
            url = url,
            company = null,
            role = null,
            questionText = text.trim().ifEmpty { null },
            source = "sharesheet",
        )
    }

    fun decode(value: String): String =
        URLDecoder.decode(value, StandardCharsets.UTF_8.name())
}
