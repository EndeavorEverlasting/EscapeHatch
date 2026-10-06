# EscapeHatch local web cockpit

This is the portable local-first cockpit recovered from the Replit donor at `b01f62860a27081418877069f599dbc6aa510b8e`.

It stores profile, answers, opportunities, applications, drafts, and Assist review state in browser-local storage. Resume intake is local-only and review-first. The canonical browser Application Assist control loop remains `browser/application-assist/`; this cockpit does not gain automatic submit, navigation, or attestation authority.

## Run locally

```bash
npm install
npm run typecheck
npm run test:unit
npm run build
npm run dev
```

The dev server binds to `127.0.0.1` by default. Set `PORT`, `BASE_PATH`, or `HOST` explicitly when needed.
