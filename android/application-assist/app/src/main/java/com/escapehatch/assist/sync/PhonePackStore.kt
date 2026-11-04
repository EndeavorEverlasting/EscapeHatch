package com.escapehatch.assist.sync

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile

/**
 * Single phone-pack folder contract. Host stages fixed names only; the app
 * never asks the operator to hunt hash filenames.
 */
object PhonePackStore {
    const val PREFS = "escapehatch_phone_pack"
    const val KEY_TREE_URI = "tree_uri"
    const val OFFER_FILE = "pairing-offer.json"
    const val ANSWERS_FILE = "escapehatch-answers.ehsync"
    const val CODE_FILE = "PAIRING_CODE.txt"
    const val PROOF_FILE = "escapehatch-phone-sync-proof.json"

    fun saveTreeUri(context: Context, uri: Uri) {
        val flags =
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            context.contentResolver.takePersistableUriPermission(uri, flags)
        } catch (_: SecurityException) {
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            } catch (_: SecurityException) {
                // Folder still usable for this session without persist.
            }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TREE_URI, uri.toString())
            .apply()
    }

    fun treeUri(context: Context): Uri? {
        val raw =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_TREE_URI, null) ?: return null
        return Uri.parse(raw)
    }

    fun root(context: Context): DocumentFile? {
        val uri = treeUri(context) ?: return null
        return DocumentFile.fromTreeUri(context, uri)
    }

    fun findChild(context: Context, fileName: String): DocumentFile? {
        val dir = root(context) ?: return null
        return dir.findFile(fileName)
            ?: dir.listFiles().firstOrNull { it.name.equals(fileName, ignoreCase = true) }
    }

    fun readText(context: Context, fileName: String): String? {
        val child = findChild(context, fileName) ?: return null
        return context.contentResolver.openInputStream(child.uri)?.use { stream ->
            stream.bufferedReader(Charsets.UTF_8).readText()
        }
    }

    fun writeText(context: Context, fileName: String, body: String): Boolean {
        val dir = root(context) ?: return false
        val existing = findChild(context, fileName)
        val target =
            existing
                ?: dir.createFile("application/json", fileName)
                ?: return false
        context.contentResolver.openOutputStream(target.uri, "wt")?.use { stream ->
            stream.write(body.toByteArray(Charsets.UTF_8))
        } ?: return false
        return true
    }
}
