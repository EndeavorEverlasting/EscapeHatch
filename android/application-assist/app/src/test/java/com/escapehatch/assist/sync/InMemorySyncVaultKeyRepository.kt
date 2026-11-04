package com.escapehatch.assist.sync

import java.security.SecureRandom
import javax.crypto.spec.SecretKeySpec

/** JVM test double that mirrors at-rest wrapping without AndroidKeyStore. */
class InMemorySyncVaultKeyRepository(
    secureRandom: SecureRandom = SecureRandom(),
) : SyncVaultKeyRepository {
    private val masterKey = SecretKeySpec(ByteArray(32).also { secureRandom.nextBytes(it) }, "AES")
    private val protector = SyncVaultKeyProtector(masterKey, secureRandom)
    private var wrapped: SyncVaultKeyProtector.WrappedVaultKey? = null

    override fun hasVaultKey(): Boolean = wrapped != null

    override fun loadVaultKey(): ByteArray? = wrapped?.let { protector.unwrap(it) }

    override fun storeVaultKey(key: ByteArray) {
        wrapped = protector.wrap(key)
    }

    override fun clearVaultKey() {
        wrapped = null
    }
}
