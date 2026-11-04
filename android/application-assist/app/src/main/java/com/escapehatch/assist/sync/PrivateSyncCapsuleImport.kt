package com.escapehatch.assist.sync

import java.io.File
import java.security.MessageDigest

enum class CapsuleImportState {
    IMPORTED,
    PAIRING_REQUIRED,
    INVALID_CAPSULE,
    WRONG_VAULT_KEY,
    AUTHENTICATION_FAILED,
    INVALID_SYNC_PROJECTION,
}

data class CapsuleImportResult(
    val state: CapsuleImportState,
    val vaultId: String? = null,
    val entryCount: Int = 0,
    val cognizantFieldIds: List<String> = emptyList(),
    /** SHA-256 hex of the opened projection JSON; never includes plaintext answer values in UI copy. */
    val projectionDigest: String? = null,
)

/**
 * Operator-driven ciphertext capsule import. Opens an `.ehsync` envelope with the
 * Keystore-backed vault key and stores only the reusable projection privately.
 */
class PrivateSyncCapsuleImport(
    private val vaultKeyRepository: SyncVaultKeyRepository,
    private val projectionStore: File,
    private val crypto: PrivateSyncCrypto = PrivateSyncCrypto(),
) {
    fun importCapsuleJson(capsuleJson: String): CapsuleImportResult {
        val secret = vaultKeyRepository.loadVaultKey() ?: return CapsuleImportResult(CapsuleImportState.PAIRING_REQUIRED)
        return try {
            val projectionJson = crypto.openProjectionJson(capsuleJson, secret)
            if (!projectionJson.contains(PrivateSyncSchemas.SYNC_PAYLOAD_SCHEMA)) {
                return CapsuleImportResult(CapsuleImportState.INVALID_SYNC_PROJECTION)
            }
            val entryIds = extractEntryIds(projectionJson)
            if (entryIds.isEmpty()) {
                return CapsuleImportResult(CapsuleImportState.INVALID_SYNC_PROJECTION)
            }
            val cognizant = entryIds.filter { it.startsWith("talent_community.") }.sorted()
            val digest = sha256Hex(projectionJson.toByteArray(Charsets.UTF_8))
            projectionStore.parentFile?.mkdirs()
            projectionStore.writeText(projectionJson, Charsets.UTF_8)
            CapsuleImportResult(
                state = CapsuleImportState.IMPORTED,
                vaultId = crypto.vaultIdForKey(secret),
                entryCount = entryIds.size,
                cognizantFieldIds = cognizant,
                projectionDigest = digest,
            )
        } catch (_: PrivateSyncException.WrongVaultKey) {
            CapsuleImportResult(CapsuleImportState.WRONG_VAULT_KEY)
        } catch (_: PrivateSyncException.CapsuleAuthenticationFailed) {
            CapsuleImportResult(CapsuleImportState.AUTHENTICATION_FAILED)
        } catch (_: PrivateSyncException.InvalidCapsule) {
            CapsuleImportResult(CapsuleImportState.INVALID_CAPSULE)
        } catch (_: PrivateSyncException.InvalidSyncProjection) {
            CapsuleImportResult(CapsuleImportState.INVALID_SYNC_PROJECTION)
        } finally {
            secret.fill(0)
        }
    }

    companion object {
        fun defaultProjectionFile(filesDir: File): File = File(filesDir, "private-sync/synced-projection.json")

        fun extractEntryIds(projectionJson: String): List<String> {
            val marker = "\"entries\""
            val start = projectionJson.indexOf(marker)
            if (start < 0) return emptyList()
            var i = start + marker.length
            while (i < projectionJson.length && projectionJson[i].isWhitespace()) i++
            if (i >= projectionJson.length || projectionJson[i] != ':') return emptyList()
            i++
            while (i < projectionJson.length && projectionJson[i].isWhitespace()) i++
            if (i >= projectionJson.length || projectionJson[i] != '{') return emptyList()
            i++
            val ids = mutableListOf<String>()
            var depth = 1
            while (i < projectionJson.length && depth > 0) {
                when (projectionJson[i]) {
                    '{' -> {
                        depth++
                        i++
                    }
                    '}' -> {
                        depth--
                        i++
                    }
                    '"' -> {
                        if (depth == 1) {
                            val (key, next) = readJsonString(projectionJson, i)
                            ids.add(key)
                            i = next
                            while (i < projectionJson.length && projectionJson[i].isWhitespace()) i++
                            if (i < projectionJson.length && projectionJson[i] == ':') {
                                i++
                                while (i < projectionJson.length && projectionJson[i].isWhitespace()) i++
                                i = skipJsonValue(projectionJson, i)
                            }
                        } else {
                            i = readJsonString(projectionJson, i).second
                        }
                    }
                    else -> i++
                }
            }
            return ids
        }

        private fun readJsonString(raw: String, start: Int): Pair<String, Int> {
            var i = start
            if (raw[i] != '"') throw IllegalArgumentException("INVALID_JSON")
            i++
            val sb = StringBuilder()
            while (i < raw.length) {
                val ch = raw[i]
                if (ch == '\\') {
                    i++
                    if (i >= raw.length) throw IllegalArgumentException("INVALID_JSON")
                    sb.append(raw[i])
                    i++
                } else if (ch == '"') {
                    return sb.toString() to (i + 1)
                } else {
                    sb.append(ch)
                    i++
                }
            }
            throw IllegalArgumentException("INVALID_JSON")
        }

        private fun skipJsonValue(raw: String, start: Int): Int {
            var i = start
            when (raw.getOrNull(i)) {
                '"' -> return readJsonString(raw, i).second
                '{' -> {
                    var depth = 0
                    while (i < raw.length) {
                        when (raw[i]) {
                            '"' -> i = readJsonString(raw, i).second
                            '{' -> {
                                depth++
                                i++
                            }
                            '}' -> {
                                depth--
                                i++
                                if (depth == 0) return i
                            }
                            else -> i++
                        }
                    }
                }
                '[' -> {
                    var depth = 0
                    while (i < raw.length) {
                        when (raw[i]) {
                            '"' -> i = readJsonString(raw, i).second
                            '[' -> {
                                depth++
                                i++
                            }
                            ']' -> {
                                depth--
                                i++
                                if (depth == 0) return i
                            }
                            else -> i++
                        }
                    }
                }
                else -> {
                    while (i < raw.length && raw[i] !in ",}]") i++
                    return i
                }
            }
            return i
        }

        fun sha256Hex(bytes: ByteArray): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
            return digest.joinToString("") { "%02x".format(it) }
        }
    }
}
