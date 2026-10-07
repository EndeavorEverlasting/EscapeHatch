package com.escapehatch.assist.spike

/**
 * Spike-local projection of EscapeHatch Application Assist session identity.
 * Must remain compatible with escapeHatch.applicationAssistSession.v1 — no parallel store.
 */
data class AssistSession(
    val sessionId: String,
    val origin: String,
    val status: String, // idle | active | paused | stopped
    val company: String? = null,
    val role: String? = null,
    val unresolvedFieldCount: Int = 0,
)

object AssistSessionStore {
    const val STORAGE_KEY = "escapeHatch.applicationAssistSession.v1"

    private var current: AssistSession? = null

    fun save(session: AssistSession) {
        require(session.status in setOf("idle", "active", "paused", "stopped"))
        current = session
    }

    fun load(): AssistSession? = current

    fun clear() {
        current = null
    }
}
