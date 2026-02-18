---
author: Hanna922
pubDatetime: 2024-04-15T10:22:26.000Z
modDatetime:
title: Big Migration Journey (Node, Bundler ...)
titleEn: Big Migration Journey (Node, Bundler ...)
featured: false
draft: false
tags:
  - Intern
  - Migration
  - Node
  - Bundler
  - Tailwind
description: A hands-on account of migrating from Node 14 and Webpack (with all the errors along the way)
---

## Why I Decided to Refactor

During my internship, I was assigned a task to display a Dialog component and wanted to use Radix for it.

But Radix simply wouldn't install — and the culprit was the legacy codebase. 🥲

**A long list of problems**

- `yarn install` time approaching 100 seconds
- Unable to install `radix-dialog`
- Unable to install `eslint-plugin-prettier`
- Webpack config written in CJS format
- `yarn` could not run above a specific version of Node 14
- Using Tailwind v1, so the latest Tailwind properties were unavailable

...and more.

## Migration

- Node 14 → Node 20
- Webpack → Vite (CJS → ESM)
- Tailwind v1 + twin.macro → Tailwind v3
- React 16 → React 18
- etc.

## Errors Encountered

**1. Error in twin.macro when using custom properties**

After upgrading the Node version to 20 and swapping the bundler to Vite, errors appeared across every file. The project was using a combination of twin.macro and emotion, and twin.macro could not resolve custom properties.

<img src="/blog/big-migration-journey/twin.macro-error.png"/>

To use custom properties, you either had to explicitly specify the attribute inside a `tailwindcss` className, or register it separately in `tailwind.config.ts`.

Ref: https://github.com/ben-rogerson/twin.macro/issues/855

However, the amount of custom properties in use was enormous (81,088 lines of code), and hunting down every custom property to inline it into classNames would have been an unreasonably large undertaking. 🥲

Given that we weren't gaining significant benefits from twin.macro in the first place, and that the custom property footprint was so extensive, we decided to migrate all twin.macro usage to plain Tailwind CSS.

After the migration, we configured Tailwind to recognize custom properties via the `import` approach.

**2. Breaking change in eslint-import-order usage after version update**

After resolving those issues and bumping remaining dependency versions, the migration was finally complete!

## Performance Results

The total project size was reduced by half, and `yarn install` time dropped to one-fifth of the original.

There used to be a noticeable delay when cloning the project fresh, but now the project starts up quickly.

A clear improvement in developer experience. ദ്ദി ˃ ᴗ ˂ )

| **Before Migration**  | **After Migration**  |
| --------------------- | -------------------- |
| project size: 689 MB  | project size: 322 MB |
| yarn time: 105.18s    | yarn time: 24.24s    |
| all size: 10.1 MiB    | all size: 8.3 MiB    |
| lighthouse: 45        | lighthouse: 55       |
| ready time: (skipped) | ready time: 492 ms   |

(Left: before migration, Right: after migration.)

<div style="display:grid; grid-template-columns: 1fr 1fr">
  <img src="/blog/big-migration-journey/before1.png" />
  <img src="/blog/big-migration-journey/after1.png" />
</div>

<div style="display:grid; grid-template-columns: 1fr 1fr">
  <img src="/blog/big-migration-journey/before2.png" />
  <img src="/blog/big-migration-journey/after2.png" />
</div>

Just migrating the bundler and removing unnecessary packages was enough to deliver meaningful performance gains, and the improved overall project performance enabled faster iteration across the board.

Legacy code becomes harder to refactor the longer it accumulates, so I believe it's important to periodically audit project performance and invest time to address it.

After completing the migration, we also successfully resolved the prettier configuration issues and got `radix-dialog` installed without a hitch.

This was a great learning experience, and I'm glad I had the opportunity to carry out this refactor. ദ്ദി ˃ ᴗ ˂ )
