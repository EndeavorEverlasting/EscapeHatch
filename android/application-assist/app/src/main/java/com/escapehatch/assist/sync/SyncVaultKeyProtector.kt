package com.escapehatch.assist.sync

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey

/**
 * AES-GCM wrap/unwrap for the vault sync key using a hardware- or software-backed master key.
 *
 * Encryption deliberately lets the Cipher/Keystore choose the IV (`randomizedEncryptionRequired`).
 * Caller-supplied nonces are rejected by Android Keystore when that flag is set.
 */
class SyncVaultKeyProtector(
    private val masterKey: SecretKey,
    @Suppress("unused")
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
        val aad = AAD_VAULT_WRAP.toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, masterKey)
        cipher.updateAAD(aad)
        val output = cipher.doFinal(plaintext)
        val nonce =
            cipher.iv
                ?: throw IllegalStateException("AES-GCM wrap produced no IV")
        if (nonce.size != PrivateSyncSchemas.GCM_NONCE_BYTES) {
            throw IllegalStateException("AES-GCM wrap IV size ${nonce.size}")
        }
        val ciphertext = output.copyOfRange(0, output.size - PrivateSyncSchemas.GCM_TAG_BYTES)
        val tag = output.copyOfRange(output.size - PrivateSyncSchemas.GCM_TAG_BYTES, output.size)
        return WrappedVaultKey(nonce, ciphertext, tag)
    }

    fun unwrap(wrapped: WrappedVaultKey): ByteArray {
        val aad = AAD_VAULT_WRAP.toByteArray(Charsets.UTF_8)
        return AesGcmBox.open(masterKey, wrapped.nonce, aad, wrapped.ciphertext, wrapped.tag)
    }

    companion object {
        const val AAD_VAULT_WRAP = "escapehatch/android-sync-vault-key-wrap/v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
