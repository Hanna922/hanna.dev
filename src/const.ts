export const DetailDialogContent = [
  {
    title: "Stock Condition Analysis",
    overview:
      "본 프로젝트는 개인 투자자가 실시간 주식 데이터와 AI 기반 뉴스 분석을 통해 보다 빠르고 객관적인 투자 판단을 내릴 수 있도록 지원하기 위해 기획되었습니다.",
    image: "/projects/stock.png",
    date: "2025.03 ~ 2025.06",
    team: "Web Frontend(2명) / 5명",
    role: `- 프로젝트 전반의 UI/UX 및 화면 구조 설계
- Next.js 기반 프론트엔드 아키텍처 및 페이지 개발
- 나스닥 100 종목 실시간 주가, 기술적 지표, 뉴스 및 AI 요약 데이터 시각화 구현
- 종목별 대시보드 및 시장 현황 페이지 UI 개발`,
    experience: `Coming Soon...`,
    tech: "TypeScript, Next.js, tailwindcss, recharts, swc",
    link: [
      {
        title: "Github",
        url: "https://github.com/stock-condition-analysis",
      },
      {
        title: "Github of Base Project (data pipeline)",
        url: "https://github.com/HwanGonJang/stock-streaming-data-pipeline",
      },
    ],
  },
  {
    title: "YDS (Yourssu Design System)",
    overview:
      "유어슈에서는 뷰 컴포넌트 재사용성 향상, 일관된 디자인 퀄리티 보장을 위해 자체 디자인 시스템을 활용합니다.",
    image: "/projects/yds.png",
    date: "2023.09 ~ ",
    team: "Web Frontend(2명)",
    role: `- BoxButton, PlainButton, CheckBox, SuffixTextField, PasswordTextField, ListItem 개발
- Polymorphic Component 를 위한 설계 (apply forwardRef, extends HTMLElement)
- Storybook 문서화
- Storybook 버전별 배포 자동화 (with GitHub Action, AWS S3 Bucket Versioning)
- NPM Package 배포 자동화 (with GitHub Action)
- yarn classic -> pnpm migration`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, Storybook, Styled-Component, Vite, swc",
    link: [
      {
        title: "Github",
        url: "https://github.com/yourssu/YDS-React",
      },
      {
        title: "NPM",
        url: "https://www.npmjs.com/package/@yourssu/design-system-react",
      },
      {
        title: "Storybook",
        url: "https://yds-react-storybook.s3.ap-northeast-2.amazonaws.com/1.1.1/index.html",
      },
      {
        title: "Figma",
        url: "https://www.figma.com/community/file/1146974544001355129",
      },
      {
        title: "Wiki",
        url: "https://yourssu.notion.site/Yourssu-Design-System-00577fab034e46cb8aeb330247376a15",
      },
    ],
  },
  {
    title: "Soomsil",
    overview:
      "숭실대학교 학생들의 편의를 위한 서랍장/검색 서비스이며, 3개의 TF 단위(Drawer, Search, Home)로 작업합니다.",
    image: "/projects/soomsil-home.png",
    date: "2024.02 ~ ",
    team: "Web Frontend(8명)",
    role: `- Soomsil Project Initial Setting (3개의 TF가 동시 개발을 할 수 있도록 구조 설정)
- Drawer Main Page 개발
- Drawer Service Upload Page 개발
- Common Button/Footer Component 개발
- yarn classic -> pnpm migration`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, TanStack Query, Recoil, Styled-Component, Vite",
    link: [
      {
        title: "Github",
        url: "https://github.com/yourssu/Soomsil-Web",
      },
    ],
  },
  {
    title: "Yrano (Yourssu Resourceful and Noteworthy Operations)",
    overview:
      "Yourssu에서 사용하는 TypeScript/JavaScript Package들을 Monorepo 형태로 관리합니다.",
    image: "/projects/yrano.png",
    date: "2024.05.27 ~ ",
    team: "Web Frontend(3명)",
    role: `- Initial Setting (monorepo, turborepo, tsup, pnpm)
- apply changeset with github action
- create YLS(Yourssu Logging System) package (@yourssu/logging-system)
- create useSecTimer, useMediaQuery (@yourssu/react)
- create debounce, throttle function (@yourssu/utils)
- create useDebounce, useThrottle (@yourssu/react)`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, Vitest, Turborepo, Tsup, Pnpm",
    link: [
      {
        title: "Github",
        url: "https://github.com/yourssu/Yrano",
      },
    ],
  },
  {
    title: "All:Chive",
    overview:
      "링크부터 스크린샷까지 손쉽게 관리하고 큐레이션하는 아카이빙 서비스입니다.",
    image: "/projects/allChive.png",
    date: "2023.06 ~ 2023.08",
    team: "Web Frontend(2명) / 5명",
    role: `- Archiving & Contents Upload 기능 개발
- Archiving & Contents Search 기능 개발
- Tag 생성, 수정, 삭제 등 관리 및 필터링 기능 개발
- 카테고리 별 아카이빙 필터링 기능 개발
- 마이페이지 내부 기능(아카이빙 관리, 태그 관리, 차단 관리, 휴지통) 개발
- 약관 및 고객센터 인앱브라우저 연결
- Android 배포 및 개발 환경 분리`,
    experience: `Coming Soon...`,
    performance: `- App Store 'Productivity' 랭킹 94위 달성
- 디스콰이엇 트렌딩 프로덕트 1위 달성`,
    tech: "TypeScript, React Native, TanStack Query, Recoil, Emotion",
    link: [
      {
        title: "Github",
        url: "https://github.com/ALL-CHIVE/All-Chive-Mobile",
      },
      {
        title: "App Store",
        url: "https://apps.apple.com/us/app/%EC%98%AC%EC%B9%B4%EC%9D%B4%EB%B8%8C-all-chive/id6462470996",
      },
      {
        title: "Play Store",
        url: "https://play.google.com/store/apps/details?id=com.allchivemobile&pli=1",
      },
    ],
  },
  {
    title: "YLS (Yourssu Logging System)",
    overview:
      "Soomsil 사용자의 행동을 로깅하여 Back-end로 전송, Kibana로 시각화합니다.",
    image: "/projects/yls.png",
    date: "2024.01 ~ 2024.02",
    team: "Web Frontend(2명)",
    role: `- Logging 로직을 선언적으로 관리할 수 있도록 패키지 구조 설정 (export React Component)
- LogClick(유저의 클릭 이벤트 감지) 개발
- Logging System 내에서 유저를 식별할 수 없도록 로직 설계
- 로그인 / 비로그인 유저의 userId / randomId 값을 바탕으로 sha256 암호화
- NPM Package 배포`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, Axios, Crypto-js, Vite",
    link: [
      {
        title: "Github",
        url: "https://github.com/yourssu/YLS-Web",
      },
      {
        title: "NPM",
        url: "https://www.npmjs.com/package/@yourssu/logging-system-react",
      },
    ],
  },
  {
    title: "UniBook",
    overview:
      "마크다운을 기반으로 EBook을 작성 및 판매할 수 있으며, 책을 구매하는 사람은 편리하게 읽을 수 있는 서비스입니다.",
    image: "/projects/uniBook.png",
    date: "2024.05 ~ ",
    team: "Web Frontend(2명)",
    role: `Coming Soon...`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, TanStack Query, TailwindCSS, Shadcn-ui, Vite, swc",
    link: [
      {
        title: "Github",
        url: "https://github.com/unibook-co",
      },
      {
        title: "Service",
        url: "https://unibook.co/",
      },
    ],
  },
  {
    title: "Real World",
    overview:
      "Real World(https://github.com/gothinkster/realworld)를 2명이서 페어 프로그래밍하는 프로젝트입니다.",
    image: "/projects/real-world.png",
    date: "2023.05.23 ~ 2023.07.05",
    team: "Web Frontend(2명)",
    role: `Article, Comment, Tag, Pagination 등 기능 개발`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, TanStack Query, Recoil, React Hook Form, Vite",
    link: [
      {
        title: "Github",
        url: "https://github.com/Hanna922/YourSSU-RealWorld-HH",
      },
    ],
  },
  {
    title: "Signature",
    overview:
      "TensorFlow hand tracking을 이용하여 글씨를 흐트러뜨려볼 수 있습니다.",
    image: "/projects/signature.png",
    date: "2023.12.16 ~ 2023.12.28",
    team: "Web Frontend(3명)",
    role: `- Kinetic Typo 개발
- Text Drawing 개발`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, TensorFlow.js, Canvas, PixiJS, Vite",
    link: [
      {
        title: "Github",
        url: "https://github.com/gdsc-ssu/signature",
      },
    ],
  },
  {
    title: "I-Got-It",
    overview:
      "결심을 세우고 3주 후 이메일로 받을 '미래의 자신에게 보내는 편지'를 작성하며, 자신이 세운 결심을 공유하고 친구들이 응원 메시지를 담으로써 결심을 이룰 수 있도록 도와주는 서비스입니다.",
    image: "/projects/i-got-it-mail.png",
    date: "2023.04.21 ~ 2023.05.12",
    team: "Web Frontend(2명) / 9명",
    role: `- 결심, 편지, 응원 메시지 생성 등 기능 개발`,
    experience: `Coming Soon...`,
    tech: "TypeScript, React, TanStack Query, Recoil, Sass, Radix-ui, Vite",
    link: [
      {
        title: "Github",
        url: "https://github.com/yourssu/i-got-it-frontend",
      },
      {
        title: "Service",
        url: "https://i-got-it.soomsil.de/",
      },
    ],
  },
];

