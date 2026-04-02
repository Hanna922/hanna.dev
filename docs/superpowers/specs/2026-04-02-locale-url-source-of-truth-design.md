# Locale URL Source of Truth Design

**Status:** Approved in chat on 2026-04-02

## Goal

Make `?lang` the only locale source of truth across the blog UI so that server rendering, client-side transitions, shared links, and language switching all follow the same rule.

## Problem Summary

The current locale flow works, but it re-derives locale in too many places:

- `src/components/LocaleContextProvider.tsx`
- `src/hooks/useBlogLocale.ts`
- `src/components/LocalizedPostListScript.astro`
- `src/components/Header.astro`
- `src/layouts/PostDetails.astro`

Each area reads some mix of query params, DOM state, and window context, then rebuilds locale-specific URLs on its own. That duplication increases drift risk:

- one component can prefer URL while another prefers DOM state
- one script can keep `?lang=ko` while another omits it
- post detail pages can rewrite the URL again after initial render
- future locale changes would require touching multiple implementations

## Constraints

- Keep the existing public URL model based on `?lang`.
- Preserve current SSR behavior in Astro routes.
- Preserve the current fallback rule on bilingual post pages:
  - show English content for `?lang=en` when an English version exists
  - otherwise fall back to the Korean version
- Avoid a larger i18n redesign or route-based localization change.
- Keep the existing `window.__BLOG_LOCALE_CONTEXT__` bridge for React islands and inline scripts.

## Decision

Use `?lang` as the single source of truth for locale.

That means:

- server-rendered pages determine initial locale from `Astro.url.searchParams`
- client-side code reads locale from the URL first
- the locale switcher updates the URL
- shared helpers generate locale-aware internal URLs
- DOM state (`data-locale`, `lang`) becomes a synchronized reflection of the URL, not an alternative state source

## Recommended Approach

### 1. Centralize locale helpers

Extend `src/utils/locale.ts` so it owns the common logic now duplicated across scripts and hooks:

- resolve locale from `URLSearchParams`
- resolve locale from the browser location
- read the current document locale as a synchronized fallback only
- build locale-aware internal URLs
- build locale-aware path strings for simple nav links

This file becomes the only place where `lang` query semantics are defined.

### 2. Keep `LocaleContextProvider` as the runtime bridge

`LocaleContextProvider` should remain responsible for:

- syncing `document.documentElement.lang`
- syncing `document.documentElement.dataset.locale`
- updating translated DOM nodes
- notifying subscribers
- reacting to `astro:after-swap`

It should stop behaving like a competing locale store. Its job is to mirror URL state into the page and dispatch updates when the URL-driven locale changes.

### 3. Make consumers depend on shared helpers

The following consumers should stop parsing locale independently:

- `src/hooks/useBlogLocale.ts`
- `src/components/LocalizedPostListScript.astro`
- `src/components/Header.astro`
- `src/layouts/PostDetails.astro`

They should use helper functions from `src/utils/locale.ts` and treat the provider context as a subscription surface, not a separate decision engine.

### 4. Reduce post detail special-casing

`src/layouts/PostDetails.astro` currently decides an effective locale and may rewrite the query string again. That behavior should be tightened:

- locale comes from `?lang`
- content fallback stays local to the post detail page
- if the requested locale is unavailable, only the visible section selection falls back
- URL rewriting should be minimized so the page does not invent a second locale source

## File Responsibilities

### `src/utils/locale.ts`

Owns locale constants, translation lookup, locale parsing, and locale-aware URL builders.

### `src/components/LocaleContextProvider.tsx`

Owns DOM synchronization and publish-subscribe behavior for locale updates after navigation or explicit language switching.

### `src/hooks/useBlogLocale.ts`

Reads locale from the provider context and falls back through the shared helper chain instead of duplicating browser parsing logic.

### `src/components/LocalizedPostListScript.astro`

Uses the shared URL helpers to:

- choose which localized post card to show
- rewrite post and tag links consistently

### `src/components/Header.astro`

Uses shared helpers for:

- locale-aware nav links
- locale-aware AI search entry link
- current locale lookup during client-side transitions

### `src/layouts/PostDetails.astro`

Uses shared helpers for:

- locale-aware tag links
- content section visibility
- document title sync for the active localized section

## Data Flow

### Initial load

1. Astro route reads `?lang`.
2. `Layout.astro` renders `data-locale` / `data-locale-server` accordingly.
3. Inline bootstrap script reflects that locale onto `window.__BLOG_INITIAL_LOCALE__`.
4. `LocaleContextProvider` initializes from the URL-first helper chain.
5. DOM translation and localized content visibility are applied.

### Language switch

1. User clicks the locale switcher.
2. `LocaleContextProvider` updates the URL using shared locale URL helpers.
3. Provider applies DOM synchronization and emits `blog:locale-change`.
4. Header, post lists, post detail pages, and React islands update from the same locale signal.

### Astro transition

1. URL changes through navigation.
2. `astro:after-swap` fires.
3. `LocaleContextProvider` re-reads the URL and reapplies locale synchronization.
4. Inline scripts update link targets and visible localized content from the shared helpers.

## Non-Goals

- Do not move to path-based localization such as `/en/...`.
- Do not add more languages.
- Do not replace the current translation dictionary format.
- Do not redesign post slug localization rules in this phase.

## Verification

Primary verification for this phase:

- `pnpm lint`
- `pnpm build`

Manual smoke checks after implementation:

- switching locale updates nav links consistently
- `/posts/...` detail pages show the correct localized section
- localized tag links preserve the current locale
- list pages show one post card per base post for the active locale
- Astro client transitions keep locale state in sync

## Risks

- Inline Astro scripts cannot directly import every TypeScript helper pattern, so helper reuse may need a browser-safe shape.
- Post detail fallback behavior can regress if visibility logic and URL logic are coupled too tightly.
- Header and list scripts are sensitive to `astro:after-swap`; duplicate binding bugs need to be avoided.

## Success Criteria

- The URL query parameter is the only locale authority.
- Locale parsing and locale-aware URL building live in one shared helper module.
- Header, lists, post details, and React hooks stop reimplementing locale detection separately.
- Existing Korean/English post fallback behavior remains intact.
