---
author: Hanna922
pubDatetime: 2024-03-19T9:16:00.000Z
modDatetime:
title: Design System Publish in NPM (1)
titleEn: Design System Publish in NPM (1)
featured: false
draft: false
tags:
  - NPM
  - Design System
  - Yourssu
description: Setting up a package for deploying a design system
---

This post was written in an environment with vite v4, typescript v5, react v18, storybook v8, and pnpm v8.

## Deploy Setting

**1. Configuring package.json**

```json
{
  "name": "package-name-to-publish",
  "version": "package-version",
  "private": false,
  "description": "package description",
  "keywords": ["keywords to help search for your package"],
  "repository": {
    "type": "git",
    "url": "git-url"
  },
  "license": "MIT",
  "type": "module",
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
}
```

- `version`: Must follow semantic versioning guidelines
- `private`: Setting this to `true` incurs a fee
- `files`: Specifies which files to include when the package is installed as a dependency

**Legacy support**

- `main`: Path to the main CJS-built file for Node.js versions prior to v12
- `module`: Entry file path for ESM environments in Node.js versions prior to v12
- `types`: Path to the type definition file for TypeScript versions prior to v4.7

**exports**

- Supported from Node.js v12
- Allows different modules to be provided based on specific conditions or environments
- Written as relative paths starting with `"."`

> **Warning**
>
> To support both CJS and ESM, you need to use Conditional Exports:
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
> However, even after setting up Conditional Exports and running `yarn build`, no `.cts` file was generated in the `dist` folder.
>
> => It turns out that Vite no longer provides CJS builds.
>
> Ref: https://vitejs.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated

**2. Updating vite.config.ts**

Install `vite-plugin-dts` to generate type definition files (`.d.ts`).

```zsh
yarn add -D vite-plugin-dts
```

Full `vite.config.ts`:

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

- `entry`: The entry point — the location that exports all components you want to expose
- `name`: Library name (can match the name in `package.json`)
- `formats`: Specifies which module formats the library should be built in
- `fileName`: Sets the name of the output file

**rollupOptions**

- `external`: Specifies dependencies to exclude from the library bundle
- `output`: Options for the bundle output
  - `globals`: Declares external dependencies to make available during bundling
  - `banner`: Prepends this string to the bundle, ensuring all components are treated as client components
  - `interop`: Configures how the module interacts with external dependencies

**3. Updating tsconfig.json**

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

**4. Configuring .npmignore**

Select files and folders to exclude from the npm publish.

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

> **Warning**
>
> If this file is absent, npm will fall back to `.gitignore`, which typically includes `dist`. This would cause the `dist` folder to be excluded from the npm package — so be careful!
