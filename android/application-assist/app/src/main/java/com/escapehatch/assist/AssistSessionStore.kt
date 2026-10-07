package com.escapehatch.assist

import android.content.Context

/**
 * Lowest-complexity Android persistence adapter for the Application Assist session projection.
 * Storage key matches contracts/application-assist-session.v1.json.
 */
class AssistSessionStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun save(session: AssistSession) {
        prefs.edit()
            .putString(KEY_SESSION_ID, session.sessionId)
            .putString(KEY_ORIGIN, session.origin)
            .putString(KEY_STATUS, session.status)
            .putString(KEY_COMPANY, session.company)
            .putString(KEY_ROLE, session.role)
            .putInt(KEY_UNRESOLVED, session.unresolvedFieldCount)
            .putString(KEY_QUESTION, session.questionText)
            .apply()
    }

    fun load(): AssistSession? {
        val sessionId = prefs.getString(KEY_SESSION_ID, null) ?: return null
        val origin = prefs.getString(KEY_ORIGIN, null) ?: return null
        val status = prefs.getString(KEY_STATUS, null) ?: return null
        return AssistSession(
            sessionId = sessionId,
            origin = origin,
            status = status,
            company = prefs.getString(KEY_COMPANY, null),
            role = prefs.getString(KEY_ROLE, null),
            unresolvedFieldCount = prefs.getInt(KEY_UNRESOLVED, 0),
            questionText = prefs.getString(KEY_QUESTION, null),
        )
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        const val STORAGE_KEY = "escapeHatch.applicationAssistSession.v1"
        private const val PREFS_NAME = STORAGE_KEY
        private const val KEY_SESSION_ID = "sessionId"
        private const val KEY_ORIGIN = "origin"
        private const val KEY_STATUS = "status"
        private const val KEY_COMPANY = "company"
        private const val KEY_ROLE = "role"
        private const val KEY_UNRESOLVED = "unresolvedFieldCount"
        private const val KEY_QUESTION = "questionText"
    }
}
