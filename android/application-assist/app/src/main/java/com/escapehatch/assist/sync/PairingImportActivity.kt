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
 * Explicit operator-confirmed vault pairing. Primary path: one phone-pack
 * folder grant that auto-loads pairing-offer.json + PAIRING_CODE.txt.
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

    private val openPackFolder =
        registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
            if (uri == null) {
                setOfferLoaded(false, getString(R.string.pairing_offer_cancelled))
                return@registerForActivityResult
            }
            PhonePackStore.saveTreeUri(this, uri)
            loadFromPhonePack()
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
        setOfferLoaded(false, getString(R.string.pairing_offer_required))
        findViewById<Button>(R.id.choosePackFolder).setOnClickListener {
            openPackFolder.launch(null)
        }
        findViewById<Button>(R.id.chooseOffer).setOnClickListener {
            openOffer.launch(arrayOf("application/json", "text/*", "*/*"))
        }
        findViewById<Button>(R.id.fetchOfferLan).setOnClickListener { fetchOfferFromLan() }
        confirmButton.setOnClickListener { confirmImport() }
        // Resume a previously granted EscapeHatchPhoneDrop folder.
        if (PhonePackStore.treeUri(this) != null) {
            loadFromPhonePack()
        }
    }

    private fun loadFromPhonePack() {
        val offer = PhonePackStore.readText(this, PhonePackStore.OFFER_FILE)
        if (offer.isNullOrBlank()) {
            setOfferLoaded(false, getString(R.string.phone_pack_offer_missing))
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
        setOfferLoaded(true, getString(R.string.phone_pack_loaded))
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
            startActivity(Intent(this, CapsuleImportActivity::class.java))
        }
    }
}
