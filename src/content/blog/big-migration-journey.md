---
author: Hanna922
pubDatetime: 2024-04-15T10:22:26.000Z
modDatetime:
title: Big Migration Journey (Node, Bundler ...)
featured: false
draft: false
tags:
  - Intern
  - Migration
  - Node
  - Bundler
  - Tailwind
description: Node14, Webpack 마이그레이션 경험기 (w. 에러들..)
---

## 리팩토링을 결심하게 된 이유

인턴십 중 Dialog를 하나 띄우는 작업을 맡아 Radix를 사용하려 했습니다.

하지만 Radix가 설치되지 않는 문제가 발생했는데,,, 원인은 레거시 코드..! 🥲

**수많은 문제점들**

- 100s에 다다르는 yarn time
- radix-dialog 설치 불가
- eslint-plugin-prettier 설치 불가
- webpack 설정이 cjs로 이루어져 있음
- node 14 특정 버전 이상에서 yarn 실행 불가
- tailwind v1 사용 중이라 최신 tailwind property 사용 불가

등등등...

## migration

- Node14 -> Node20
- Webpack -> Vite (cjs -> esm)
- tailwind v1 + twin.macro -> tailwind v3
- react 16 -> react 18
- etc...

## 마주한 에러들

1. custom property 사용 시 twin.macro에서 error 발생

노드 버전을 20으로 올리고 번들러를 Vite으로 갈아끼우니 모든 파일에서 에러가 발생하였습니다. twin.macro와 emotion을 결합하여 사용하고 있었는데, twin.macro에서 custom property를 찾지 못하는 문제였습니다.

<img style="width:600px;height:450px;" src="/blog/big-migration-journey/twin.macro-error.png"/>

custom property를 사용하려면 tailwindcss className 내에 속성을 명시해주거나, tailwind.config.ts에 따로 추가해주어야 했습니다.

Ref: https://github.com/ben-rogerson/twin.macro/issues/855

하지만, 사용하고 있던 custom property 양이 매우 방대했으며(코드 81088줄..) custom property만을 찾아내어 className에 넣어주는 것은 너무 큰 작업이었습니다.

따라서, twin.macro를 사용함으로써 큰 이점을 보고 있지 않다는 점 + custom property가 매우 방대하다는 점 두 이유로 twin.macro를 사용하던 코드를 모두 기본 tailwindcss로 마이그레이션을 진행하였습니다.

마이그레이션 후엔 import 방식으로 tailwindcss가 custom property를 인식할 수 있게 설정해주었습니다.

2. import-order version update에 따른 사용법 변경

추가로 자잘한 에러 사항들을 수정하며 버전 업데이트를 진행하였습니다.

## performance

전체 프로젝트 크기는 1/2로 감소하였으며, yarn time은 1/5이나 단축되었습니다.

프로젝트를 처음 클론할 때 굉장히 오래 걸리는 문제가 있었는데, 이젠 프로젝트를 빠르게 시작할 수 있습니다.

개발자 경험이 좋아졌다고 할 수 있겠네요!

| **before migration** | **after migration** |
| -------------------- | ------------------- |
| project size: 689MB  | project size: 322MB |
| yarn time: 105.18s.  | yarn time: 24.24s.  |
| all size: 10.1MiB    | all size: 8.3MiB    |
| lighthouse: 45       | lighthouse: 55      |
| ready time: 측정생략 | ready time: 492ms   |

(왼쪽 사진은 마이그레이션 전, 오른쪽은 마이그레이션 후입니다.)

<div style="display:grid; grid-template-columns: 1fr 1fr">
  <img style="width:600px;height:300px;" src="/blog/big-migration-journey/before1.png" />
  <img style="width:300px;height:160px;" src="/blog/big-migration-journey/after1.png" />
</div>

<div style="display:grid; grid-template-columns: 1fr 1fr">
  <img style="width:250px;height:430px;" src="/blog/big-migration-journey/before2.png" />
  <img style="width:250px;height:430px;" src="/blog/big-migration-journey/after2.png" />
</div>

번들러 마이그레이션과 불필요한 패키지를 삭제하는 것만으로도 자그마한 성능 이점을 볼 수 있었으며 전체 프로젝트의 성능이 향상됨에따라 더 많은 시도를 빠르게 할 수 있게 되었습니다.
레거시 코드는 쌓여갈수록 리팩토링하기 어려워지기 때문에, 주기적으로 프로젝트의 성능을 점검하고 시간을 투자해야한다고 생각합니다.

마이그레이션을 진행한 후, prettier 설정과 radix-dialog 설치도 성공적으로 마무리하였습니다.

이번 기회에 리팩토링을 진행하게 되어 좋은 경험을 얻을 수 있었습니다. ദ്ദി ˃ ᴗ ˂ )
