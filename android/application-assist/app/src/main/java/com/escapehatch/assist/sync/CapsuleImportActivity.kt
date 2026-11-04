package com.escapehatch.assist.sync

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.escapehatch.assist.R
import java.io.BufferedReader
import java.io.InputStreamReader
import java.time.Instant

/**
 * Explicit operator import of a ciphertext preference capsule (.ehsync).
 * Never logs answer values; status shows field ids and digest only.
 * After import, operator can save a value-free proof JSON into OneDrive.
 */
class CapsuleImportActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var saveProof: Button
    private lateinit var copyProof: Button
    private lateinit var lanBaseUrl: EditText
    private var proofJson: String? = null
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

    private val createProof =
        registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
            val payload = proofJson
            if (uri == null || payload == null) {
                status.text = getString(R.string.capsule_proof_save_cancelled)
                return@registerForActivityResult
            }
            contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(payload.toByteArray(Charsets.UTF_8))
            }
            status.text = getString(R.string.capsule_proof_saved)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_capsule_import)
        status = findViewById(R.id.capsuleStatus)
        saveProof = findViewById(R.id.saveProof)
        copyProof = findViewById(R.id.copyProof)
        lanBaseUrl = findViewById(R.id.lanBaseUrl)
        LanHostMemory.bind(lanBaseUrl, this)
        findViewById<Button>(R.id.chooseCapsule).setOnClickListener {
            openCapsule.launch(arrayOf("application/json", "text/*", "*/*"))
        }
        findViewById<Button>(R.id.fetchCapsuleLan).setOnClickListener { fetchCapsuleFromLan() }
        saveProof.setOnClickListener {
            createProof.launch(PhoneSyncProofReceipt.SUGGESTED_FILE_NAME)
        }
        copyProof.setOnClickListener {
            val payload = proofJson
            if (payload.isNullOrBlank()) {
                status.text = getString(R.string.capsule_proof_copy_failed)
                return@setOnClickListener
            }
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("escapehatch-phone-sync-proof", payload))
            status.text = getString(R.string.capsule_proof_copied)
        }
    }

    private fun fetchCapsuleFromLan() {
        status.text = getString(R.string.lan_fetching)
        val raw = lanBaseUrl.text?.toString().orEmpty()
        LanSealedFetch.fetchText(raw, "/capsule") { outcome ->
            runOnUiThread {
                when (outcome) {
                    is LanSealedFetch.Outcome.Ok -> {
                        LanHostMemory.write(this, raw)
                        applyImport(importer.importCapsuleJson(outcome.body))
                    }
                    is LanSealedFetch.Outcome.Err -> {
                        status.text = getString(R.string.lan_fetch_failed, outcome.reason)
                    }
                }
            }
        }
    }

    private fun applyImport(result: CapsuleImportResult) {
        status.text =
            when (result.state) {
                CapsuleImportState.IMPORTED -> {
                    proofJson =
                        PhoneSyncProofReceipt.toJson(
                            vaultId = result.vaultId,
                            entryCount = result.entryCount,
                            cognizantFieldIds = result.cognizantFieldIds,
                            projectionDigest = result.projectionDigest,
                            createdAtIso = Instant.now().toString(),
                        )
                    saveProof.isEnabled = true
                    copyProof.isEnabled = true
                    getString(
                        R.string.capsule_imported,
                        result.entryCount,
                        result.cognizantFieldIds.joinToString(", "),
                        result.projectionDigest ?: "",
                    ) + "\n" + getString(R.string.capsule_proof_hint)
                }
                CapsuleImportState.PAIRING_REQUIRED -> getString(R.string.capsule_pairing_required)
                CapsuleImportState.INVALID_CAPSULE -> getString(R.string.capsule_invalid)
                CapsuleImportState.WRONG_VAULT_KEY -> getString(R.string.capsule_wrong_vault)
                CapsuleImportState.AUTHENTICATION_FAILED -> getString(R.string.capsule_auth_failed)
                CapsuleImportState.INVALID_SYNC_PROJECTION -> getString(R.string.capsule_projection_invalid)
            }
        if (result.state != CapsuleImportState.IMPORTED) {
            proofJson = null
            saveProof.isEnabled = false
            copyProof.isEnabled = false
        }
    }
}
