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
        if (!editText.text.isNullOrBlank()) return
        val remembered = read(context)
        // Prefer a live /health host. Stale remembered IPs (e.g. host LAN from an
        // emulator session) must not block rediscovery of 10.0.2.2 / current Wi‑Fi PC.
        LanHostProbe.discoverAsync { found ->
            val live = found ?: remembered?.takeIf { LanHostProbe.isHealthyBase(it) }
            if (live.isNullOrBlank()) return@discoverAsync
            editText.post {
                if (editText.text.isNullOrBlank()) {
                    editText.setText(live)
                    write(context, live)
                }
            }
        }
    }
}
