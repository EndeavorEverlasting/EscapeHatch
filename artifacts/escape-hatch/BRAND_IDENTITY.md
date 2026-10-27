# EscapeHatch chick-and-hatch brand identity

**Approved direction:** Use the user-provided cheerful chick emerging from the futuristic teal hatch as EscapeHatch's mascot. The implementation is bounded to product identity, not a redesign or an automatic-application capability.

## Semantics

- The **hatch** means a recoverable path through application friction.
- The **chick** represents approachable guidance and forward progress, never authority to choose a job, sign a declaration, or submit an application.
- The teal shell, cream face and warm rim lighting extend the existing cockpit palette; existing layouts and career data remain intact.
- Keep **EscapeHatch** visibly adjacent to the mascot in navigation; the nearby image has an empty alt attribute to avoid duplicating the spoken name.

## Artwork provenance and deployment

- Operator-uploaded source: `Cheerful Chick in a Futuristic Hatch.png`; 1254 × 1254 RGBA with transparency.
- Source SHA-256: `85b54bd3e0936413c818eecbf4fe3c24b8fadbdf96b612542524bc87ab12ef9f`.
- Deployed derivative: `public/escapehatch-mascot.webp` (128 × 128 transparent WebP, 5004 bytes).
- Derivative SHA-256: `e1e0f6e7ff0470231ae3ffa042e6a36555659a86ea070bee036e2badcec76451`.
- The SVG favicon is a lightweight semantic fallback; the WebP is the pixel-faithful optimized miniature. Do not enlarge the 128px asset to a large hero image: export a new high-resolution variant from the operator's original source instead.

## UI ownership and regression gates

- `src/App.tsx`: same asset for desktop sidebar and mobile navigation.
- `index.html`: favicon and truthful product metadata.
- `brand-identity.test.ts`: detects missing/modified bytes, missing image wiring, and Replit placeholder copy.
- `tests/brand-identity.spec.ts`: checks actual browser image loading on desktop and mobile.
- `npm run test:unit`, `npm run test:browser`, `npm run build` and deployed cockpit launch are different evidence gates. Do not label a PR as live.

The private operator's career state and the final-submit boundary are unchanged.

Relevant design guidance: [Upstream Intelligence Library START HERE](https://drive.google.com/file/d/1pwYg8VaP-G23wiZ2bVABmmGEVjLTJyIh/view) and [Registry](https://drive.google.com/file/d/1Xc6T70qEvb9tE1JM9SNDBWXfbSiYBZyE/view). Those resources inform review but are not deployed third-party assets.


## 2026-10-27: contextual tutorial and the chirp contract

**Selected rendition:** The chick is part of the existing Today / `GuidedStart` tutorial, not a floating agent or an autonomous browser controller. It provides a small, visible speech-style nudge plus a user-opened accessible **Your next puzzle pieces** dialog. Both use the existing mascot WebP; the same image remains the browser-tab favicon.

**Source-to-design decisions (private workbook read; public principles only):**

- **Impeccable** (`impeccable`): deliberately improve hierarchy, copy, empty states, responsive fit and accessibility, without installing the donor.
- **Motion / AnimatePresence** (`motion-animate-presence`): take the state-transition principle, not the library. The already-installed Radix Dialog handles focus, Escape and overlay presentation.
- **Playwright Visual Comparisons** (`UP-60B0939CC`): use browser-observable desktop/mobile checks, not only React render output.
- **W3C WCAG 2.3.3** (`UP-60FBA76B5`): motion only on intentional hover, with `prefers-reduced-motion` protection.
- **web.dev Animation Guide** (`UP-F8DA7EE77`): small compositor-friendly transform, no continuous animation or high-frequency work.

The registry lists reference/review states; this release adopts bounded interaction principles, **not external code, imagery or unverified licenses**.

**Behavioral contract:**
1. Profile guidance is derived from the **same eight reusable profile details** as the existing completion meter. First name, last name and email are marked local-profile essentials. Other blanks are optional polish and cannot block a real job.
2. The message names a *specific* missing reusable profile detail, or points to the next active opportunity/application inspection. The dialog enumerates blanks and lets the user navigate to the owner screen.
3. This is NOT the actual employer's required-field inventory. Only the scoped managed-browser form inspection can report observed employer inputs. Neither eight-of-eight profile completion nor a chirp infers submission, legal attestation, ATS readiness or application success.
4. A chirp *sound* is optional, brief and plays **only** when the user presses **Hear chirp**. The guide never autoplay-sounds, steals focus, interrupts forms, or displays unsolicited modal overlays.
5. The underlying three-step source → opportunity → form tutorial stays available; the dialog closes with Escape, returns focus to the trigger, works with keyboard/touch, and never retains private user data itself.

**Proof and upkeep:** `src/lib/mascot-guidance.test.ts` checks state projection (missing essential, optional, active-vs-applied, complete without false ATS success); `tests/mascot-guidance.spec.ts` checks visible messages, dialog/focus, responsive rendering and silent default. The repo's web-cockpit CI enforces these alongside the protected application journey checks. CI PASS is distinct from the operator's installed Windows application's refresh, which remains a separate live observation.
