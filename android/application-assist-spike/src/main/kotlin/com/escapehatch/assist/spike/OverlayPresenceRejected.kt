package com.escapehatch.assist.spike

/**
 * SYSTEM_ALERT_WINDOW / draw-over overlay is rejected as Android V1 primary mechanism.
 * Lower-authority notification + companion activity + handoff satisfy the presence contract
 * without special-app-access settings friction or overlay spoofing risk.
 */
object OverlayPresenceRejected {
    const val PERMISSION = "android.permission.SYSTEM_ALERT_WINDOW"
    const val v1Primary = false
    const val reason =
        "Spike + policy matrix show quiet notification/companion activity sufficient; overlay adds Play special-access friction without required product gain."
}
