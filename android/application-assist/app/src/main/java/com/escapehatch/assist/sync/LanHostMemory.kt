package com.escapehatch.assist.sync

import android.content.Context
import android.widget.EditText

/** Remembers the last allowlisted PC LAN base URL on this phone (never stores pairing codes). */
object LanHostMemory {
    private const val PREFS = "escapehatch_private_sync_lan"
    private const val KEY_BASE = "lan_base_v1"

    fun read(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_BASE, null)

    fun write(context: Context, raw: String) {
        val normalized = LanSealedFetch.normalizeBaseUrl(raw) ?: return
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_BASE, normalized)
            .apply()
    }

    fun bind(editText: EditText, context: Context) {
        val remembered = read(context)
        if (!remembered.isNullOrBlank() && editText.text.isNullOrBlank()) {
            editText.setText(remembered)
            return
        }
        if (!editText.text.isNullOrBlank()) return
        // Auto-fill when the PC LAN :18765 health endpoint is reachable on Wi‑Fi.
        LanHostProbe.discoverAsync { found ->
            if (found.isNullOrBlank()) return@discoverAsync
            editText.post {
                if (editText.text.isNullOrBlank()) {
                    editText.setText(found)
                    write(context, found)
                }
            }
        }
    }
}
