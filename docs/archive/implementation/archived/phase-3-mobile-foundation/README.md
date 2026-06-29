# Phase 3: Mobile App Foundation

Set up the Tauri v2 application with Rust backend and Svelte frontend foundation. Using a **desktop-first, responsive design** approach to enable fast iteration on Linux/macOS while ensuring the UI works on all screen sizes (mobile, tablet, desktop).

## Objectives

1. Set up Tauri v2 desktop app (mobile builds deferred)
2. Implement Rust backend modules (API client, secure storage, OAuth skeleton)
3. Set up Svelte routing and state management with Svelte 5 runes
4. Implement secure credential storage (keyring + fallback)
5. Establish connection to Management API
6. Build responsive UI that works across all screen sizes

## Prerequisites

- Phase 1 complete (infrastructure running)
- Phase 2 complete (Management API deployed)
- Rust toolchain installed
- Node.js 20+
- pnpm package manager

## Duration

**Estimated:** 3-5 days

## Deliverables

- [x] Tauri desktop app running on Linux
- [ ] Rust backend with API client and secure storage
- [ ] Svelte app with shadcn-svelte components
- [ ] Can connect to Management API via Tailscale
- [ ] Secure storage for API tokens (keyring + encrypted fallback)
- [ ] Responsive UI (sidebar on desktop, drawer on mobile)
- [ ] OAuth skeleton with tauri-plugin-oauth

## Success Criteria

1. App launches on desktop (Linux/macOS/Windows)
2. Can store and retrieve credentials securely
3. Can make authenticated requests to Management API
4. Navigation between screens works
5. UI is responsive across breakpoints (mobile/tablet/desktop)
6. Can create empty projects via the app

## Tech Stack

- **Framework**: Tauri v2
- **Backend**: Rust
- **Frontend**: Svelte 5 + SvelteKit
- **UI Components**: shadcn-svelte + Tailwind CSS v4
- **State**: Svelte 5 runes ($state, $derived)
- **HTTP**: reqwest (Rust)
- **OAuth**: tauri-plugin-oauth
- **Secure Storage**: keyring crate (with encrypted file fallback)
- **Package Manager**: pnpm

## Development Approach

### Desktop-First, Responsive Design

Instead of targeting mobile emulators immediately, we:
1. Develop and test on desktop (Linux) for fast iteration
2. Build responsive UI using Tailwind breakpoints
3. Use shadcn-svelte's responsive patterns (Dialog/Drawer switching)
4. Defer mobile-specific builds (iOS/Android) to later phase

This allows rapid development without needing emulators or physical devices.

### Key Responsive Patterns

- **Sidebar**: Visible on desktop (≥768px), collapses to hamburger menu
- **Drawers**: Used for modals on mobile, dialogs on desktop
- **Cards**: Grid layout that adapts from 1 column (mobile) to 3 columns (desktop)
- **Bottom nav**: Optional, can add for mobile viewport

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown
- [technical-notes.md](./technical-notes.md) - Tauri setup, Rust code
