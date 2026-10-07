package com.escapehatch.assist.spike

/**
 * Preferred Android V1 affordance sketch: quiet ongoing notification + optional
 * foreground service, reopenable into the same AssistSession without overlay permission.
 *
 * Device notification posting requires Android SDK / runtime and is not claimed here.
 */
data class QuietPresenceConfig(
    val channelId: String = "escapehatch_assist_quiet",
    val importance: String = "LOW",
    val ongoing: Boolean = true,
    val actions: List<String> = listOf("Resume", "Open commands", "Dismiss"),
    val requiresSystemAlertWindow: Boolean = false,
    val requiresAccessibility: Boolean = false,
)

object QuietNotificationPresence {
    val config = QuietPresenceConfig()

    fun canSurfaceWhileBrowserForegrounded(): Boolean = true

    fun permissionBurden(): List<String> = listOf(
        "POST_NOTIFICATIONS (API 33+)",
        "optional FOREGROUND_SERVICE / FOREGROUND_SERVICE_SPECIAL_USE when ongoing assist needs durable process",
    )
}
