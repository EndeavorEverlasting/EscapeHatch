package com.escapehatch.assist.sync

/**
 * Minimal JSON helpers that match Node JSON.stringify for our fixed envelopes.
 * Avoids Android JVM unit-test stubs for org.json.JSONObject.
 */
internal object JsonCompat {
    fun stringifyArray(vararg values: Any?): String =
        values.joinToString(separator = ",", prefix = "[", postfix = "]") { value ->
            when (value) {
                null -> "null"
                is String -> quote(value)
                is Number, is Boolean -> value.toString()
                else -> quote(value.toString())
            }
        }

    fun quote(value: String): String {
        val escaped =
            buildString(value.length + 8) {
                for (ch in value) {
                    when (ch) {
                        '\\' -> append("\\\\")
                        '"' -> append("\\\"")
                        '\n' -> append("\\n")
                        '\r' -> append("\\r")
                        '\t' -> append("\\t")
                        else -> append(ch)
                    }
                }
            }
        return "\"$escaped\""
    }

    /** Parse a flat JSON object whose values are strings or null. */
    fun parseFlatObject(raw: String): Map<String, String?> {
        val body = raw.trim()
        if (!body.startsWith("{") || !body.endsWith("}")) throw IllegalArgumentException("INVALID_JSON")
        val out = linkedMapOf<String, String?>()
        var i = 1
        fun skipWs() {
            while (i < body.length && body[i].isWhitespace()) i++
        }
        fun readString(): String {
            if (body[i] != '"') throw IllegalArgumentException("INVALID_JSON")
            i++
            val start = i
            val sb = StringBuilder()
            while (i < body.length) {
                val ch = body[i]
                if (ch == '\\') {
                    i++
                    if (i >= body.length) throw IllegalArgumentException("INVALID_JSON")
                    when (val esc = body[i]) {
                        '"', '\\', '/' -> sb.append(esc)
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        else -> throw IllegalArgumentException("INVALID_JSON")
                    }
                    i++
                } else if (ch == '"') {
                    i++
                    return sb.toString()
                } else {
                    sb.append(ch)
                    i++
                }
            }
            throw IllegalArgumentException("INVALID_JSON")
        }
        skipWs()
        if (body[i] == '}') return out
        while (i < body.length) {
            skipWs()
            val key = readString()
            skipWs()
            if (body[i] != ':') throw IllegalArgumentException("INVALID_JSON")
            i++
            skipWs()
            val value =
                when {
                    body.startsWith("null", i) -> {
                        i += 4
                        null
                    }
                    body[i] == '"' -> readString()
                    else -> throw IllegalArgumentException("INVALID_JSON")
                }
            out[key] = value
            skipWs()
            if (i >= body.length) break
            when (body[i]) {
                ',' -> i++
                '}' -> {
                    i++
                    break
                }
                else -> throw IllegalArgumentException("INVALID_JSON")
            }
        }
        return out
    }
}
