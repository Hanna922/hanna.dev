# Translate Posts Scripts

> **For agentic workers:** Use this guide when translating blog posts in this repo into English using the existing sibling `.md` / `.en.md` convention.

**Goal:** Create faithful English versions of existing blog posts without changing the Korean originals or breaking Astro content conventions.

**Architecture:** Source posts live in `src/content/blog` as `.md` files. English translations are added as sibling `.en.md` files with the same frontmatter shape, equivalent structure, and preserved technical artifacts such as code blocks, tables, diagrams, and references.

**Tech Stack:** Astro content collections, Markdown, existing bilingual blog conventions

---

## When to Use This

Use this document for the common case where:

- a post already exists at `src/content/blog/<slug>.md`
- the repo already uses sibling English files such as `src/content/blog/<slug>.en.md`
- the task is translation, not rewriting, restructuring, or localization into a different publishing model

Do not use this as-is if:

- the target language is not English
- the translated post should live outside `src/content/blog`
- the request requires substantial rewriting rather than close translation

---

## Translation Rules

- Keep the original Korean post unchanged.
- Create a sibling English file named `src/content/blog/<slug>.en.md`.
- Preserve frontmatter fields and overall article structure.
- Translate `title`, `titleEn`, and `description` into English.
- Preserve `author`, `pubDatetime`, `modDatetime`, `featured`, `draft`, and `tags` unless the user explicitly asks otherwise.
- Keep headings, section order, tables, code blocks, diagrams, links, and references aligned with the source post.
- Prefer faithful translation over stylistic rewriting.
- Smooth wording only where a literal translation would make the English unclear.
- Do not add new technical content, examples, or commentary that does not exist in the source.

---

## File Mapping Checklist

Before writing the translation:

1. Confirm the content schema in `src/content/config.ts`.
2. Confirm the source post exists in `src/content/blog`.
3. Check whether a sibling `.en.md` file already exists.
4. Review one or two existing `.en.md` posts to match frontmatter and tone.
5. Identify whether the source post contains code blocks, tables, images, diagrams, or reference sections that must be preserved exactly.

---

## Common Workflow

### 1. Inspect the repo convention

Read:

- `src/content/config.ts`
- `src/content/blog/*.en.md` samples

Verify:

- the collection schema accepts the expected frontmatter
- bilingual posts are implemented as sibling `.md` / `.en.md` files

### 2. Inspect the source post

Read:

- `src/content/blog/<slug>.md`

Capture:

- title and description
- section layout
- tables
- code blocks
- diagrams / ASCII flows
- reference links

### 3. Create the English sibling post

Create:

- `src/content/blog/<slug>.en.md`

Required content rules:

- preserve frontmatter shape
- translate prose faithfully
- keep code blocks unchanged unless comments inside them are prose that should be translated for consistency
- preserve markdown structure so diffs between source and translation stay easy to review

### 4. Validate the content

Run a content-aware validation command if available. Preferred order:

1. `pnpm build`
2. `astro check`

Validation goals:

- no schema errors
- no malformed frontmatter
- no broken markdown structure introduced by the translation

If a full build fails for unrelated environment reasons, record whether:

- content validation passed
- routes for the translated posts were generated
- the remaining failure is unrelated to the markdown changes

### 5. Review the final result

Check:

- translated file paths are correct
- titles and descriptions are in English
- major headings match the source structure
- references and URLs are preserved
- no accidental edits were made to the original Korean files

---

## Example Application

Given:

- `src/content/blog/example-post.md`

Create:

- `src/content/blog/example-post.en.md`

Expected result:

- the site treats the English post the same way as existing translated entries
- both Korean and English posts remain independently renderable

---

## Output Checklist

- [ ] Source post confirmed
- [ ] Schema checked
- [ ] Existing translation conventions reviewed
- [ ] `.en.md` sibling created
- [ ] Frontmatter translated and preserved correctly
- [ ] Body translated with structure preserved
- [ ] Validation command run
- [ ] Final diff reviewed
