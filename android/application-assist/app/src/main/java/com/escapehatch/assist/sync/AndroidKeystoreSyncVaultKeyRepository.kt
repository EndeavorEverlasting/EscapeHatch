package com.escapehatch.assist.sync

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * Stores the vault sync key wrapped with an AndroidKeyStore AES-GCM master key.
 * Raw vault bytes never touch SharedPreferences in plaintext.
 */
class AndroidKeystoreSyncVaultKeyRepository(
    context: Context,
    private val masterKeyAlias: String = DEFAULT_MASTER_ALIAS,
) : SyncVaultKeyRepository {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val protector by lazy { SyncVaultKeyProtector(loadOrCreateMasterKey()) }

    override fun hasVaultKey(): Boolean = prefs.contains(PREF_WRAPPED_VAULT)

    override fun loadVaultKey(): ByteArray? {
        val encoded = prefs.getString(PREF_WRAPPED_VAULT, null) ?: return null
        val parts = encoded.split("|")
        if (parts.size != 3) {
            clearVaultKey()
            return null
        }
        val wrapped =
            SyncVaultKeyProtector.WrappedVaultKey(
                nonce = Base64Url.decode(parts[0], PrivateSyncSchemas.GCM_NONCE_BYTES, 32),
                ciphertext = Base64Url.decode(parts[1], null, 256),
                tag = Base64Url.decode(parts[2], PrivateSyncSchemas.GCM_TAG_BYTES, 32),
            )
        return try {
            protector.unwrap(wrapped)
        } catch (_: Exception) {
            clearVaultKey()
            null
        }
    }

    override fun storeVaultKey(key: ByteArray) {
        val wrapped = protector.wrap(key)
        val encoded =
            listOf(
                Base64Url.encode(wrapped.nonce),
                Base64Url.encode(wrapped.ciphertext),
                Base64Url.encode(wrapped.tag),
            ).joinToString("|")
        prefs.edit().putString(PREF_WRAPPED_VAULT, encoded).apply()
    }

    override fun clearVaultKey() {
        prefs.edit().remove(PREF_WRAPPED_VAULT).apply()
    }

    private fun loadOrCreateMasterKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getKey(masterKeyAlias, null) as? SecretKey
        if (existing != null) {
            return existing
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val builder =
            KeyGenParameterSpec.Builder(
                masterKeyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setUnlockedDeviceRequired(true)
        }
        generator.init(builder.build())
        return generator.generateKey()
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val PREFS_NAME = "escapehatch_private_sync_vault"
        private const val PREF_WRAPPED_VAULT = "wrapped_vault_v1"
        const val DEFAULT_MASTER_ALIAS = "escapehatch_private_sync_master_v1"
    }
}
