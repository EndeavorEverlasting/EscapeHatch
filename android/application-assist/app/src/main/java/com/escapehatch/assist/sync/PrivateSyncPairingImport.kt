package com.escapehatch.assist.sync

enum class PairingImportState {
    IMPORTED,
    SILENT_PAIRING_REFUSED,
    PAIRING_ALREADY_PROVISIONED,
    INVALID_PAIRING_OFFER,
    INVALID_PAIRING_CODE,
    PAIRING_EXPIRED,
    AUTHENTICATION_FAILED,
}

data class PairingImportResult(
    val state: PairingImportState,
    val vaultId: String? = null,
)

/**
 * Explicit operator-confirmed pairing import. There is no automatic or silent pairing path.
 */
class PrivateSyncPairingImport(
    private val vaultKeyRepository: SyncVaultKeyRepository,
    private val crypto: PrivateSyncCrypto = PrivateSyncCrypto(),
) {
    fun importPairingOffer(
        offer: PairingOffer,
        pairingCode: String,
        operatorConfirmed: Boolean,
        nowMillis: Long = System.currentTimeMillis(),
        replaceExisting: Boolean = false,
        pairingCodeLeakedInOffer: Boolean = false,
    ): PairingImportResult {
        if (!operatorConfirmed) {
            return PairingImportResult(PairingImportState.SILENT_PAIRING_REFUSED)
        }
        if (vaultKeyRepository.hasVaultKey() && !replaceExisting) {
            return PairingImportResult(PairingImportState.PAIRING_ALREADY_PROVISIONED)
        }
        if (pairingCodeLeakedInOffer) {
            return PairingImportResult(PairingImportState.INVALID_PAIRING_OFFER)
        }
        val vaultKey =
            try {
                PairingCrypto.openVaultKey(offer, pairingCode, nowMillis)
            } catch (_: PrivateSyncException.InvalidPairingCode) {
                return PairingImportResult(PairingImportState.INVALID_PAIRING_CODE)
            } catch (_: PrivateSyncException.PairingExpired) {
                return PairingImportResult(PairingImportState.PAIRING_EXPIRED)
            } catch (_: PrivateSyncException.PairingAuthenticationFailed) {
                return PairingImportResult(PairingImportState.AUTHENTICATION_FAILED)
            } catch (_: PrivateSyncException.InvalidPairingOffer) {
                return PairingImportResult(PairingImportState.INVALID_PAIRING_OFFER)
            }
        val vaultId =
            try {
                crypto.vaultIdForKey(vaultKey)
            } catch (_: PrivateSyncException.InvalidDeviceKey) {
                return PairingImportResult(PairingImportState.AUTHENTICATION_FAILED)
            }
        if (vaultId != offer.vaultId) {
            return PairingImportResult(PairingImportState.AUTHENTICATION_FAILED)
        }
        vaultKeyRepository.storeVaultKey(vaultKey)
        vaultKey.fill(0)
        return PairingImportResult(PairingImportState.IMPORTED, vaultId)
    }

    fun importPairingOfferJson(
        offerJson: String,
        pairingCode: String,
        operatorConfirmed: Boolean,
        nowMillis: Long = System.currentTimeMillis(),
        replaceExisting: Boolean = false,
    ): PairingImportResult {
        val offer =
            try {
                PairingCrypto.parseOfferJson(offerJson)
            } catch (_: PrivateSyncException.InvalidPairingOffer) {
                return PairingImportResult(PairingImportState.INVALID_PAIRING_OFFER)
            }
        return importPairingOffer(offer, pairingCode, operatorConfirmed, nowMillis, replaceExisting)
    }
}
