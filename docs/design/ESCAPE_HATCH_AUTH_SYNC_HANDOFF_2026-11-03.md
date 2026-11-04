# EscapeHatch auth + sync handoff — design brief

**Audience:** applicant operator connecting cloud ciphertext sync and pairing a phone.  
**Primary job:** make “sign in with Google / seal vault / devices ready” feel like a product threshold—not a debug checklist.  
**Parent:** P04 #69 / PR #184 private sync. Operator Submit and employer credentials stay out of scope.

## Upstream (bounded)

| Resource ID | Mechanism | URL |
|---|---|---|
| `impeccable` | Shape → critique → distill product surfaces; treat empty/error as designed states | https://github.com/pbakaus/impeccable |
| `UP-F8D41DF99` / `gsap-flip` | FLIP continuity when chrome morphs across auth return | https://gsap.com/docs/v3/Plugins/Flip/ |
| `UP-698D174BC` | View Transitions for document-level handoff after OAuth return | https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API |
| `motion-animate-presence` | Enter/exit presence for status stages without card spam | https://github.com/motiondivision/motion |

License/visual gates: Flip/Motion are dependency choices—prototype uses CSS + View Transitions first; no new npm deps in this sprint.

## Design plan

**Color:** `#101612` corridor ink · `#1c2a22` panel · `#f3efe6` paper · `#c6f54c` hatch glow · `#8fd3c8` calm confirm · `#c45c26` recoverable warn.  
**Type:** Syne (display) + Source Serif 4 (body) — hatch/exit vernacular, not SaaS Inter.  
**Layout:** one full-bleed threshold scene; brand “EscapeHatch” as hero; one verb CTA; status ribbon that FLIP-morphs in place after return. No dashboard cards in the first viewport.  
**Principles:** (1) Product voice names the human action, never paths/temp files. (2) Browser OAuth is a planned exit/return, choreographed. (3) Ciphertext-only promise is visible before consent. (4) Device pair is a second beat inside the same corridor, not a separate debug page.

## Uniqueness review

Rejected cream/terracotta, purple gradient SaaS, and numbered “01/02/03” marketing strips. Chosen corridor-to-hatch light with a single morphing status rail (NordVPN-like continuity without copying NordVPN chrome).

## Prototype

Interactive mock: `docs/design/prototypes/auth-sync-handoff.html`  
Lab phone proof helper (temporary): `%TEMP%\escapehatch-phone-proof-helper.html` — not the product UI.

## Proof ceiling

This sprint delivers design + clickable prototype and journey note. Live Google OAuth client config, production signing, and phone 3/3 digest proof remain separate gates.
