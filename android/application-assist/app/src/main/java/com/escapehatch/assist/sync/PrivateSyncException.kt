package com.escapehatch.assist.sync

sealed class PrivateSyncException(message: String) : RuntimeException(message) {
    class InvalidDeviceKey : PrivateSyncException("INVALID_DEVICE_KEY")
    class InvalidCapsule : PrivateSyncException("INVALID_CAPSULE")
    class InvalidParent : PrivateSyncException("INVALID_PARENT")
    class InvalidDeviceId : PrivateSyncException("INVALID_DEVICE_ID")
    class WrongVaultKey : PrivateSyncException("WRONG_VAULT_KEY")
    class CapsuleAuthenticationFailed : PrivateSyncException("CAPSULE_AUTHENTICATION_FAILED")
    class InvalidSyncProjection : PrivateSyncException("INVALID_SYNC_PROJECTION")
    class SilentPairingRefused : PrivateSyncException("SILENT_PAIRING_REFUSED")
    class InvalidPairingOffer : PrivateSyncException("INVALID_PAIRING_OFFER")
    class InvalidPairingCode : PrivateSyncException("INVALID_PAIRING_CODE")
    class PairingExpired : PrivateSyncException("PAIRING_EXPIRED")
    class PairingAuthenticationFailed : PrivateSyncException("PAIRING_AUTHENTICATION_FAILED")
}