export const MajorProject = [
  {
    title: "Stock Condition Analysis",
    desc: "A real-time stock condition analysis platform integrating live trading data, technical indicators, and AI-based news sentiment.",
    image: "/projects/stock.png",
    tags: ["Capstone", "Next.js", "TailwindCSS", "Recharts"],
    githubUrl: "https://github.com/stock-condition-analysis",
  },
  {
    title: "YDS (Yourssu Design System)",
    desc: "Development of Design System for the Central Club 'Yourssu' at Soongsil University",
    image: "/projects/yds.png",
    tags: ["Yourssu", "Design System", "React", "Storybook"],
    githubUrl: "https://github.com/yourssu/YDS-React",
  },
  {
    title: "Yrano (Yourssu Resourceful and Noteworthy Operations)",
    desc: "TypeScript/JavaScript Package들을 관리하는 Monorepo Project",
    image: "/projects/yrano.png",
    tags: [
      "Yourssu",
      "Packages",
      "Monorepo",
      "Tsup",
      "Logging System",
      "Utils",
    ],
    githubUrl: "https://github.com/yourssu/Yrano",
  },
  {
    title: "Soomsil",
    desc: "숭실대학교 학생들의 편의를 위한 서랍장/검색 서비스",
    image: "/projects/soomsil-home.png",
    tags: ["Yourssu", "3-TF", "React", "TanStack Query"],
    githubUrl: "https://github.com/yourssu/Soomsil-Web",
  },
  {
    title: "All:Chive",
    desc: "링크부터 스크린샷까지 손쉽게 관리하는 아카이빙 서비스",
    image: "/projects/allChive.png",
    tags: ["React Native", "Cross Platform", "TanStack Query"],
    githubUrl: "https://github.com/ALL-CHIVE/All-Chive-Mobile",
  },
];

export const MinorProject = [
  {
    title: "UniBook",
    desc: "마크다운 기반의 EBook 판매 서비스",
    image: "/projects/uniBook.png",
    tags: ["UniBook", "React", "TailwindCSS"],
    githubUrl: "https://github.com/unibook-co",
  },
  {
    title: "Real World",
    desc: "Real World를 2명이서 페어 프로그래밍하는 프로젝트",
    image: "/projects/real-world.png",
    tags: ["Yourssu", "React", "TanStack Query", "Pair Programming"],
    githubUrl: "https://github.com/Hanna922/YourSSU-RealWorld-HH",
  },
  {
    title: "Signature",
    desc: "TensorFlow hand tracking을 이용한 글씨 흩트리기",
    image: "/projects/signature.png",
    tags: ["GDSC", "Tensorflow", "React", "Canvas", "PixiJS"],
    githubUrl: "https://github.com/gdsc-ssu/signature",
  },
  {
    title: "I-Got-It",
    desc: "아가리 파이터들을 위한 결심 공유 프로젝트",
    image: "/projects/i-got-it-mail.png",
    tags: ["Yourssu", "React", "TanStack Query", "Recoil"],
    githubUrl: "https://github.com/yourssu/i-got-it-frontend",
  },
];
