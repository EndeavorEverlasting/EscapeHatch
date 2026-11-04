package com.escapehatch.assist.sync

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class PrivateSyncCrypto(
    private val secureRandom: SecureRandom = SecureRandom(),
) {
    private val hex32 = Regex("^[a-f0-9]{32}$")
    private val hex64 = Regex("^[a-f0-9]{64}$")

    fun vaultIdForKey(secret: ByteArray): String {
        requireDeviceKey(secret)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        mac.update(PrivateSyncSchemas.VAULT_HMAC_INFO.toByteArray(Charsets.UTF_8))
        return mac.doFinal().joinToString(separator = "") { byte -> "%02x".format(byte) }.take(32)
    }

    fun deriveEnvelopeAesKey(secret: ByteArray, vaultId: String): ByteArray {
        requireDeviceKey(secret)
        val salt = hexToBytes(vaultId)
        val info = PrivateSyncSchemas.AES_HKDF_INFO.toByteArray(Charsets.UTF_8)
        return HkdfSha256.derive(secret, salt, info, PrivateSyncSchemas.VAULT_KEY_BYTES)
    }

    fun parseEnvelope(fields: Map<String, String?>): SyncEnvelope {
        val expected = setOf("schema", "vaultId", "parent", "deviceId", "nonce", "ciphertext", "tag")
        if (fields.keys != expected) throw PrivateSyncException.InvalidCapsule()
        val envelope =
            SyncEnvelope(
                schema = fields.getValue("schema") ?: throw PrivateSyncException.InvalidCapsule(),
                vaultId = fields.getValue("vaultId") ?: throw PrivateSyncException.InvalidCapsule(),
                parent = fields["parent"],
                deviceId = fields.getValue("deviceId") ?: throw PrivateSyncException.InvalidCapsule(),
                nonce = fields.getValue("nonce") ?: throw PrivateSyncException.InvalidCapsule(),
                ciphertext = fields.getValue("ciphertext") ?: throw PrivateSyncException.InvalidCapsule(),
                tag = fields.getValue("tag") ?: throw PrivateSyncException.InvalidCapsule(),
            )
        return validateEnvelope(envelope)
    }

    fun parseEnvelopeJson(raw: String): SyncEnvelope =
        try {
            parseEnvelope(JsonCompat.parseFlatObject(raw))
        } catch (_: IllegalArgumentException) {
            throw PrivateSyncException.InvalidCapsule()
        }

    fun validateEnvelope(envelope: SyncEnvelope): SyncEnvelope {
        if (envelope.schema != PrivateSyncSchemas.SYNC_ENVELOPE_SCHEMA || !hex32.matches(envelope.vaultId)) {
            throw PrivateSyncException.InvalidCapsule()
        }
        if (envelope.parent != null && !hex64.matches(envelope.parent)) {
            throw PrivateSyncException.InvalidCapsule()
        }
        if (!hex32.matches(envelope.deviceId)) {
            throw PrivateSyncException.InvalidCapsule()
        }
        Base64Url.decode(envelope.nonce, PrivateSyncSchemas.GCM_NONCE_BYTES, 32)
        Base64Url.decode(envelope.tag, PrivateSyncSchemas.GCM_TAG_BYTES, 32)
        Base64Url.decode(envelope.ciphertext, null, 90_000)
        return envelope
    }

    fun envelopeMetadata(envelope: SyncEnvelope): ByteArray =
        JsonCompat.stringifyArray(envelope.schema, envelope.vaultId, envelope.parent, envelope.deviceId)
            .toByteArray(Charsets.UTF_8)

    fun sealProjectionJson(projectionJson: String, secret: ByteArray, parent: String?, deviceId: String): SyncEnvelope {
        requireDeviceKey(secret)
        if (parent != null && !hex64.matches(parent)) {
            throw PrivateSyncException.InvalidParent()
        }
        if (!hex32.matches(deviceId)) {
            throw PrivateSyncException.InvalidDeviceId()
        }
        if (extractSchema(projectionJson) != PrivateSyncSchemas.SYNC_PAYLOAD_SCHEMA) {
            throw PrivateSyncException.InvalidSyncProjection()
        }
        val vaultId = vaultIdForKey(secret)
        val nonce = ByteArray(PrivateSyncSchemas.GCM_NONCE_BYTES).also { secureRandom.nextBytes(it) }
        val envelope =
            SyncEnvelope(
                schema = PrivateSyncSchemas.SYNC_ENVELOPE_SCHEMA,
                vaultId = vaultId,
                parent = parent,
                deviceId = deviceId,
                nonce = Base64Url.encode(nonce),
                ciphertext = "",
                tag = "",
            )
        val aesKey = deriveEnvelopeAesKey(secret, vaultId)
        val aad = envelopeMetadata(envelope)
        val (ciphertext, tag) = AesGcmBox.seal(aesKey, nonce, aad, projectionJson.toByteArray(Charsets.UTF_8))
        return envelope.copy(
            ciphertext = Base64Url.encode(ciphertext),
            tag = Base64Url.encode(tag),
        )
    }

    fun openProjection(envelope: SyncEnvelope, secret: ByteArray): String {
        validateEnvelope(envelope)
        if (vaultIdForKey(secret) != envelope.vaultId) {
            throw PrivateSyncException.WrongVaultKey()
        }
        val aesKey = deriveEnvelopeAesKey(secret, envelope.vaultId)
        val nonce = Base64Url.decode(envelope.nonce, PrivateSyncSchemas.GCM_NONCE_BYTES, 32)
        val ciphertext = Base64Url.decode(envelope.ciphertext, null, 90_000)
        val tag = Base64Url.decode(envelope.tag, PrivateSyncSchemas.GCM_TAG_BYTES, 32)
        val aad = envelopeMetadata(envelope)
        val plaintext =
            try {
                AesGcmBox.open(aesKey, nonce, aad, ciphertext, tag)
            } catch (_: Exception) {
                throw PrivateSyncException.CapsuleAuthenticationFailed()
            }
        if (plaintext.size > 65_536) {
            throw PrivateSyncException.InvalidSyncProjection()
        }
        val text = plaintext.toString(Charsets.UTF_8)
        if (extractSchema(text) != PrivateSyncSchemas.SYNC_PAYLOAD_SCHEMA) {
            throw PrivateSyncException.InvalidSyncProjection()
        }
        return text
    }

    fun openProjectionJson(raw: String, secret: ByteArray): String = openProjection(parseEnvelopeJson(raw), secret)

    fun envelopeDigest(envelope: SyncEnvelope): String {
        val canonical = validateEnvelope(envelope)
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(canonical.toCanonicalJson().toByteArray(Charsets.UTF_8))
        return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private fun requireDeviceKey(secret: ByteArray) {
        if (secret.size != PrivateSyncSchemas.VAULT_KEY_BYTES) {
            throw PrivateSyncException.InvalidDeviceKey()
        }
    }

    private fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0)
        return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    private fun extractSchema(json: String): String? =
        Regex("\"schema\"\\s*:\\s*\"([^\"]+)\"").find(json)?.groupValues?.get(1)
}
