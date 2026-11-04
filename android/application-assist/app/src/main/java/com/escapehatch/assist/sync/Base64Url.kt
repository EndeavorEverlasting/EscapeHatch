package com.escapehatch.assist.sync

import java.util.Base64

object Base64Url {
    private val pattern = Regex("^[A-Za-z0-9_-]+$")
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val decoder = Base64.getUrlDecoder()

    fun encode(bytes: ByteArray): String = encoder.encodeToString(bytes)

    fun decode(value: String, exactLength: Int?, maxLength: Int): ByteArray {
        if (value.length > maxLength || !pattern.matches(value)) {
            throw PrivateSyncException.InvalidCapsule()
        }
        val bytes =
            try {
                decoder.decode(value)
            } catch (_: IllegalArgumentException) {
                throw PrivateSyncException.InvalidCapsule()
            }
        if ((exactLength != null && bytes.size != exactLength) || encode(bytes) != value) {
            throw PrivateSyncException.InvalidCapsule()
        }
        return bytes
    }
}
