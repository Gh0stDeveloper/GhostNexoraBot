# UI Phase 2 — Windows Desktop

## Scope

Phase 2 redesigns the Tauri Windows application as a desktop control center while preserving the existing Control API and native security boundary.

Base commit: Android UI Phase 1 final candidate `ce2654c021af149d409f91ab27b40d8fd4089495`.

## Product goals

- Native desktop information density instead of a stretched mobile layout.
- Persistent left navigation with dedicated workspaces.
- Runtime state and high-value actions visible immediately.
- Platform lifecycle separated from WhatsApp pairing.
- Logs become a searchable operational console.
- Manager endpoint and bot identity move to Settings.
- Spanish and English remain first-class.
- No new shell/process execution surface is introduced.

## Navigation

### Overview

Shows:

- runtime state/profile;
- bot name and prefix;
- process PID and uptime;
- RSS/heap memory;
- connected platforms;
- subbot summary;
- start, stop, restart and update actions;
- compact platform state;
- recent runtime activity.

### Platforms

Each platform receives a dedicated card with:

- adapter identity;
- connected/offline status;
- account/detail information;
- enabled state;
- explicit connect/disconnect action.

Subbot totals are shown separately from platform adapters.

### Pairing

WhatsApp pairing has its own workflow with:

- international phone input;
- phone-code action;
- QR action;
- pairing-state preview;
- expiry/detail feedback;
- automatic polling while the session is waiting.

### Activity

The previous small log box is replaced with a desktop console:

- level filter;
- text search;
- timestamp, severity and message columns;
- scrollable long-running event view.

The Control API continues returning redacted logs.

### Settings

Settings now contains four independent groups:

1. Manager API endpoint and session token.
2. Bot identity (name, prefix, runtime language).
3. Local interface language.
4. Public runtime capabilities reported by `/v2/config`.

The Manager token is not written to localStorage. Only the non-secret base URL and interface locale are persisted locally.

## Visual system

Windows Phase 2 uses the Ghost Nexora V2 palette:

- background `#06070B`;
- surfaces `#0D1017` / `#121722`;
- borders `#242B39`;
- primary violet `#7C6CFF`;
- secondary cyan `#55D7FF`;
- success `#53D39A`;
- warning `#FFC857`;
- danger `#FF6B7A`.

The generated native icon source was updated to the same violet/cyan identity.

## Native window

Tauri keeps the native Windows frame but starts with a larger desktop-oriented workspace:

- 1280 × 820 default;
- 880 × 620 minimum;
- resizable/maximizable/minimizable;
- dark native theme.

This avoids custom window-control permissions while preserving normal Windows behavior.

## Security invariants

Phase 2 does not change the native request bridge semantics:

- remote endpoints still require HTTPS;
- HTTP remains loopback-only;
- only `/health` and `/v2/*` paths pass the native allowlist;
- the frontend cannot select an arbitrary executable;
- local native lifecycle actions remain constrained to the fixed Ghost Nexora service;
- CSP remains restrictive;
- access token is kept in application memory only.

## Validation gate

Phase 2 is complete only when the exact branch HEAD passes:

- desktop TypeScript build;
- Vite production build;
- Rust `cargo check`;
- icon generation;
- Windows NSIS bundle build;
- Phase 7 official-app boundary audit;
- Phase 8 desktop Windows regression.
