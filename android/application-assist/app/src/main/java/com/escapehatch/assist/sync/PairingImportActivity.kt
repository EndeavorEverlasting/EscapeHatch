package com.escapehatch.assist.sync

import android.content.Intent
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

/**
 * Explicit operator-confirmed vault pairing. Never auto-pairs; never logs the SAS code.
 */
class PairingImportActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var codeInput: EditText
    private lateinit var lanBaseUrl: EditText
    private lateinit var confirmButton: Button
    private var offerJson: String? = null
    private val importer by lazy {
        PrivateSyncPairingImport(AndroidKeystoreSyncVaultKeyRepository(applicationContext))
    }

    private fun setOfferLoaded(loaded: Boolean, message: String) {
        status.text = message
        confirmButton.isEnabled = loaded
        confirmButton.alpha = if (loaded) 1f else 0.45f
    }

    private val openOffer =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri == null) {
                setOfferLoaded(false, getString(R.string.pairing_offer_cancelled))
                return@registerForActivityResult
            }
            offerJson = contentResolver.openInputStream(uri)?.use { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).readText()
            }
            if (offerJson.isNullOrBlank()) {
                setOfferLoaded(false, getString(R.string.pairing_offer_unreadable))
            } else {
                setOfferLoaded(true, getString(R.string.pairing_offer_loaded))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_pairing_import)
        status = findViewById(R.id.pairingStatus)
        codeInput = findViewById(R.id.pairingCode)
        lanBaseUrl = findViewById(R.id.lanBaseUrl)
        confirmButton = findViewById(R.id.confirmPairing)
        LanHostMemory.bind(lanBaseUrl, this)
        // Confirm stays disabled until a sealed offer is loaded — prevents the
        // "Choose a pairing offer first" dead-end after typing the code early.
        setOfferLoaded(false, getString(R.string.pairing_offer_required))
        findViewById<Button>(R.id.chooseOffer).setOnClickListener {
            openOffer.launch(arrayOf("application/json", "text/*", "*/*"))
        }
        findViewById<Button>(R.id.fetchOfferLan).setOnClickListener { fetchOfferFromLan() }
        confirmButton.setOnClickListener { confirmImport() }
    }

    private fun fetchOfferFromLan() {
        setOfferLoaded(false, getString(R.string.lan_fetching))
        val raw = lanBaseUrl.text?.toString().orEmpty()
        LanSealedFetch.fetchText(raw, "/offer") { outcome ->
            runOnUiThread {
                when (outcome) {
                    is LanSealedFetch.Outcome.Ok -> {
                        LanHostMemory.write(this, raw)
                        offerJson = outcome.body
                        setOfferLoaded(true, getString(R.string.pairing_offer_loaded))
                    }
                    is LanSealedFetch.Outcome.Err -> {
                        setOfferLoaded(false, getString(R.string.lan_fetch_failed, outcome.reason))
                    }
                }
            }
        }
    }

    private fun confirmImport() {
        val offer = offerJson
        val code = codeInput.text?.toString()?.trim().orEmpty()
        if (offer.isNullOrBlank()) {
            status.text = getString(R.string.pairing_offer_required)
            return
        }
        if (code.length != 16) {
            status.text = getString(R.string.pairing_code_invalid)
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
                status.text = getString(R.string.pairing_keystore_failed)
                codeInput.text?.clear()
                return
            }
        status.text =
            when (result.state) {
                PairingImportState.IMPORTED -> getString(R.string.pairing_imported, result.vaultId ?: "")
                PairingImportState.SILENT_PAIRING_REFUSED -> getString(R.string.pairing_silent_refused)
                PairingImportState.PAIRING_ALREADY_PROVISIONED -> getString(R.string.pairing_already_provisioned)
                PairingImportState.INVALID_PAIRING_OFFER -> getString(R.string.pairing_offer_invalid)
                PairingImportState.INVALID_PAIRING_CODE -> getString(R.string.pairing_code_invalid)
                PairingImportState.PAIRING_EXPIRED -> getString(R.string.pairing_expired)
                PairingImportState.AUTHENTICATION_FAILED -> getString(R.string.pairing_auth_failed)
            }
        codeInput.text?.clear()
        if (result.state == PairingImportState.IMPORTED) {
            // Continue straight into sealed capsule import / Send proof to PC.
            startActivity(Intent(this, CapsuleImportActivity::class.java))
        }
    }
}
