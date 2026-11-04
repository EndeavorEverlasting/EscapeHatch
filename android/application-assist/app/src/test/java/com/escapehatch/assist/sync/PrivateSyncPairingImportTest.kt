package com.escapehatch.assist.sync

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.Instant

class PrivateSyncPairingImportTest {
    private val keyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    private val vaultId = "1261fda216c85bf0a33d7b7a31cd4e0c"
    private val pairingCode = "ABCDEFGH23456723"
    private val validNow = Instant.parse("2026-11-03T12:05:00.000Z").toEpochMilli()

    private val pairingOffer =
        PairingOffer(
            schema = "escapehatch/private-sync-pairing/v1",
            vaultId = vaultId,
            createdAt = "2026-11-03T12:00:00.000Z",
            expiresAt = "2026-11-03T12:15:00.000Z",
            nonce = "AAECAwQFBgcICQoL",
            ciphertext = "Q2k50zvCT0A5a7guO0o8MzA7zGRBVawpfBfUxAMh8fw",
            tag = "mv6TeAlGzj8MKu9vgIcr1A",
        )

    @Test
    fun explicitImport_storesWrappedVaultKey() {
        val repository = InMemorySyncVaultKeyRepository()
        val importer = PrivateSyncPairingImport(repository)
        val result =
            importer.importPairingOffer(
                offer = pairingOffer,
                pairingCode = pairingCode,
                operatorConfirmed = true,
                nowMillis = validNow,
            )
        assertEquals(PairingImportState.IMPORTED, result.state)
        assertEquals(vaultId, result.vaultId)
        val expectedKey = keyHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        assertArrayEquals(expectedKey, repository.loadVaultKey())
    }

    @Test
    fun silentImportWithoutConfirmation_isRefused() {
        val repository = InMemorySyncVaultKeyRepository()
        val importer = PrivateSyncPairingImport(repository)
        val result =
            importer.importPairingOffer(
                offer = pairingOffer,
                pairingCode = pairingCode,
                operatorConfirmed = false,
                nowMillis = validNow,
            )
        assertEquals(PairingImportState.SILENT_PAIRING_REFUSED, result.state)
        assertFalse(repository.hasVaultKey())
    }

    @Test
    fun wrongPairingCode_isRejected() {
        val repository = InMemorySyncVaultKeyRepository()
        val importer = PrivateSyncPairingImport(repository)
        val result =
            importer.importPairingOffer(
                offer = pairingOffer,
                pairingCode = "AAAAAAAAAAAAAAAA",
                operatorConfirmed = true,
                nowMillis = validNow,
            )
        assertEquals(PairingImportState.AUTHENTICATION_FAILED, result.state)
        assertFalse(repository.hasVaultKey())
    }

    @Test
    fun expiredOffer_isRejected() {
        val repository = InMemorySyncVaultKeyRepository()
        val importer = PrivateSyncPairingImport(repository)
        val expiredNow = Instant.parse("2026-11-03T12:20:00.000Z").toEpochMilli()
        val result =
            importer.importPairingOffer(
                offer = pairingOffer,
                pairingCode = pairingCode,
                operatorConfirmed = true,
                nowMillis = expiredNow,
            )
        assertEquals(PairingImportState.PAIRING_EXPIRED, result.state)
        assertFalse(repository.hasVaultKey())
    }

    @Test
    fun sealedJsonMustNotIncludePairingCode() {
        val repository = InMemorySyncVaultKeyRepository()
        val importer = PrivateSyncPairingImport(repository)
        val result =
            importer.importPairingOffer(
                offer = pairingOffer,
                pairingCode = pairingCode,
                operatorConfirmed = true,
                nowMillis = validNow,
                pairingCodeLeakedInOffer = true,
            )
        assertEquals(PairingImportState.INVALID_PAIRING_OFFER, result.state)
        assertFalse(repository.hasVaultKey())
    }

    @Test
    fun existingVaultRequiresExplicitReplace() {
        val repository = InMemorySyncVaultKeyRepository()
        repository.storeVaultKey(ByteArray(32) { 0x5 })
        val importer = PrivateSyncPairingImport(repository)
        val blocked =
            importer.importPairingOffer(
                offer = pairingOffer,
                pairingCode = pairingCode,
                operatorConfirmed = true,
                nowMillis = validNow,
            )
        assertEquals(PairingImportState.PAIRING_ALREADY_PROVISIONED, blocked.state)
        val replaced =
            importer.importPairingOffer(
                offer = pairingOffer,
                pairingCode = pairingCode,
                operatorConfirmed = true,
                nowMillis = validNow,
                replaceExisting = true,
            )
        assertEquals(PairingImportState.IMPORTED, replaced.state)
    }
}
