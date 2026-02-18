---
author: Hanna922
pubDatetime: 2024-03-26T13:53:26.000Z
modDatetime:
title: Design System Publish in NPM (2)
titleEn: Design System Publish in NPM (2)
featured: false
draft: false
tags:
  - NPM
  - Design System
  - Yourssu
description: Build and test the package, then publish it
---

This post was written in an environment with vite v4, typescript v5, react v18, storybook v8, and pnpm v8.

## Build & Test

```
> pnpm build
```

Time to build! ଘ(੭ˊ꒳ˋ)੭✧

<img src="/blog/design-system-publish/build.png" />

For a stable release, it's best not to publish immediately after a build — run tests first.

```
> pnpm pack
```

Running the [pack command](https://pnpm.io/cli/pack) (same for npm and yarn) generates a **package-name-version.tgz** file.

To test with the generated `.tgz` file, create a new project and install the file in it.

## Creating a Test Project

Create a project that matches your target environment. I created a test project using vite, swc, react, and typescript.

```
> yarn create vite . --template react-swc-ts
```

Copy the `.tgz` file into the test project and install it.

<img src="/blog/design-system-publish/tgz-example.png"/>

If any libraries were configured as `peerDependencies` when building the library, those need to be installed as well.

After installation, apply the library code to the test project.

If it loads without errors, the test is a success! 🎉

**+ When testing a package fresh, residual cache may cause issues — make sure to clear the cache beforehand.**

## Publish

Once testing is successful, publishing to NPM is straightforward.

After logging in to your npm account, simply run the publish command and you're done! 🎉

> **Warning**
>
> As of recent changes (after December 9, 2025), npm's security policy has been tightened. Classic tokens have been removed and replaced with a Granular (fine-grained) token + 2FA-based authentication system.
> According to npm's official announcement, existing Classic tokens were valid until November 19, 2025, after which they were permanently revoked. Continuing to use a Classic token will result in `Access token expired or revoked…`.
>
> Additionally, if you want to use this with GitHub Actions, you must generate an npm Granular Access Token with **Bypass 2FA: Enabled** (for non-interactive CI publishing). Store the token as `NPM_TOKEN` in GitHub Secrets, and inject it into the publish step via `NODE_AUTH_TOKEN` in the workflow (using the `setup-node` + `registry-url` configuration).

```
// .npmrc
//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}
```

```
> npm publish
```

If your package name includes a namespace (e.g., `@yourssu`), the package defaults to a private publish. Since private publishing is a paid feature, you need to explicitly set it to public for free publishing.

```
> npm publish --access=public
```

<img src="/blog/design-system-publish/npm.png" />

If the publish is successful, you'll be able to see it on NPM like this. ✌(-‿-)✌
