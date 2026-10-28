package com.escapehatch.assist

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

/**
 * Admission boundary for untrusted Android Share/deep-link input.
 *
 * A shared URL is an unverified selection hint, never authority to navigate,
 * authenticate, fill an employer form, import a resume or submit an application.
 * Only public, ordinary HTTPS job links may seed a local companion projection.
 */
object HandoffAdmission {
    fun publicJobUrl(candidate: String?): String? {
        val value = candidate?.trim()?.trimEnd('.', ',', ')', ']', '>') ?: return null
        if (value.isEmpty() || value.length > 2048 || value.any { it.isWhitespace() }) return null

        val uri = try {
            URI(value)
        } catch (_: URISyntaxException) {
            return null
        }
        if (uri.scheme?.lowercase(Locale.ROOT) != "https") return null
        if (uri.rawUserInfo != null || uri.port != -1) return null
        val host = uri.host?.lowercase(Locale.ROOT) ?: return null
        if (!host.contains('.') || host.startsWith('.') || host.endsWith('.') || host.contains("..")) return null
        if (host.any { !it.isLetterOrDigit() && it != '-' && it != '.' }) return null
        if (host.all { it.isDigit() || it == '.' }) return null
        if (host == "localhost" ||
            host.endsWith(".localhost") ||
            host.endsWith(".local") ||
            host.endsWith(".internal") ||
            host.endsWith(".test") ||
            host.endsWith(".invalid") ||
            host.endsWith(".example")) return null
        return value
    }
}
