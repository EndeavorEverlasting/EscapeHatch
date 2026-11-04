package com.escapehatch.assist.sync

/**
 * Value-free phone proof artifact for desktop compare.
 * Never includes preference values or pairing codes.
 */
object PhoneSyncProofReceipt {
    const val SCHEMA = "escapehatch/private-sync-phone-proof-receipt/v1"
    const val SUGGESTED_FILE_NAME = "escapehatch-phone-sync-proof.json"

    fun toJson(
        vaultId: String?,
        entryCount: Int,
        cognizantFieldIds: List<String>,
        projectionDigest: String?,
        createdAtIso: String,
    ): String {
        val cognizant =
            cognizantFieldIds.joinToString(separator = ",") { id ->
                JsonCompat.quote(id)
            }
        return buildString {
            append('{')
            append("\"schema\":").append(JsonCompat.quote(SCHEMA)).append(',')
            append("\"createdAt\":").append(JsonCompat.quote(createdAtIso)).append(',')
            append("\"device\":").append(JsonCompat.quote("android-phone")).append(',')
            append("\"phoneState\":").append(JsonCompat.quote("IMPORTED")).append(',')
            append("\"vaultId\":")
            if (vaultId == null) append("null") else append(JsonCompat.quote(vaultId))
            append(',')
            append("\"reusableAnswerCount\":").append(entryCount).append(',')
            append("\"projectionDigest\":")
            if (projectionDigest == null) append("null") else append(JsonCompat.quote(projectionDigest))
            append(',')
            append("\"cognizantTalentCommunityFieldsPresent\":[").append(cognizant).append(']')
            append('}')
        }
    }
}
