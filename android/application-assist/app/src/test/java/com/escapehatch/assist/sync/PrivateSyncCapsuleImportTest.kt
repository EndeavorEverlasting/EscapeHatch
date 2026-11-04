package com.escapehatch.assist.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class PrivateSyncCapsuleImportTest {
    private val crypto = PrivateSyncCrypto()
    private val keyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    private val deviceId = "a".repeat(32)

    @Test
    fun importCapsule_persistsProjectionAndReportsCognizantIdsWithoutRequiringValuesInUiContract() {
        val key = keyHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val projection =
            """
            {"schema":"escapehatch/reusable-preference-projection/v1","entries":{"talent_community.primary_areas":{"scope":"profile_preference","source":"user","value":"Synthetic Engineering","updated_at":"2026-11-03T00:00:00Z"},"talent_community.industry_preferences":{"scope":"profile_preference","source":"user","value":"Synthetic Healthcare","updated_at":"2026-11-03T00:00:00Z"},"talent_community.new_graduate_interest":{"scope":"profile_preference","source":"user","value":"No","updated_at":"2026-11-03T00:00:00Z"}}}
            """.trimIndent()
        val sealed = crypto.sealProjectionJson(projection, key, null, deviceId)
        val capsuleJson =
            """
            {"schema":"${sealed.schema}","vaultId":"${sealed.vaultId}","parent":null,"deviceId":"${sealed.deviceId}","nonce":"${sealed.nonce}","ciphertext":"${sealed.ciphertext}","tag":"${sealed.tag}"}
            """.trimIndent()

        val dir = createTempDirectory("eh-capsule-import").toFile()
        val store = File(dir, "synced-projection.json")
        val repo = InMemorySyncVaultKeyRepository().also { it.storeVaultKey(key) }
        val result = PrivateSyncCapsuleImport(repo, store, crypto).importCapsuleJson(capsuleJson)

        assertEquals(CapsuleImportState.IMPORTED, result.state)
        assertEquals(3, result.entryCount)
        assertEquals(
            listOf(
                "talent_community.industry_preferences",
                "talent_community.new_graduate_interest",
                "talent_community.primary_areas",
            ),
            result.cognizantFieldIds,
        )
        assertEquals(64, result.projectionDigest!!.length)
        assertTrue(store.exists())
        assertTrue(store.readText().contains("talent_community.primary_areas"))
    }

    @Test
    fun importCapsule_requiresPairingFirst() {
        val dir = createTempDirectory("eh-capsule-unpaired").toFile()
        val result =
            PrivateSyncCapsuleImport(InMemorySyncVaultKeyRepository(), File(dir, "p.json"), crypto)
                .importCapsuleJson("{}")
        assertEquals(CapsuleImportState.PAIRING_REQUIRED, result.state)
    }

    @Test
    fun extractEntryIds_readsTopLevelEntryKeys() {
        val ids =
            PrivateSyncCapsuleImport.extractEntryIds(
                """{"schema":"escapehatch/reusable-preference-projection/v1","entries":{"a.b":{"scope":"profile_preference"},"c.d":{"scope":"profile_preference"}}}""",
            )
        assertEquals(listOf("a.b", "c.d"), ids)
    }
}
