package com.escapehatch.assist.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URI

class LanSealedFetchTest {
    @Test
    fun allowsPrivateLanPhoneProofPort() {
        assertNotNull(LanSealedFetch.normalizeBaseUrl("http://192.168.1.80:18765"))
        assertNotNull(LanSealedFetch.normalizeBaseUrl("192.168.1.80:18765"))
        assertTrue(LanSealedFetch.isAllowedLanUri(URI("http://10.0.0.5:18765/")))
        assertTrue(LanSealedFetch.isAllowedLanUri(URI("http://172.16.0.2:18765")))
    }

    @Test
    fun refusesPublicHostsAndWrongPorts() {
        assertNull(LanSealedFetch.normalizeBaseUrl("http://example.com:18765"))
        assertNull(LanSealedFetch.normalizeBaseUrl("http://192.168.1.80:80"))
        assertNull(LanSealedFetch.normalizeBaseUrl("http://8.8.8.8:18765"))
        assertFalse(LanSealedFetch.isAllowedLanUri(URI("https://192.168.1.80:443")))
    }

    @Test
    fun defaultPortFilledForBarePrivateHost() {
        assertEquals("http://192.168.1.80:18765", LanSealedFetch.normalizeBaseUrl("192.168.1.80"))
    }
}
