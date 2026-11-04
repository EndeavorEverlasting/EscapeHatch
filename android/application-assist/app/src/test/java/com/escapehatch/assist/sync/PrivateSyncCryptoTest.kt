package com.escapehatch.assist.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Capsule vectors cross-checked with Node private-sync-crypto.ts. */
class PrivateSyncCryptoTest {
    private val crypto = PrivateSyncCrypto()

    private val keyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    private val deviceId = "a".repeat(32)
    private val vaultId = "1261fda216c85bf0a33d7b7a31cd4e0c"

    private val nodeEnvelope =
        SyncEnvelope(
            schema = "escapehatch/e2ee-preference-capsule/v1",
            vaultId = vaultId,
            parent = null,
            deviceId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            nonce = "lFaFNmm7KAuD09NA",
            ciphertext =
                "LufWIMdOpTVEGIKHCW9pklLvqP2ULX-TKW5VATwH2abj7Mil0P2ioN8xFOI2xYq2W0tSSrZ8wo5J1NOvx4EMyp5H9TFSrzvSCyNk4W_clwbiYOsUi78YLUsc2_UDcmbxLAYW2Kka4AvP8Ghj6siVVTEYeLQQ-N1TBZBAw1DGJ1A6mTOXs9sIDYALvoXzFQ0s6bYqlszOaFhvt61qgys8Qlx7d7-FjVOzjBf1rTpCC2mrWa6xupLZladTURyIWb7rT_cWFucXvwDgQQCHO1MWk-ZPQBmWXxuxluA",
            tag = "wtcR4hKh4wepyB_-H8bZRw",
        )

    @Test
    fun vaultId_matchesNodeHmac() {
        val key = keyHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        assertEquals(vaultId, crypto.vaultIdForKey(key))
    }

    @Test
    fun openProjection_matchesNodeVector() {
        val key = keyHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val opened = crypto.openProjection(nodeEnvelope, key)
        assertTrue(opened.contains("Synthetic Engineering"))
        assertFalse(opened.contains("Sensitive Synthetic"))
    }

    @Test
    fun sealThenOpen_roundTripsLocally() {
        val key = keyHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val projection =
            """
            {
              "schema": "escapehatch/reusable-preference-projection/v1",
              "entries": {
                "talent_community.primary_areas": {
                  "scope": "profile_preference",
                  "source": "user",
                  "value": "Synthetic Engineering",
                  "updated_at": "2026-11-03T00:00:00Z"
                }
              }
            }
            """.trimIndent()
        val sealed = crypto.sealProjectionJson(projection, key, null, deviceId)
        val opened = crypto.openProjection(sealed, key)
        assertEquals(projection.replace("\\s".toRegex(), ""), opened.replace("\\s".toRegex(), ""))
    }

    @Test
    fun wrongKey_isRejected() {
        val wrong = ByteArray(32) { 0x11 }
        try {
            crypto.openProjection(nodeEnvelope, wrong)
            throw AssertionError("expected WRONG_VAULT_KEY")
        } catch (error: PrivateSyncException.WrongVaultKey) {
            assertEquals("WRONG_VAULT_KEY", error.message)
        }
    }

    @Test
    fun tamperedTag_failsClosed() {
        val key = keyHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val tampered = nodeEnvelope.copy(tag = "Ga7qZCL-dYMrXPJkuGPY4B")
        try {
            crypto.openProjection(tampered, key)
            throw AssertionError("expected tamper rejection")
        } catch (_: PrivateSyncException.CapsuleAuthenticationFailed) {
        } catch (_: PrivateSyncException.InvalidCapsule) {
        }
    }
}
