---
author: Hanna922
pubDatetime: 2024-03-26T13:53:26.000Z
modDatetime:
title: Design System Publish in NPM (2)
featured: false
draft: false
tags:
  - NPM
  - Design System
  - Yourssu
description: 패키지를 빌드, 테스트 후 배포해 보자
---

해당 게시글은 vite v4, typescript v5, react v18, storybook v8, pnpm v8 환경에서 작성되었습니다.

## Build & Test

```
> pnpm build
```

드디어 build ଘ(੭ˊ꒳ˋ)੭✧

<img style="width:1000px;height:230px;" src="/blog/design-system-publish/build.png" />

안정적인 배포를 위해서는 빌드 후 바로 배포하지 않고, 테스트를 진행하는 것이 좋다.

```
> pnpm pack
```

npm, yarn 사용 시에도 동일하게 [pack 명령어](https://pnpm.io/cli/pack)를 실행하면, **package명-version.tgz** 파일이 생성된다.

생성된 tgz 파일을 이용해 테스트를 진행하려면, 새로운 프로젝트를 생성하고 해당 파일을 설치해야 한다.

## 테스트 프로젝트 생성

사용하는 환경에 맞게 프로젝트를 생성하면 되는데, 나는 vite, swc, react, typescript 환경으로 테스트 프로젝트를 생성하였다.

```
> yarn create vite . --template react-swc-ts
```

이제 테스트 프로젝트에 tgz 파일을 복사하고, 설치를 진행하자.

<img style="width:1000px;height:100px;" src="/blog/design-system-publish/tgz-example.png"/>

라이브러리를 만들 때 peerDependency로 설정한 라이브러리가 있다면, 해당 라이브러리도 설치해주어야 한다.

설치 후, 구현한 라이브러리 코드를 테스트 프로젝트에 적용해보자.

에러가 발생하지 않고, 정상적으로 불러와진다면 테스트 성!공! 🎉

**+ 패키지를 새롭게 테스트할 경우 캐시가 남아있을 수 있으니 캐시 삭제를 해주어야 한다.**

## Publish

테스트까지 성공적으로 완료했다면, NPM 배포는 매우 간단하다.

npm 계정 로그인 후, publish 명령어만 실행해주면 성!공! 🎉

```
> npm publish
```

만약, 패키지명에 네임스페이스(ex. @yourssu)를 추가한다면, 패키지가 기본적으로 private 배포를 진행한다.
private 배포는 유료이므로, 무료로 배포하려면 public 배포 설정을 해주어야 한다.

```
> npm publish --access=public
```

<img style="width:1000px;height:380px;" src="/blog/design-system-publish/npm.png" />

성공적으로 배포된다면 이렇게 NPM에서 확인할 수 있다. ✌(-‿-)✌
