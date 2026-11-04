package com.escapehatch.assist.sync

data class SyncEnvelope(
    val schema: String,
    val vaultId: String,
    val parent: String?,
    val deviceId: String,
    val nonce: String,
    val ciphertext: String,
    val tag: String,
) {
    fun toCanonicalJson(): String =
        buildString {
            append('{')
            append("\"schema\":").append(JsonCompat.quote(schema)).append(',')
            append("\"vaultId\":").append(JsonCompat.quote(vaultId)).append(',')
            append("\"parent\":").append(parent?.let { JsonCompat.quote(it) } ?: "null").append(',')
            append("\"deviceId\":").append(JsonCompat.quote(deviceId)).append(',')
            append("\"nonce\":").append(JsonCompat.quote(nonce)).append(',')
            append("\"ciphertext\":").append(JsonCompat.quote(ciphertext)).append(',')
            append("\"tag\":").append(JsonCompat.quote(tag))
            append('}')
        }
}
