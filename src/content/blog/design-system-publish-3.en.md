---
author: Hanna922
pubDatetime: 2024-03-29T9:52:17.000Z
modDatetime:
title: Design System Publish in NPM (3)
titleEn: Design System Publish in NPM (3)
featured: false
draft: false
tags:
  - NPM
  - Design System
  - Yourssu
  - Github Action
description: Setting up automated Storybook and NPM deployment with GitHub Actions
---

This post was written in an environment with vite v4, typescript v5, react v18, storybook v8, and pnpm v8.

## Automating Storybook & NPM Deployment

YDS uses GitHub Actions to deploy Storybook by version to AWS S3, and to publish the package to npm.

**1. Create and configure the S3 bucket — (omitted)**

**2. Configure Bucket Versioning**

To deploy Storybook by version, start by enabling AWS S3 bucket versioning.

<img src="/blog/design-system-publish/bucket-versioning.png" />

YDS deploys Storybook at paths following the pattern `{url}/v0.1.0/*`.

The version is extracted from `package.json` before deployment, and injected into the deployment path via the yml script.

```yml
- name: Extract version from package.json
  id: version
  run: echo ::set-output name=VERSION::$(node -p "require('./package.json').version")

- name: Deploy to s3
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
    aws s3 cp \
      --recursive \
      --region ap-northeast-2 \
      ./storybook-static \
      s3://yds-react-storybook/${{ steps.version.outputs.VERSION }}
```

**3. Register Repository Secrets**

<img src="/blog/design-system-publish/repo-secrets.png" />

**4. Configure .npmrc**

Publishing locally worked fine because I was already logged in, but running GitHub Actions without providing an `NPM_TOKEN` resulted in an authentication error.

<img src="/blog/design-system-publish/build-fail-1.png" />

To fix this, create an `.npmrc` file at the root of the project and inject the `NPM_TOKEN` used in the yml workflow.

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

## Migrating from yarn to pnpm in the GitHub Workflow

YDS was originally using yarn but was recently migrated to pnpm, which required updating the workflow commands accordingly.

```yml
# Steps that previously used yarn commands
- name: Install dependencies
  run: yarn install --immutable --immutable-cache --check-cache

- name: Build storybook
  run: yarn build-storybook --output-dir=storybook-static
```

Without updating these steps, errors will occur during the Install dependencies step. Unlike yarn, pnpm requires explicit setup and version specification.

#### Without the Set Up step

<img src="/blog/design-system-publish/build-fail-2.png" />

#### Without specifying PackageManager and Version

<img src="/blog/design-system-publish/build-fail-3.png" />

```yml
# Full workflow (packageManager: pnpm)
name: build and deploy storybook to s3, publish to npm

on:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source code
        uses: actions/checkout@v3

      - name: Set up pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20

      # Unlike the previous yml script, cache is not configured separately.
      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm build

      - name: Build storybook
        run: pnpm build-storybook --output-dir=storybook-static

      - name: Extract version from package.json
        id: version
        run: echo ::set-output name=VERSION::$(node -p "require('./package.json').version")

      - name: Deploy to s3
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          aws s3 cp \
            --recursive \
            --region ap-northeast-2 \
            ./storybook-static \
            s3://yds-react-storybook/${{ steps.version.outputs.VERSION }}

      - name: Publish to NPM
        run: npm publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

To briefly summarize the workflow: when a push is made to the `main` branch, the steps in the job execute in order.

First, the source code is checked out, then pnpm v8 and Node.js v20 are set up. After that, `pnpm install` installs the dependencies, followed by `build` and `build-storybook` commands running sequentially. The version is then extracted from `package.json` and injected into the S3 deploy path. Finally, `npm publish` deploys the package.

If the Storybook URL includes the current version and the NPM package is published successfully, the workflow is complete!

Efficiency is a developer's lifeblood. ¡¡¡( •̀ ᴗ •́ )و!!!

### Reference

- https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow#create-and-check-in-a-project-specific-npmrc-file
