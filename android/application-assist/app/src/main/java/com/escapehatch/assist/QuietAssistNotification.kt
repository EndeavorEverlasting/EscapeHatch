package com.escapehatch.assist

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Quiet V1 affordance. No SYSTEM_ALERT_WINDOW. No foreground service unless EH-M2 H6 proves need.
 */
object QuietAssistNotification {
    const val CHANNEL_ID = "escapehatch_assist_quiet"
    const val NOTIFICATION_ID = 4107
    const val EXTRA_ACTION = "escapehatch.assist.action"
    const val ACTION_RESUME = "resume"
    const val ACTION_COMMANDS = "commands"
    const val ACTION_DISMISS = "dismiss"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.channel_description)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    fun post(context: Context, session: AssistSession) {
        ensureChannel(context)
        val contentIntent = activityPending(context, ACTION_RESUME, session.sessionId)
        val resume = activityPending(context, ACTION_RESUME, session.sessionId)
        val commands = activityPending(context, ACTION_COMMANDS, session.sessionId)
        val dismiss = activityPending(context, ACTION_DISMISS, session.sessionId)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle("EscapeHatch Assist")
            .setContentText("${session.company ?: "Application"} — ${session.status}")
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, context.getString(R.string.action_resume), resume)
            .addAction(0, context.getString(R.string.action_commands), commands)
            .addAction(0, context.getString(R.string.action_dismiss), dismiss)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    fun dismiss(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    private fun activityPending(context: Context, action: String, sessionId: String): PendingIntent {
        val intent = Intent(context, CompanionActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_ACTION, action)
            putExtra("sessionId", sessionId)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(context, action.hashCode(), intent, flags)
    }
}
