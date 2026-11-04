package com.escapehatch.assist.sync

import android.os.Build

/**
 * Value-free phone proof artifact for desktop compare.
 * Never includes preference values or pairing codes.
 * Emulator / lab builds must not claim android-phone (cannot close threeOfThree).
 */
object PhoneSyncProofReceipt {
    const val SCHEMA = "escapehatch/private-sync-phone-proof-receipt/v1"
    const val SUGGESTED_FILE_NAME = "escapehatch-phone-sync-proof.json"

    fun isEmulatorLab(): Boolean {
        // Build.* can be null in JVM unit tests — never NPE; empty ⇒ not an emulator claim.
        val fingerprint = Build.FINGERPRINT?.lowercase().orEmpty()
        val model = Build.MODEL?.lowercase().orEmpty()
        val product = Build.PRODUCT?.lowercase().orEmpty()
        val hardware = Build.HARDWARE?.lowercase().orEmpty()
        val brand = Build.BRAND?.lowercase().orEmpty()
        val device = Build.DEVICE?.lowercase().orEmpty()
        val manufacturer = Build.MANUFACTURER?.lowercase().orEmpty()
        val board = Build.BOARD?.lowercase().orEmpty()
        if (fingerprint.isEmpty() && model.isEmpty() && product.isEmpty() && hardware.isEmpty()) {
            return false
        }
        if (fingerprint.startsWith("generic") || fingerprint.contains("unknown")) return true
        if (model.contains("google_sdk") || model.contains("emulator") || model.contains("android sdk built for")) {
            return true
        }
        if (product.contains("sdk") || product.contains("emulator") || product.contains("google_sdk")) return true
        if (hardware.contains("goldfish") || hardware.contains("ranchu") || hardware.contains("vbox")) return true
        if (brand.startsWith("generic") && device.startsWith("generic")) return true
        if (manufacturer.contains("genymotion")) return true
        if (board == "qc_reference_phone") return true
        return false
    }

    fun toJson(
        vaultId: String?,
        entryCount: Int,
        cognizantFieldIds: List<String>,
        projectionDigest: String?,
        createdAtIso: String,
    ): String {
        val lab = isEmulatorLab()
        val deviceClaim = if (lab) "android-emulator" else "android-phone"
        val cognizant =
            cognizantFieldIds.joinToString(separator = ",") { id ->
                JsonCompat.quote(id)
            }
        return buildString {
            append('{')
            append("\"schema\":").append(JsonCompat.quote(SCHEMA)).append(',')
            append("\"createdAt\":").append(JsonCompat.quote(createdAtIso)).append(',')
            append("\"device\":").append(JsonCompat.quote(deviceClaim)).append(',')
            if (lab) {
                append("\"deviceKind\":").append(JsonCompat.quote("android-emulator")).append(',')
                append("\"notPhoneThreeOfThree\":true,")
            }
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
