# Contributing to Mergepay

Thanks for helping build an open-source, Stellar-native public good!

## Coding standards

- TypeScript everywhere, `strict` mode. No `any` without a clear reason.
- The API contract lives in [src/lib/types.ts](src/lib/types.ts) — keep it in sync with `mergepay-api`.
- Components follow the neobrutalist design system in [src/components/ui/](src/components/ui/). Reuse primitives (`Button`, `Card`, `Dialog`, `Badge`) rather than restyling.
- Keep the UI mobile-first and accessible (labels on inputs, `aria-*` on interactive icons, keyboard-closable dialogs).
- Never handle or store private keys. Build transactions on the API; sign in the wallet.

## Branching model

- `main` is always deployable.
- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, or `docs/<short-name>`.
- Open a PR into `main`.

## Issue labels

- `bug` — something is broken
- `feature` — new capability
- `stellar` — touches on-chain / SEP flows
- `design` — UI / UX
- `good first issue` — friendly entry point
- `docs` — documentation

## PR checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] UI verified on mobile widths
- [ ] No secrets committed; `.env.local` stays local
- [ ] Contract changes mirrored in `mergepay-api`

## Commit messages

Conventional-ish prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
