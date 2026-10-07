package com.escapehatch.assist

/**
 * Projection of escapeHatch.applicationAssistSession.v1 — not a second canonical store.
 */
data class AssistSession(
    val sessionId: String,
    val origin: String,
    val status: String,
    val company: String? = null,
    val role: String? = null,
    val unresolvedFieldCount: Int = 0,
    val questionText: String? = null,
) {
    init {
        require(status in setOf("idle", "active", "paused", "stopped"))
    }
}
