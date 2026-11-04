package com.escapehatch.assist.sync

import java.security.SecureRandom
import javax.crypto.SecretKey

/** AES-GCM wrap/unwrap for the vault sync key using a hardware- or software-backed master key. */
class SyncVaultKeyProtector(
    private val masterKey: SecretKey,
    private val secureRandom: SecureRandom = SecureRandom(),
) {
    data class WrappedVaultKey(
        val nonce: ByteArray,
        val ciphertext: ByteArray,
        val tag: ByteArray,
    )

    fun wrap(plaintext: ByteArray): WrappedVaultKey {
        if (plaintext.size != PrivateSyncSchemas.VAULT_KEY_BYTES) {
            throw PrivateSyncException.InvalidDeviceKey()
        }
        val nonce = ByteArray(PrivateSyncSchemas.GCM_NONCE_BYTES).also { secureRandom.nextBytes(it) }
        val aad = AAD_VAULT_WRAP.toByteArray(Charsets.UTF_8)
        val (ciphertext, tag) = AesGcmBox.seal(masterKey, nonce, aad, plaintext)
        return WrappedVaultKey(nonce, ciphertext, tag)
    }

    fun unwrap(wrapped: WrappedVaultKey): ByteArray {
        val aad = AAD_VAULT_WRAP.toByteArray(Charsets.UTF_8)
        return AesGcmBox.open(masterKey, wrapped.nonce, aad, wrapped.ciphertext, wrapped.tag)
    }

    companion object {
        const val AAD_VAULT_WRAP = "escapehatch/android-sync-vault-key-wrap/v1"
    }
}
