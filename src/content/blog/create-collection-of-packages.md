---
author: Hanna922
pubDatetime: 2024-06-28T9:03:33.000Z
modDatetime:
title: Create collection of TS/JS packages used in Yourssu
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

해당 게시글은 경험을 소개하는 글이며 monorepo package를 설정하는 방법에 대해서는 자세히 다루지 않습니다.

## 시작하게 된 동기

Yourssu Web FE 팀은 별도 레포로 관리하고 있는 library(package)가 YDS(Yourssu Design System), YLS(Yourssu Logging System)로 2가지가 존재한다. 처음에는 두 패키지가 거의 동일한 기술 스택과 환경을 가지고 있었지만, YDS를 pnpm으로 마이그레이션하면서 YLS 관리를 동시에 할 수 없을까 하는 생각이 들었다. 마이그레이션 작업이 대부분 겹치고 두 패키지를 관리하는 사람이 동일하기 때문에 레포를 옮겨다니면서 동일한 작업을 수행하는 것이 비효율적이었던 것이다.

또한 우리 팀에서 개발하는 Soomsil 서비스에서 사용 중인 Util function과 React hook들을 다른 TF에서도 충분히 사용할 수 있을 것이라는 생각이 들었다.

마지막으로 매번 새로운 TF를 시작할 때마다 겪었던 불편함이 있었는데, 프로젝트 초기 세팅 시 eslint, prettier config를 매번 똑같이 설정해주어야 한다는 것이었다. Yourssu FE 팀은 1년 넘게 동일한 eslint, prettier 설정을 사용해왔기 때문에 팀원들이 어느정도 비슷한 코드 작성 스타일을 가지고 있었다. 따라서 TF를 만들 때마다 동일한 eslint, prettier 설정을 반복해서 해야한다는 문제점이 존재했다. 이 문제를 해결하기 위해서는 따로 레포를 만들어두고 clone 하는 방법도 존재하지만 매번 clone을 하는 것보단 package를 구축해두는 것이 효율적이라는 판단을 하였다.

=> 이렇게 구축한 package들은 Monorepo로 관리함으로써 의존성 관리를 용이하게 하고, 버전 관리 비용을 감소시킬 수 있었다. 또한 Monorepo가 가지는 단점(각 프로젝트의 권한 관리, 빌드 시간 증가 등)은 **패키지의 크기가 작으며 하나의 팀이 모든 프로젝트를 관리하는 우리 웹 팀에 문제가 되지 않는다** 는 판단을 내렸다. 마지막으로 해당 작업은 Web FE Engineer로서 값진 경험이 될 것이라 생각하였다. ^~^

#### 기존 Package Project 생성 구조

저장소 생성 > 커미터 추가 > 개발환경 구축 > CI/CD 구축 > 개발 > 빌드 > NPM publish

#### Monorepo 도입 시 Package Project 생성 구조

개발 > 빌드 > NPM publish

## Architecture

처음에는 YDS(Yourssu Design System), YLS(Yourssu Logging System), eslint-config, prettier-config, utils 총 5개의 package를 monorepo 형태로 구현하려 했다.

하지만 팀원들과 Architecture에 대한 여러 논의를 거치게 되었고 몇 가지의 변동사항이 생겼는데,

- Design System Reference들을 찾아보면 보통 별도 레포로 관리하는 경우가 많았다. YDS의 경우에도 다른 패키지들에 비해 규모가 크고, 다른 패키지들이 가지는 특징과는 차이점이 존재하기 때문에 기존처럼 별도 레포로 관리하자는 결론을 내렸다.
- eslint-config, prettier-config로 분리가 되었으며 build, bundling 과정을 거치는 것이 package 크기에 비해 오버헤드가 더 크다는 것을 알게 되었다. (실제로 eslint-config-airbnb, @rushstack/eslint-config package를 npm에서 확인하였을 때 dist 폴더를 배포하는 것이 아닌 원본 소스 코드를 배포하는 것을 확인할 수 있었다.)
- 작업을 하다보니 YLS(Yourssu Logging System)과 utils 뿐만 아니라 react package, crypto package가 추가되었다.

이러한 변동사항을 바탕으로 최종 아키텍처는 아래와 같이 구성하였다.

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

## 각 package 소개 (eslint-config, prettier-config 제외)

- apps/docs: nextra를 활용하여 Yrano package들의 문서를 markdown 형태로 손쉽게 작성
- crypto: sha256, hexToUtf8, base64 encoding function을 제공하는 package
- logging-system: 기존 YLS, screen 진입과 click event를 logging하는 package
- react: useInterval, useSecTimer와 같은 react hook을 제공하는 package
- utils: hasOnlyNumberAndEnglish, isEmail과 같은 util function을 제공하는 package

## bundler

bundler는 기존에 YLS에서 사용하던 vite에서 tsup로 마이그레이션 과정을 거쳤다. Yrano는 라이브러리를 배포하는 monorepo이기 때문에 vite의 경우 불필요한 기능이 많았고, 라이브러리(패키지) 개발에 적합한 bundler로 rollup과 tsup 중 논의하는 시간을 가졌다.

<img src="/blog/create-collection-of-packages/rollup-vs-tsup.png" alt="rollup vs tsup" />

rollup은 tsup에 비해 훨씬 많은 사용량을 가지고 있고 그만큼 풍부한 plugin과 자료들을 가지고 있다.
따라서 규모가 크거나 좀 더 다양한 기능을 사용해야 하는 프로젝트에서는 rollup이 더 적합할 것 같다.
하지만 Yrano는 tsup를 선택하게 되는데. . .

#### tsup

<img src="/blog/create-collection-of-packages/tsup-translate.png" alt="tsup translate" />

tsup는 typescript library bundling을 목적으로 하고 있는 bundler이다.
esbuild 기반이기 때문에 속도가 빠르고, 기본적으로 tree-shaking을 지원한다.
rollup 사용 시 설정해주어야 하는 수많은 plugin 없이 tsup는 기본적으로 typescript를 CJS, ESM 형태의 javascript로 각각 compile 하며 DTS 또한 설정한 format에 맞게 생성해준다.
또한 minify 등의 기능도 지원하며 무엇보다 설정 파일이 매우 간단하다.

<img src="/blog/create-collection-of-packages/tsup-build.png" alt="tsup build" />

---

## 마주한 에러

#### unresolved path in the bundle

```
✘ [ERROR] Could not resolve "crypto-js"

    node_modules/.pnpm/@yourssu+logging-system-react@file+yourssu-logging-system-react-1.0.0.tgz_axios@1.7.2_react-r_5tagzwsu4txr6bm25vdgg7k5sm/node_modules/@yourssu/logging-system-react/dist/index.js:1:14:
      1 │ import g from 'crypto-js';
        ╵               ~~~~~~~~~~~

  You can mark the path "crypto-js" as external to exclude it from the bundle, which will
  remove this error and leave the unresolved path in the bundle.
```

**해결 방법**

번들러 설정 파일에 'noExternal' 속성을 추가한다. Yrano의 경우 tsup를 사용하고 있으므로 tsup.config.ts에 `noExternal: ['crypto-js/sha256']` 를 추가하였다!

```ts
// packages/logging-system/tsup.config.ts 전체 코드
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

## Reference

- Monorepo 기본: https://d2.naver.com/helloworld/0923884#ch4
- pnpm build orchestration in monorepo: https://techblog.woowahan.com/15084/
- lint config packages: https://techblog.woowahan.com/15903/
- rollup vs tsup: https://blog.hoseung.me/2023-07-22-improve-library-bundling
