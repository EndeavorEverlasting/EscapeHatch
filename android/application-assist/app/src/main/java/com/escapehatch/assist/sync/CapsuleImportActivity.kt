package com.escapehatch.assist.sync

import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.escapehatch.assist.R
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Explicit operator import of a ciphertext preference capsule (.ehsync).
 * Never logs answer values; status shows field ids and digest only.
 */
class CapsuleImportActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private val importer by lazy {
        PrivateSyncCapsuleImport(
            AndroidKeystoreSyncVaultKeyRepository(applicationContext),
            PrivateSyncCapsuleImport.defaultProjectionFile(filesDir),
        )
    }

    private val openCapsule =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri == null) {
                status.text = getString(R.string.capsule_cancelled)
                return@registerForActivityResult
            }
            val raw =
                contentResolver.openInputStream(uri)?.use { stream ->
                    BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).readText()
                }
            if (raw.isNullOrBlank()) {
                status.text = getString(R.string.capsule_unreadable)
                return@registerForActivityResult
            }
            applyImport(importer.importCapsuleJson(raw))
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_capsule_import)
        status = findViewById(R.id.capsuleStatus)
        findViewById<Button>(R.id.chooseCapsule).setOnClickListener {
            openCapsule.launch(arrayOf("application/json", "text/*", "*/*"))
        }
    }

    private fun applyImport(result: CapsuleImportResult) {
        status.text =
            when (result.state) {
                CapsuleImportState.IMPORTED ->
                    getString(
                        R.string.capsule_imported,
                        result.entryCount,
                        result.cognizantFieldIds.joinToString(", "),
                        result.projectionDigest ?: "",
                    )
                CapsuleImportState.PAIRING_REQUIRED -> getString(R.string.capsule_pairing_required)
                CapsuleImportState.INVALID_CAPSULE -> getString(R.string.capsule_invalid)
                CapsuleImportState.WRONG_VAULT_KEY -> getString(R.string.capsule_wrong_vault)
                CapsuleImportState.AUTHENTICATION_FAILED -> getString(R.string.capsule_auth_failed)
                CapsuleImportState.INVALID_SYNC_PROJECTION -> getString(R.string.capsule_projection_invalid)
            }
    }
}
