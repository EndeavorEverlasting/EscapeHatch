package com.escapehatch.assist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HandoffAdmissionTest {
    @Test fun ordinaryHttpsPostingIsAccepted() {
        val url = "https://jobs.acme.com/apply?id=243&source=indeed"
        assertEquals(url, HandoffAdmission.publicJobUrl(url))
    }

    @Test fun sharedTrailingPunctuationIsRemoved() {
        assertEquals("https://jobs.acme.com/apply", HandoffAdmission.publicJobUrl(" https://jobs.acme.com/apply). "))
    }

    @Test fun credentialsAndNonstandardPortFailClosed() {
        assertNull(HandoffAdmission.publicJobUrl("https://user:secret@jobs.acme.com/"))
        assertNull(HandoffAdmission.publicJobUrl("https://jobs.acme.com:8443/apply"))
    }

    @Test fun privateOrInvalidSchemesAndHostsFailClosed() {
        val blocked = listOf(
            null, "", "http://jobs.acme.com/apply", "javascript:alert(1)",
            "https://localhost:5173/", "https://127.0.0.1/", "https://10.0.0.4/",
            "https://[::1]/", "https://corp.internal/form", "https://portal.local/",
            "https://jobs..acme.com/", "https://jobs.acme.com/apply?token=one two",
            "https://jobs.acme.com/" + "x".repeat(2100),
        )
        blocked.forEach { assertNull("Expected rejection: $it", HandoffAdmission.publicJobUrl(it)) }
    }
}
