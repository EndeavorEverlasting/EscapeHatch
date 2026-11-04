package com.escapehatch.assist.sync

/** Sealed pairing payload; pairingCode is out-of-band only and must not appear here. */
data class PairingOffer(
    val schema: String,
    val vaultId: String,
    val createdAt: String,
    val expiresAt: String,
    val nonce: String,
    val ciphertext: String,
    val tag: String,
) {
    fun toCanonicalJson(): String =
        buildString {
            append('{')
            append("\"schema\":").append(JsonCompat.quote(schema)).append(',')
            append("\"vaultId\":").append(JsonCompat.quote(vaultId)).append(',')
            append("\"createdAt\":").append(JsonCompat.quote(createdAt)).append(',')
            append("\"expiresAt\":").append(JsonCompat.quote(expiresAt)).append(',')
            append("\"nonce\":").append(JsonCompat.quote(nonce)).append(',')
            append("\"ciphertext\":").append(JsonCompat.quote(ciphertext)).append(',')
            append("\"tag\":").append(JsonCompat.quote(tag))
            append('}')
        }
}

internal object PairingCrypto {
    private val hex32 = Regex("^[a-f0-9]{32}$")
    private val pairingCodePattern = Regex("^[A-Z2-7]{16}$")

    fun derivePairingAesKey(pairingCode: String, vaultId: String): ByteArray {
        if (!pairingCodePattern.matches(pairingCode)) {
            throw PrivateSyncException.InvalidPairingCode()
        }
        val ikm = pairingCode.toByteArray(Charsets.UTF_8)
        val salt = vaultId.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val info = PrivateSyncSchemas.PAIRING_HKDF_INFO.toByteArray(Charsets.UTF_8)
        return HkdfSha256.derive(ikm, salt, info, PrivateSyncSchemas.VAULT_KEY_BYTES)
    }

    fun pairingAad(offer: PairingOffer): ByteArray =
        JsonCompat.stringifyArray(offer.schema, offer.vaultId, offer.createdAt, offer.expiresAt)
            .toByteArray(Charsets.UTF_8)

    fun parseOffer(fields: Map<String, String?>): PairingOffer {
        if (fields.containsKey("pairingCode")) {
            throw PrivateSyncException.InvalidPairingOffer()
        }
        val expected = setOf("schema", "vaultId", "createdAt", "expiresAt", "nonce", "ciphertext", "tag")
        if (fields.keys != expected) throw PrivateSyncException.InvalidPairingOffer()
        val offer =
            PairingOffer(
                schema = fields.getValue("schema") ?: throw PrivateSyncException.InvalidPairingOffer(),
                vaultId = fields.getValue("vaultId") ?: throw PrivateSyncException.InvalidPairingOffer(),
                createdAt = fields.getValue("createdAt") ?: throw PrivateSyncException.InvalidPairingOffer(),
                expiresAt = fields.getValue("expiresAt") ?: throw PrivateSyncException.InvalidPairingOffer(),
                nonce = fields.getValue("nonce") ?: throw PrivateSyncException.InvalidPairingOffer(),
                ciphertext = fields.getValue("ciphertext") ?: throw PrivateSyncException.InvalidPairingOffer(),
                tag = fields.getValue("tag") ?: throw PrivateSyncException.InvalidPairingOffer(),
            )
        if (offer.schema != PrivateSyncSchemas.PAIRING_SCHEMA || !hex32.matches(offer.vaultId)) {
            throw PrivateSyncException.InvalidPairingOffer()
        }
        Base64Url.decode(offer.nonce, PrivateSyncSchemas.GCM_NONCE_BYTES, 32)
        Base64Url.decode(offer.tag, PrivateSyncSchemas.GCM_TAG_BYTES, 32)
        Base64Url.decode(offer.ciphertext, PrivateSyncSchemas.VAULT_KEY_BYTES, 64)
        return offer
    }

    fun parseOfferJson(raw: String): PairingOffer =
        try {
            parseOffer(JsonCompat.parseFlatObject(raw))
        } catch (_: IllegalArgumentException) {
            throw PrivateSyncException.InvalidPairingOffer()
        }

    fun assertOfferFresh(offer: PairingOffer, nowMillis: Long) {
        val expires = parseIsoInstant(offer.expiresAt)
        val created = parseIsoInstant(offer.createdAt)
        if (expires == null || created == null) {
            throw PrivateSyncException.PairingExpired()
        }
        if (nowMillis > expires ||
            expires - created > PrivateSyncSchemas.PAIRING_TTL_MS + PrivateSyncSchemas.PAIRING_TTL_SLACK_MS
        ) {
            throw PrivateSyncException.PairingExpired()
        }
    }

    fun openVaultKey(offer: PairingOffer, pairingCode: String, nowMillis: Long): ByteArray {
        assertOfferFresh(offer, nowMillis)
        val aesKey = derivePairingAesKey(pairingCode, offer.vaultId)
        val nonce = Base64Url.decode(offer.nonce, PrivateSyncSchemas.GCM_NONCE_BYTES, 32)
        val ciphertext = Base64Url.decode(offer.ciphertext, PrivateSyncSchemas.VAULT_KEY_BYTES, 64)
        val tag = Base64Url.decode(offer.tag, PrivateSyncSchemas.GCM_TAG_BYTES, 32)
        val aad = pairingAad(offer)
        val plaintext =
            try {
                AesGcmBox.open(aesKey, nonce, aad, ciphertext, tag)
            } catch (_: PrivateSyncException.InvalidPairingCode) {
                throw PrivateSyncException.InvalidPairingCode()
            } catch (_: Exception) {
                throw PrivateSyncException.PairingAuthenticationFailed()
            }
        if (plaintext.size != PrivateSyncSchemas.VAULT_KEY_BYTES) {
            throw PrivateSyncException.PairingAuthenticationFailed()
        }
        return plaintext
    }

    private fun parseIsoInstant(value: String): Long? =
        try {
            java.time.Instant.parse(value).toEpochMilli()
        } catch (_: Exception) {
            null
        }
}
