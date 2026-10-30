package com.escapehatch.assist

import android.content.Context

/**
 * Android-local projection of EscapeHatch's existing applicant privacy flag.
 * No remote or desktop account sync and no employer-page action are implied.
 */
class ApplicantPrivacyPreferenceStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(STORAGE_KEY, Context.MODE_PRIVATE)
    fun isEnabled(): Boolean = try {
        preferences.getBoolean(FLAG, false)
    } catch (_: ClassCastException) { false }

    /** Persist and verify synchronously; never report success from an uncommitted write. */
    fun setEnabled(value: Boolean): Boolean =
        preferences.edit().putBoolean(FLAG, value).commit() && isEnabled() == value

    companion object {
        const val STORAGE_KEY = "escapeHatch.applicationQuestionPreferences.v1"
        const val SCHEMA = "escapehatch-application-question-preferences/v1"
        const val FLAG = "application_privacy_acknowledgement_enabled"
    }
}
