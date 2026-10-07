package com.escapehatch.assist

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.util.UUID

class CompanionActivity : AppCompatActivity() {
    private lateinit var store: AssistSessionStore
    private lateinit var statusView: TextView

    private val requestPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            store.load()?.let { QuietAssistNotification.post(this, it) }
            render()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_companion)
        store = AssistSessionStore(this)
        statusView = findViewById(R.id.status)
        findViewById<Button>(R.id.postNotification).setOnClickListener { postQuietNotification() }
        findViewById<Button>(R.id.dismissNotification).setOnClickListener {
            QuietAssistNotification.dismiss(this)
            // Dismiss must not erase session.
            render()
        }
        ingestIntent()
        render()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        ingestIntent()
        render()
    }

    private fun ingestIntent() {
        val action = intent.getStringExtra(QuietAssistNotification.EXTRA_ACTION)
        if (action == QuietAssistNotification.ACTION_DISMISS) {
            QuietAssistNotification.dismiss(this)
            render()
            return
        }
        val handoff = HandoffIntents.fromIntent(intent)
        if (handoff != null) {
            val existing = store.load()
            val session = AssistSession(
                sessionId = handoff.sessionId ?: existing?.sessionId ?: "sess-${UUID.randomUUID()}",
                origin = handoff.url ?: existing?.origin ?: "unknown://",
                status = existing?.status ?: "active",
                company = handoff.company ?: existing?.company,
                role = handoff.role ?: existing?.role,
                unresolvedFieldCount = existing?.unresolvedFieldCount ?: 0,
                questionText = handoff.questionText ?: existing?.questionText,
            )
            store.save(session)
            return
        }
        if (store.load() == null) {
            store.save(
                AssistSession(
                    sessionId = "sess-${UUID.randomUUID()}",
                    origin = "manual://companion",
                    status = "active",
                    company = "Example Co",
                    role = "Automation Engineer",
                ),
            )
        }
    }

    private fun postQuietNotification() {
        val session = store.load() ?: return
        if (Build.VERSION.SDK_INT >= 33) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                requestPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                return
            }
        }
        QuietAssistNotification.post(this, session)
        render()
    }

    private fun render() {
        val session = store.load()
        statusView.text = if (session == null) {
            "No session"
        } else {
            buildString {
                appendLine("storageKey=${AssistSessionStore.STORAGE_KEY}")
                appendLine("sessionId=${session.sessionId}")
                appendLine("origin=${session.origin}")
                appendLine("status=${session.status}")
                appendLine("company=${session.company}")
                appendLine("role=${session.role}")
                appendLine("question=${session.questionText}")
                appendLine("fgs=not_enabled_pending_H6")
                appendLine("overlay=not_requested")
            }
        }
    }
}
