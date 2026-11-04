package com.escapehatch.assist.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneSyncProofReceiptTest {
    @Test
    fun toJson_isValueFreeAndListsCognizantIds() {
        val json =
            PhoneSyncProofReceipt.toJson(
                vaultId = "875b0e4f108925c3079a873b6f9f9d8f",
                entryCount = 26,
                cognizantFieldIds =
                    listOf(
                        "talent_community.industry_preferences",
                        "talent_community.new_graduate_interest",
                        "talent_community.primary_areas",
                    ),
                projectionDigest = "d9c4a8b80682fd06ffe0f1d0de14aa0622ac7338660f8dc33b147a426d8c448e",
                createdAtIso = "2026-11-04T03:00:00Z",
            )
        assertTrue(json.contains(PhoneSyncProofReceipt.SCHEMA))
        assertTrue(json.contains("talent_community.primary_areas"))
        assertTrue(json.contains("d9c4a8b80682fd06ffe0f1d0de14aa0622ac7338660f8dc33b147a426d8c448e"))
        assertEquals(true, json.contains("\"reusableAnswerCount\":26"))
        assertFalse(json.contains("Synthetic"))
        assertFalse(json.contains("password"))
    }
}
