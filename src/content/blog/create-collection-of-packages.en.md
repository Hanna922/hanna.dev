---
author: Hanna922
pubDatetime: 2024-06-28T9:03:33.000Z
modDatetime:
title: Create collection of TS/JS packages used in Yourssu
titleEn: Create collection of TS/JS packages used in Yourssu
featured: false
draft: false
tags:
  - Yourssu
  - React
  - Monorepo
  - Package
  - Logging System
  - Utils
description: Yrano = Yourssu Resourceful and Noteworthy Operations
---

This post is an account of my experience and does not cover the details of how to configure a monorepo package.

## Motivation

The Yourssu Web FE team maintained two separate libraries (packages) in independent repositories: YDS (Yourssu Design System) and YLS (Yourssu Logging System). Initially, the two packages shared nearly the same technology stack and environment, but as I was migrating YDS to pnpm, I started wondering whether we could manage YLS at the same time. The migration work overlapped significantly, and since the same person managed both packages, switching between repositories to perform identical tasks felt inefficient.

Additionally, I realized that the utility functions and React hooks used in our Soomsil service could be useful to other TFs (task forces) as well.

Finally, there was a recurring inconvenience every time we started a new TF: we had to configure the same eslint and prettier settings from scratch. The Yourssu FE team had been using the same eslint and prettier configuration for over a year, so team members had naturally developed a consistent coding style. Yet setting up those identical configurations repeatedly for every new TF remained a persistent pain point. While one option was to create a dedicated repository and clone it each time, I concluded that publishing a package would be more efficient than cloning.

=> By managing these packages as a Monorepo, we could simplify dependency management and reduce version management overhead. We also determined that the typical drawbacks of monorepos (access control per project, increased build times, etc.) **were non-issues for our web team, given the small package sizes and the fact that a single team manages all projects**. Lastly, I felt this would be a valuable experience as a Web FE Engineer. ^~^

#### Previous Package Project Creation Workflow

Create repository → Add committers → Set up development environment → Set up CI/CD → Develop → Build → Publish to NPM

#### Package Project Creation Workflow with Monorepo

Develop → Build → Publish to NPM

## Architecture

Initially, the plan was to build five packages in a monorepo: YDS (Yourssu Design System), YLS (Yourssu Logging System), eslint-config, prettier-config, and utils.

However, after several discussions with teammates about the architecture, a few changes were made:

- Looking at Design System references, they are typically managed in a separate repository. In YDS's case, it is larger in scale than the other packages and has characteristics that differ from the rest, so we decided to keep it in its own repository as before.
- eslint-config and prettier-config were kept separate, and we discovered that the build and bundling overhead outweighed the benefit for their small package size. (After checking npm packages like `eslint-config-airbnb` and `@rushstack/eslint-config`, we confirmed they distribute the original source code directly rather than a `dist` folder.)
- As work progressed, we ended up adding not only YLS and utils, but also a `react` package and a `crypto` package.

Based on these changes, the final architecture was structured as follows:

#### Yrano

```
|- .changeset
|- .github
|- .husky
|- apps
|  |- docs
|  |- config-example
|  |- yls-example
|- packages
|  |- crypto
|  |- eslint-config
|  |- logging-system
|  |  |- src
|  |  |- package.json
|  |  |- tsconfig.json
|  |  |- tsup.config.ts
|  |- prettier-config
|  |- react
|  |  |- hooks
|  |- utils
|- package.json
|- pnpm-lock.yaml
|- pnpm-workspace.yaml
|- tsconfig.json
|- turbo.json
|- vitest.config.ts
```

## Package Descriptions (excluding eslint-config and prettier-config)

- **apps/docs**: Uses nextra to easily write documentation for Yrano packages in markdown format
- **crypto**: A package providing sha256, hexToUtf8, and base64 encoding functions
- **logging-system**: The original YLS; a package for logging screen entry and click events
- **react**: A package providing React hooks such as `useInterval` and `useSecTimer`
- **utils**: A package providing utility functions such as `hasOnlyNumberAndEnglish` and `isEmail`

## Bundler

The bundler was migrated from vite (previously used in YLS) to tsup. Since Yrano is a monorepo for publishing libraries, vite had a lot of unnecessary features. We deliberated between rollup and tsup for library/package development.

<img src="/blog/create-collection-of-packages/rollup-vs-tsup.png" alt="rollup vs tsup" />

Rollup has significantly more adoption than tsup, and accordingly offers a richer ecosystem of plugins and documentation. For larger-scale projects or those requiring a wider range of features, rollup would likely be the better fit.

That said, Yrano went with tsup for the following reasons:

#### tsup

<img src="/blog/create-collection-of-packages/tsup-translate.png" alt="tsup translate" />

tsup is a bundler specifically designed for TypeScript library bundling. Because it is powered by esbuild, it is fast and supports tree-shaking out of the box. Without the extensive plugin setup that rollup requires, tsup natively compiles TypeScript into both CJS and ESM JavaScript and automatically generates DTS files in the configured format. It also supports features like minification, and above all, its configuration file is remarkably simple.

<img src="/blog/create-collection-of-packages/tsup-build.png" alt="tsup build" />

---

## Errors Encountered

#### Unresolved path in the bundle

```
✘ [ERROR] Could not resolve "crypto-js"

    node_modules/.pnpm/@yourssu+logging-system-react@file+yourssu-logging-system-react-1.0.0.tgz_axios@1.7.2_react-r_5tagzwsu4txr6bm25vdgg7k5sm/node_modules/@yourssu/logging-system-react/dist/index.js:1:14:
      1 │ import g from 'crypto-js';
        ╵               ~~~~~~~~~~~

  You can mark the path "crypto-js" as external to exclude it from the bundle, which will
  remove this error and leave the unresolved path in the bundle.
```

**Solution**

Add a `noExternal` property to the bundler configuration. Since Yrano uses tsup, add `noExternal: ['crypto-js/sha256']` to `tsup.config.ts`.

```ts
// packages/logging-system/tsup.config.ts (full file)
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    entry: "./src/index.ts",
    resolve: true,
  },
  external: ["react", "react-dom"],
  noExternal: ["crypto-js/sha256"],
  splitting: false,
  clean: true,
  sourcemap: true,
  minify: true,
  treeshake: true,
  skipNodeModulesBundle: true,
  outDir: "./dist",
});
```

## References

- Monorepo basics: https://d2.naver.com/helloworld/0923884#ch4
- pnpm build orchestration in monorepo: https://techblog.woowahan.com/15084/
- lint config packages: https://techblog.woowahan.com/15903/
- rollup vs tsup: https://blog.hoseung.me/2023-07-22-improve-library-bundling
