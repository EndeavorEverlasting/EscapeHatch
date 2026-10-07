package com.escapehatch.assist.spike

/**
 * Browser → EscapeHatch handoff without desktop Chrome extension APIs.
 * Supported spike mechanisms: deep link + Sharesheet text.
 */
data class HandoffContext(
    val sessionId: String?,
    val url: String?,
    val company: String?,
    val role: String?,
    val questionText: String?,
    val source: String,
)

object HandoffIntents {
    private val deepLink =
        Regex("""^escapehatch://assist(?:\?([^#]*))?$""", RegexOption.IGNORE_CASE)

    fun parseDeepLink(uri: String): HandoffContext? {
        val match = deepLink.matchEntire(uri.trim()) ?: return null
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

    private fun decode(value: String): String =
        java.net.URLDecoder.decode(value, Charsets.UTF_8.name())
}
