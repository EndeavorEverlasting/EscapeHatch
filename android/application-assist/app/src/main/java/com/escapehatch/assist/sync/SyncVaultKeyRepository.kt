package com.escapehatch.assist.sync

/** Persists the 32-byte vault sync key encrypted at rest. Never logs raw key material. */
interface SyncVaultKeyRepository {
    fun hasVaultKey(): Boolean

    fun loadVaultKey(): ByteArray?

    fun storeVaultKey(key: ByteArray)

    fun clearVaultKey()
}
