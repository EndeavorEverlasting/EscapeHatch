package com.escapehatch.assist.spike

/**
 * Presentation affordance state only. Does not promote Application Assist workflow status.
 */
enum class AffordanceState {
    UNAVAILABLE,
    DORMANT,
    AVAILABLE,
    SURFACED,
    EXPANDED,
    TEMPORARILY_DISMISSED,
    SESSION_ENDED,
}

class PresenceSurfaceStateMachine(initial: AffordanceState = AffordanceState.DORMANT) {
    var state: AffordanceState = initial
        private set

    private val allowed = mapOf(
        AffordanceState.UNAVAILABLE to setOf(AffordanceState.DORMANT),
        AffordanceState.DORMANT to setOf(AffordanceState.AVAILABLE),
        AffordanceState.AVAILABLE to setOf(
            AffordanceState.SURFACED,
            AffordanceState.EXPANDED,
            AffordanceState.SESSION_ENDED,
        ),
        AffordanceState.SURFACED to setOf(
            AffordanceState.EXPANDED,
            AffordanceState.TEMPORARILY_DISMISSED,
            AffordanceState.SESSION_ENDED,
        ),
        AffordanceState.EXPANDED to setOf(
            AffordanceState.SURFACED,
            AffordanceState.TEMPORARILY_DISMISSED,
            AffordanceState.SESSION_ENDED,
        ),
        AffordanceState.TEMPORARILY_DISMISSED to setOf(
            AffordanceState.AVAILABLE,
            AffordanceState.SURFACED,
            AffordanceState.SESSION_ENDED,
        ),
        AffordanceState.SESSION_ENDED to setOf(AffordanceState.DORMANT),
    )

    fun transition(to: AffordanceState): Boolean {
        val next = allowed[state] ?: emptySet()
        if (to !in next) return false
        state = to
        return true
    }
}
