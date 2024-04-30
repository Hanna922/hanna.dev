---
author: Hanna922
pubDatetime: 2024-03-29T9:52:17.000Z
modDatetime:
title: Design System Publish in NPM (3)
featured: false
draft: false
tags:
  - NPM
  - Design System
  - Yourssu
  - Github Action
description: GitHub Action을 활용해서 Storybook, NPM 자동배포를 설정해 보자
---

해당 게시글은 vite v4, typescript v5, react v18, storybook v8, pnpm v8 환경에서 작성되었습니다.

## Storybook & NPM 배포 자동화

YDS는 github action을 활용하여 storybook을 버전 별로 aws s3에 배포하며, 패키지를 npm에 배포하고 있습니다.

1. S3 버킷 생성 및 설정 - 생략합니다.
2. Bucket Versioning 설정

Storybook을 버전 별로 배포하기 위해 AWS S3 버킷 버전 관리를 활성화합니다.

<img style="width:1000px;height:310px;" src="/blog/design-system-publish/bucket-versioning.png" />

YDS는 `{주소}/v0.1.0/*` 형태로 Storybook을 배포하고 있습니다.

버전 정보는 deploy 전 package.json에서 가져온 후, deploy 시 가져온 버전 정보를 넣어주도록 yml script를 작성합니다.

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

3. Repository secrets 등록

<img style="width:1000px;height:230px;" src="/blog/design-system-publish/repo-secrets.png" />

4. .npmrc 설정

로컬에서 npm publish를 진행할 때는 로그인이 되어있는 상태이기 때문에 문제가 발생하지 않지만,
github action에서는 로그인 NPM_TOKEN을 넣어주지 않을 시 인증 에러가 발생합니다.

<img style="width:1000px;height:130px;" src="/blog/design-system-publish/build-fail-1.png" />

따라서 root 경로에 .npmrc 파일을 생성하고, yml에서 사용하는 NPM_TOKEN을 넣어줍니다.

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

## yarn to pnpm in github workflow

YDS는 원래 yarn을 사용하고 있었지만 최근 pnpm으로 마이그레이션을 진행하였고, 이에 따라 workflows 명령어도 변경이 필요하였습니다.

```yml
# 변경 전 yarn 명령어를 사용하던 steps 부분
- name: Install dependencies
  run: yarn install --immutable --immutable-cache --check-cache

- name: Build storybook
  run: yarn build-storybook --output-dir=storybook-static
```

해당 부분을 변경하지 않는다면 Install dependencies에서 에러가 발생하며, 변경 시 yarn과 달리 (pnpm의 경우) set up 및 version을 명시해주어야 합니다.

#### Set Up을 하지 않았을 경우

<img style="width:1000px;height:160px;" src="/blog/design-system-publish/build-fail-2.png" />

#### PackageManager, Version 명시를 하지 않았을 경우

<img style="width:1000px;height:300px;" src="/blog/design-system-publish/build-fail-3.png" />

```yml
# 전체 코드 (packageManager: pnpm)
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

      # 이전 yml script와 달리 cache 설정을 따로 하지 않았습니다.
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

yml 작동 과정을 간략하게 요약해보자면, main branch로 push가 되면, jobs의 steps 순서대로 실행됩니다.

- 먼저 source code를 checkout한 후, pnpm v8을 setup하고, node.js v20을 setup합니다.
- 그 후, pnpm install을 실행하여 dependencies를 설치하고, build, build-storybook 명령어를 차례대로 실행합니다.
- package.json에서 버전 정보를 추출한 후 s3 버킷에 배포 시 해당 버전 정보를 함께 넣어줍니다.
- 마지막으로 npm publish를 실행하여 패키지를 배포합니다.

Storybook 문서 url이 현재 버전 정보를 포함하고, NPM 패키지도 정상 배포 되었다면 성공입니다.

개발자에게 효율은 생명 ¡¡¡( •̀ ᴗ •́ )و!!!

### Reference

- https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow#create-and-check-in-a-project-specific-npmrc-file
