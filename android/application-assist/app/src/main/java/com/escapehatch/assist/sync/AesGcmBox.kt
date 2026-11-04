package com.escapehatch.assist.sync

import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

internal object AesGcmBox {
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    fun seal(key: SecretKey, nonce: ByteArray, aad: ByteArray, plaintext: ByteArray): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, nonce))
        cipher.updateAAD(aad)
        val output = cipher.doFinal(plaintext)
        val ciphertext = output.copyOfRange(0, output.size - PrivateSyncSchemas.GCM_TAG_BYTES)
        val tag = output.copyOfRange(output.size - PrivateSyncSchemas.GCM_TAG_BYTES, output.size)
        return ciphertext to tag
    }

    fun seal(key: ByteArray, nonce: ByteArray, aad: ByteArray, plaintext: ByteArray): Pair<ByteArray, ByteArray> =
        seal(SecretKeySpec(key, "AES"), nonce, aad, plaintext)

    fun open(key: SecretKey, nonce: ByteArray, aad: ByteArray, ciphertext: ByteArray, tag: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, nonce))
        cipher.updateAAD(aad)
        val combined = ByteArray(ciphertext.size + tag.size)
        System.arraycopy(ciphertext, 0, combined, 0, ciphertext.size)
        System.arraycopy(tag, 0, combined, ciphertext.size, tag.size)
        return cipher.doFinal(combined)
    }

    fun open(key: ByteArray, nonce: ByteArray, aad: ByteArray, ciphertext: ByteArray, tag: ByteArray): ByteArray =
        open(SecretKeySpec(key, "AES"), nonce, aad, ciphertext, tag)
}
