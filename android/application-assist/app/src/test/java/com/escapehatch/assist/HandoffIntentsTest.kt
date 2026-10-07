package com.escapehatch.assist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * JVM unit tests for parser seams. Does not prove Android Activity reception.
 * Evidence class when executed under Android unit test task: still host/JVM unless instrumented.
 */
class HandoffIntentsTest {
    @Test
    fun parseDeepLink_extractsSessionAndUrl() {
        val ctx = HandoffIntents.parseDeepLink(
            "escapehatch://assist?session=sess-1&url=https%3A%2F%2Fjobs.example.com%2Fapply&company=Example",
        )
        assertNotNull(ctx)
        assertEquals("sess-1", ctx!!.sessionId)
        assertEquals("https://jobs.example.com/apply", ctx.url)
        assertEquals("Example", ctx.company)
        assertEquals("deep_link", ctx.source)
    }

    @Test
    fun parseDeepLink_rejectsForeignScheme() {
        assertNull(HandoffIntents.parseDeepLink("https://example.com/assist?session=x"))
    }

    @Test
    fun parseShareText_extractsUrl() {
        val ctx = HandoffIntents.parseShareText("Apply https://jobs.example.com/x why this role?")
        assertEquals("https://jobs.example.com/x", ctx.url)
        assertEquals("sharesheet", ctx.source)
    }
}
