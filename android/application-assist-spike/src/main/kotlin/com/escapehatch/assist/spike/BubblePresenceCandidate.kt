package com.escapehatch.assist.spike

/**
 * Android Bubbles candidate notes.
 *
 * Bubbles attach to Notification.BubbleMetadata. On API 30+ conversation requirements
 * (MessagingStyle + long-lived sharing shortcut) make job-assist bubbles a poor semantic fit
 * and risk nagging if conversation-styled. Treat as optional enhancement after quiet notification,
 * not the product contract.
 */
object BubblePresenceCandidate {
    const val MIN_API = 29
    const val CONVERSATION_REQUIREMENTS_API = 30

    fun requiresConversationSemanticsForTarget30Plus(): Boolean = true

    fun recommendedForV1Primary(): Boolean = false
}
