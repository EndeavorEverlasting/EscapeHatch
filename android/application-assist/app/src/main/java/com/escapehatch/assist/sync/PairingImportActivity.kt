package com.escapehatch.assist.sync

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.escapehatch.assist.R
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Explicit operator-confirmed vault pairing.
 * Primary path: LAN fetch offer + desktop-visible code + Confirm.
 * Offline backup: EscapeHatchPhoneDrop folder grant with fixed filenames.
 */
class PairingImportActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var stepRail: TextView
    private lateinit var codeInput: EditText
    private lateinit var lanBaseUrl: EditText
    private lateinit var confirmButton: Button
    private lateinit var fetchLanButton: Button
    private var offerJson: String? = null
    private val importer by lazy {
        PrivateSyncPairingImport(AndroidKeystoreSyncVaultKeyRepository(applicationContext))
    }

    private fun offerReady(): Boolean = !offerJson.isNullOrBlank()

    private fun codeReady(): Boolean = codeInput.text?.toString()?.trim().orEmpty().length == 16

    private fun updateStepUi(message: String? = null) {
        val offerOk = offerReady()
        val codeOk = codeReady()
        confirmButton.isEnabled = offerOk && codeOk
        confirmButton.alpha = if (confirmButton.isEnabled) 1f else 0.45f
        confirmButton.text =
            if (confirmButton.isEnabled) {
                getString(R.string.pairing_confirm_ready)
            } else {
                getString(R.string.pairing_confirm)
            }
        if (offerOk) {
            fetchLanButton.text = getString(R.string.pairing_fetch_lan_done)
        } else {
            fetchLanButton.text = getString(R.string.pairing_fetch_lan)
        }
        stepRail.text =
            when {
                !offerOk -> getString(R.string.pairing_step_rail_initial)
                !codeOk -> getString(R.string.pairing_step_code_needed)
                else -> getString(R.string.pairing_step_ready)
            }
        if (message != null) {
            status.text = message
        } else if (!offerOk) {
            status.text = getString(R.string.pairing_offer_required)
        } else if (!codeOk) {
            status.text = getString(R.string.pairing_offer_loaded)
        } else {
            status.text = getString(R.string.pairing_next_confirm)
        }
    }

    private val openPackFolder =
        registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
            if (uri == null) {
                updateStepUi(getString(R.string.pairing_offer_cancelled))
                return@registerForActivityResult
            }
            PhonePackStore.saveTreeUri(this, uri)
            loadFromPhonePack()
        }

    private val openOffer =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri == null) {
                updateStepUi(getString(R.string.pairing_offer_cancelled))
                return@registerForActivityResult
            }
            offerJson = contentResolver.openInputStream(uri)?.use { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).readText()
            }
            if (offerJson.isNullOrBlank()) {
                updateStepUi(getString(R.string.pairing_offer_unreadable))
            } else {
                updateStepUi(getString(R.string.pairing_offer_loaded))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_pairing_import)
        status = findViewById(R.id.pairingStatus)
        stepRail = findViewById(R.id.pairingStepRail)
        codeInput = findViewById(R.id.pairingCode)
        lanBaseUrl = findViewById(R.id.lanBaseUrl)
        confirmButton = findViewById(R.id.confirmPairing)
        fetchLanButton = findViewById(R.id.fetchOfferLan)
        LanHostMemory.bind(lanBaseUrl, this)
        codeInput.addTextChangedListener(
            object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    updateStepUi()
                }
            },
        )
        findViewById<Button>(R.id.choosePackFolder).setOnClickListener {
            openPackFolder.launch(null)
        }
        findViewById<Button>(R.id.chooseOffer).setOnClickListener {
            openOffer.launch(arrayOf("application/json", "text/*", "*/*"))
        }
        fetchLanButton.setOnClickListener { fetchOfferFromLan() }
        confirmButton.setOnClickListener { confirmImport() }
        updateStepUi()
        if (PhonePackStore.treeUri(this) != null) {
            loadFromPhonePack()
        }
    }

    private fun loadFromPhonePack() {
        val offer = PhonePackStore.readText(this, PhonePackStore.OFFER_FILE)
        if (offer.isNullOrBlank()) {
            updateStepUi(getString(R.string.phone_pack_offer_missing))
            return
        }
        offerJson = offer
        val code = PhonePackStore.readText(this, PhonePackStore.CODE_FILE)
            ?.trim()
            ?.filter { !it.isWhitespace() }
            ?.take(16)
        if (!code.isNullOrBlank() && code.length == 16) {
            codeInput.setText(code)
        }
        updateStepUi(getString(R.string.phone_pack_loaded))
    }

    private fun fetchOfferFromLan() {
        updateStepUi(getString(R.string.lan_fetching))
        val raw = lanBaseUrl.text?.toString().orEmpty()
        LanSealedFetch.fetchText(raw, "/offer") { outcome ->
            runOnUiThread {
                when (outcome) {
                    is LanSealedFetch.Outcome.Ok -> {
                        LanHostMemory.write(this, raw)
                        offerJson = outcome.body
                        updateStepUi(getString(R.string.pairing_offer_loaded))
                    }
                    is LanSealedFetch.Outcome.Err -> {
                        offerJson = null
                        updateStepUi(getString(R.string.lan_fetch_failed, outcome.reason))
                    }
                }
            }
        }
    }

    private fun confirmImport() {
        val offer = offerJson
        val code = codeInput.text?.toString()?.trim().orEmpty()
        if (offer.isNullOrBlank()) {
            updateStepUi(getString(R.string.pairing_offer_required))
            return
        }
        if (code.length != 16) {
            updateStepUi(getString(R.string.pairing_code_invalid))
            return
        }
        val result =
            try {
                importer.importPairingOfferJson(
                    offerJson = offer,
                    pairingCode = code,
                    operatorConfirmed = true,
                )
            } catch (_: Exception) {
                updateStepUi(getString(R.string.pairing_keystore_failed))
                return
            }
        val message =
            when (result.state) {
                PairingImportState.IMPORTED -> getString(R.string.pairing_imported, result.vaultId ?: "")
                PairingImportState.SILENT_PAIRING_REFUSED -> getString(R.string.pairing_silent_refused)
                PairingImportState.PAIRING_ALREADY_PROVISIONED -> getString(R.string.pairing_already_provisioned)
                PairingImportState.INVALID_PAIRING_OFFER -> getString(R.string.pairing_offer_invalid)
                PairingImportState.INVALID_PAIRING_CODE -> getString(R.string.pairing_code_invalid)
                PairingImportState.PAIRING_EXPIRED -> getString(R.string.pairing_expired)
                PairingImportState.AUTHENTICATION_FAILED -> getString(R.string.pairing_auth_failed)
            }
        if (result.state == PairingImportState.IMPORTED ||
            result.state == PairingImportState.PAIRING_ALREADY_PROVISIONED
        ) {
            stepRail.text = getString(R.string.pairing_step_done)
            status.text = message
            startActivity(Intent(this, CapsuleImportActivity::class.java))
            return
        }
        updateStepUi(message)
    }
}
