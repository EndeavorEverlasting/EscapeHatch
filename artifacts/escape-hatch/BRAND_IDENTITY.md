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
