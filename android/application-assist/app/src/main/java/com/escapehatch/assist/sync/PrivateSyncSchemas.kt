package com.escapehatch.assist.sync

object PrivateSyncSchemas {
    const val SYNC_ENVELOPE_SCHEMA = "escapehatch/e2ee-preference-capsule/v1"
    const val SYNC_PAYLOAD_SCHEMA = "escapehatch/reusable-preference-projection/v1"
    const val PAIRING_SCHEMA = "escapehatch/private-sync-pairing/v1"

    const val VAULT_HMAC_INFO = "escapehatch/e2ee-preference-capsule/v1/vault"
    const val AES_HKDF_INFO = "escapehatch/e2ee-preference-capsule/v1/aes-gcm"
    const val PAIRING_HKDF_INFO = "escapehatch/private-sync-pairing/v1"

    const val VAULT_KEY_BYTES = 32
    const val GCM_NONCE_BYTES = 12
    const val GCM_TAG_BYTES = 16
    /** Must match Node private-sync-keystore PAIRING_TTL_MS (8 hours). */
    const val PAIRING_TTL_MS = 8 * 60 * 60 * 1000L
    /** Clock skew / install lag grace when validating expiresAt. */
    const val PAIRING_TTL_SLACK_MS = 5 * 60 * 1000L
}
