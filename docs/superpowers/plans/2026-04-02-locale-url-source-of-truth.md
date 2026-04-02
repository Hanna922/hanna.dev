# Locale URL Source Of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `?lang` the only locale source of truth and remove duplicated locale parsing and locale-aware link building across the blog UI.

**Architecture:** Extract shared locale helpers into `src/utils/locale.ts`, keep `LocaleContextProvider` as the bridge between URL changes and DOM/UI synchronization, and update inline scripts plus React hooks to consume those helpers instead of re-deriving locale independently. Preserve server-rendered `?lang` behavior and post-detail fallback-to-available-content behavior without introducing a second client-side locale store.

**Tech Stack:** Astro 5, React 18 islands, TypeScript, inline Astro scripts, ESLint, `pnpm lint`, `pnpm build`

---

## File Map

- Modify: `src/utils/locale.ts`
  - Add shared locale resolution and locale-aware URL builder helpers.
- Modify: `src/components/LocaleContextProvider.tsx`
  - Make provider URL-driven and remove competing locale resolution paths.
- Modify: `src/hooks/useBlogLocale.ts`
  - Reuse shared helper logic for initial locale resolution.
- Modify: `src/components/LocalizedPostListScript.astro`
  - Replace duplicated browser locale parsing and href rewriting logic.
- Modify: `src/components/Header.astro`
  - Replace duplicated current-locale and locale-aware link logic.
- Modify: `src/layouts/PostDetails.astro`
  - Replace duplicated locale lookup and locale-aware tag-link logic.

## Phase Notes

- The repo currently has no dedicated frontend test runner for these helpers.
- Use small, reviewable refactor steps plus fresh `pnpm lint` / `pnpm build` verification after each risky slice.
- Preserve the current user-visible behavior while reducing duplication.

---

### Task 1: Add Shared Locale URL Helpers

**Files:**
- Modify: `src/utils/locale.ts`

- [ ] **Step 1: Add browser-safe locale resolution helpers**

Add helpers for:

- resolving locale from `URLSearchParams`
- resolving locale from `window.location.search`
- reading the synchronized document locale
- building locale-aware internal URLs
- building locale-aware internal paths for simple nav links

- [ ] **Step 2: Keep helper behavior aligned with the current public contract**

Rules:

- accept only `en` and `ko`
- keep `ko` as the default locale
- preserve the current `?lang=en` convention
- avoid rewriting external URLs

- [ ] **Step 3: Run lint after helper changes**

Run: `pnpm lint`
Expected: exit code `0`

- [ ] **Step 4: Commit**

```bash
git add src/utils/locale.ts
git commit -m "refactor: add shared locale URL helpers"
```

---

### Task 2: Make LocaleContextProvider URL-Driven

**Files:**
- Modify: `src/components/LocaleContextProvider.tsx`
- Modify: `src/utils/locale.ts`

- [ ] **Step 1: Replace ad-hoc locale resolution with shared helpers**

Update the provider so initialization and `astro:after-swap` both read locale through the shared URL-first helper path.

- [ ] **Step 2: Keep DOM sync behavior but remove competing state rules**

Preserve:

- `document.documentElement.lang`
- `document.documentElement.dataset.locale`
- translated text/attribute sync
- locale switcher active state sync
- subscriber notifications

Reduce:

- duplicated query parsing
- extra fallbacks that disagree with URL-first behavior

- [ ] **Step 3: Ensure locale switching updates the URL through one code path**

Use the shared locale-aware URL builder when the locale switcher writes `history.replaceState`.

- [ ] **Step 4: Run lint after provider refactor**

Run: `pnpm lint`
Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/components/LocaleContextProvider.tsx src/utils/locale.ts
git commit -m "refactor: make locale provider URL-driven"
```

---

### Task 3: Remove Duplicate Locale Parsing From Hooks And List Scripts

**Files:**
- Modify: `src/hooks/useBlogLocale.ts`
- Modify: `src/components/LocalizedPostListScript.astro`
- Modify: `src/utils/locale.ts`

- [ ] **Step 1: Update `useBlogLocale` to reuse shared initial locale resolution**

Keep the hook API the same:

- `locale`
- `translate`

But remove duplicated browser parsing logic where possible.

- [ ] **Step 2: Update localized post list script to use shared locale helpers**

Replace the duplicated:

- current locale lookup
- locale-aware href rewrite logic

Ensure the script still:

- hides non-selected localized post cards
- rewrites post links
- rewrites tag links
- handles `astro:after-swap`

- [ ] **Step 3: Run lint after the hook and list-script refactor**

Run: `pnpm lint`
Expected: exit code `0`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBlogLocale.ts src/components/LocalizedPostListScript.astro src/utils/locale.ts
git commit -m "refactor: reuse locale helpers in hooks and post lists"
```

---

### Task 4: Simplify Header And Post Detail Locale Logic

**Files:**
- Modify: `src/components/Header.astro`
- Modify: `src/layouts/PostDetails.astro`
- Modify: `src/utils/locale.ts`

- [ ] **Step 1: Replace duplicated locale lookup and link building in Header**

Unify:

- nav link updates
- AI search trigger navigation
- locale-aware path generation during transitions

- [ ] **Step 2: Replace duplicated locale lookup and tag-link rewriting in PostDetails**

Keep:

- content-section visibility by effective available locale
- document title sync for the visible section

Reduce:

- duplicate `getCurrentLocale()`
- duplicate locale-aware tag-link rewrite code
- unnecessary URL rewriting beyond the URL-first contract

- [ ] **Step 3: Run lint after the header and post-detail refactor**

Run: `pnpm lint`
Expected: exit code `0`

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.astro src/layouts/PostDetails.astro src/utils/locale.ts
git commit -m "refactor: unify locale logic in header and post details"
```

---

### Task 5: End-To-End Verification

**Files:**
- Review: `src/utils/locale.ts`
- Review: `src/components/LocaleContextProvider.tsx`
- Review: `src/hooks/useBlogLocale.ts`
- Review: `src/components/LocalizedPostListScript.astro`
- Review: `src/components/Header.astro`
- Review: `src/layouts/PostDetails.astro`

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: exit code `0`

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: Astro build completes cleanly; if the known local Windows symlink issue still blocks the final Vercel packaging step, record that the remaining failure is environmental rather than caused by the locale refactor.

- [ ] **Step 3: Perform manual smoke checks**

Check:

- `/blog/?lang=ko` and `/blog/?lang=en`
- `/posts/?lang=ko` and `/posts/?lang=en`
- a bilingual post detail page with both versions present
- a Korean-only or English-only fallback scenario if available
- locale switching after an Astro client transition

- [ ] **Step 4: Review final diff**

Confirm:

- locale parsing is centralized
- no new duplicate `getCurrentLocale()` helpers remain in the touched files
- locale-aware internal links follow one rule

- [ ] **Step 5: Commit**

```bash
git add src/utils/locale.ts src/components/LocaleContextProvider.tsx src/hooks/useBlogLocale.ts src/components/LocalizedPostListScript.astro src/components/Header.astro src/layouts/PostDetails.astro
git commit -m "refactor: make locale URL the single source of truth"
```
