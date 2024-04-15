---
author: Hanna922
pubDatetime: 2024-03-19T9:16:00.000Z
modDatetime:
title: Design System Publish in NPM (1)
featured: false
draft: false
tags:
  - NPM
  - Design System
  - Yourssu
description: 디자인 시스템 배포를 위한 패키지 세팅을 해보자
---

해당 게시글은 vite v4, typescript v5, react v18, storybook v7, pnpm 환경에서 작성되었습니다.

## Deploy setting

1. package.json 설정하기

```json
{
  "name": "배포할 패키지 이름",
  "version": "패키지 버전",
  "private": false,
  "description": "패키지 설명",
  "keywords": ["패키지 검색을 도와줄 키워드"],
  "repository": {
    "type": "git",
    "url": "git 주소"
  },
  "license": "MIT", // 라이선스 명시
  "type": "module", // CJS or ESM
  "main": "./dist/index.cjs.js",
  "module": "./dist/index.es.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.es.js",
      "require": "./dist/index.cjs.js"
    }
  },
  "files": ["dist"]
  // ...
}
```

- version: semantic versioning guidelines를 지켜야 합니다.
- private: true로 설정할 경우 요금이 발생합니다.
- files: 패키지가 dependency로 설치될 때 포함할 파일을 설정합니다.

**legacy support**

- main: Node.js 12 이전 버전에서 CJS 형식으로 빌드된 메인 파일의 경로입니다.
- module: Node.js 12 이전 버전의 ESM 환경에서 사용되는 진입 파일의 경로입니다.
- types: TypeScript 4.7 이전 버전의 환경에서 사용되는 타입 정의 파일의 경로입니다.

**exports**

- Node.js v12부터 지원합니다.
- 특정 조건, 환경에 따라 다른 모듈을 제공할 수 있습니다.
- "."으로 시작하는 상대 경로로 작성합니다.

> **Warning**
>
> CJS, ESM을 모두 지원하기 위해서는 Conditional Exports를 사용해야 합니다.
>
> ```json
>  "exports": {
>    ".": {
>      "require": {
>        "types": "./dist/index.d.cts",
>        "default": "./dist/index.cjs.js"
>      },
>      "import": {
>        "types": "./dist/index.d.ts",
>        "default": "./dist/index.es.js"
>      }
>    }
>  },
> ```
>
> ### Trouble Shooting
>
> 하지만 Conditional Exports를 설정 후 yarn build를 실행하였을 때에도 dist 폴더 내에 cts 파일이 생성되지 않았습니다.
>
> => vite은 CJS build를 더 이상 제공하지 않습니다.
>
> Ref: https://vitejs.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated

2. vite.config.ts 수정하기

타입 정의 파일(.d.ts)를 생성하기 위해 vite-plugin-dts를 설치합니다.

```zsh
yarn add -D vite-plugin-dts
```

vite.config.ts 전체 코드

```ts
export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
    tsconfigPaths(),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "@yourssu/design-system-react",
      formats: ["es", "cjs"],
      fileName: format => `index.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "styled-components", "**/*.stories.tsx"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "styled-components": "styled",
        },
        banner: '"use client";',
        interop: "compat",
      },
    },
  },
});
```

**lib**

- entry: 진입점, 제공하고자 하는 모든 컴포넌트들을 export하는 부분입니다.
- name: 라이브러리 이름 (package.json name과 동일하게하면 됩니다.)
- formats: 해당 라이브러리를 어떤 모듈 형식으로 빌드할지 설정합니다.
- fileName: 출력 파일의 이름을 설정합니다.

**rollupOptions**

- external: 라이브러리에 포함하지 않을 dependency를 명시합니다.
- output: 번들 출력에 대한 옵션을 지정합니다.
  - globals: 번들링 시 라이브러리 외부에 존재하는 dependency를 제공하기 위해 명시합니다.
  - banner: 번들 앞에 해당 문자열을 추가함으로써 모든 컴포넌트들을 클라이언트 컴포넌트로 보장합니다.
  - interop: 외부 dependency와의 모듈 간 상호 작용 방식을 설정합니다.

3. tsconfig.json 수정하기

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

4. .npmignore 설정하기

npm 배포 시 제외할 파일/폴더를 선택합니다.

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

.yarn
storybook-static
package.tgz
iconsAsset
.storybook
```

> **warning**
>
> 해당 파일이 없다면 .gitignore 폴더를 보게 되는데, .gitignore에는 dist 폴더가 존재하기 때문에 npm에 dist 파일이 올라가지 않는 문제가 생길 수 있습니다.
