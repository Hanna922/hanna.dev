# LLM Search 통합 가이드

> `hanna-dev.co.kr` (Astro v5) 블로그에 AI 검색 기능을 붙이기 위한 안내서

---

## 📁 파일 배치

```
src/
├── components/
│   └── llm-search/
│       ├── index.ts              ← barrel export
│       ├── types.ts              ← 타입 정의
│       ├── hooks.ts              ← React 커스텀 훅
│       ├── Icons.tsx             ← SVG 아이콘 컴포넌트
│       ├── LLMSearchModal.tsx    ← 메인 모달 + FAB
│       ├── LLMSearchCTA.tsx      ← 홈페이지 CTA 카드
│       ├── llm-search.css        ← 모달 스타일 (CSS 변수 연동)
│       └── llm-search-cta.css    ← CTA 카드 스타일
```

---

## 🔌 통합 위치 (3곳)

### 1️⃣ `Layout.astro` — 모달 + FAB (모든 페이지)

전체 레이아웃에 모달 컴포넌트를 넣어서, **어느 페이지에서든** ⌘K 또는 FAB로 열 수 있게 합니다.

```astro
---
// src/layouts/Layout.astro (또는 Base.astro)
import Header from "@components/Header.astro";
import Footer from "@components/Footer.astro";
import LLMSearchModal from "@components/llm-search/LLMSearchModal";
---

<html data-theme="light">
  <body>
    <Header />
    <main id="main-content">
      <slot />
    </main>
    <Footer />

    <!-- ✅ 여기: 모달 + FAB (client:load로 즉시 로드) -->
    <LLMSearchModal client:load />
  </body>
</html>
```

> **왜 `client:load`?** — ⌘K 단축키를 페이지 로드 즉시 활성화하기 위해서입니다.

---

### 2️⃣ `Header.astro` — 네비게이션 AI 검색 버튼

기존 검색 아이콘(🔍) 옆에 AI 검색 버튼을 추가합니다.

```astro
---
// src/components/Header.astro
---

<nav>
  <ul>
    <li><a href="/posts/">Posts</a></li>
    <li><a href="/tags/">Tags</a></li>
    <li><a href="/about/">About</a></li>
    <li>
      <a href="/search/">
        <span>Search</span>
        <!-- 기존 검색 -->
      </a>
    </li>

    <!-- ✅ 여기: AI 검색 버튼 추가 -->
    <li>
      <button
        id="llm-search-trigger"
        class="llm-nav-trigger"
        aria-label="AI 검색"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813
            1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0
            00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"></path>
        </svg>
        <span>AI</span>
        <kbd>⌘K</kbd>
      </button>
    </li>

    <li><!-- 다크모드 토글 --></li>
  </ul>
</nav>

<style>
  .llm-nav-trigger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 7px;
    border: 1px solid rgba(var(--color-border), 0.6);
    background: transparent;
    color: rgba(var(--color-text-base), 0.65);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .llm-nav-trigger:hover {
    border-color: rgb(var(--color-accent));
    color: rgb(var(--color-accent));
  }

  .llm-nav-trigger kbd {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(var(--color-text-base), 0.06);
    border: 1px solid rgba(var(--color-border), 0.5);
    font-family: monospace;
    margin-left: 2px;
  }
</style>

<script>
  // 버튼 클릭 시 Custom Event 발행 → LLMSearchModal이 수신
  document
    .getElementById("llm-search-trigger")
    ?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("llm-search:open"));
    });
</script>
```

> **핵심**: `window.dispatchEvent(new CustomEvent("llm-search:open"))`로
> Astro 아일랜드 간 통신을 구현합니다. LLMSearchModal의 `useLLMSearchEvent` 훅이 이를 수신합니다.

---

### 3️⃣ `index.astro` — 홈페이지 CTA 카드

"Hanna's Blog" 소개 영역과 "Recent Posts" 사이에 CTA 카드를 배치합니다.

```astro
---
// src/pages/index.astro
import Layout from "@layouts/Layout.astro";
import LLMSearchCTA from "@components/llm-search/LLMSearchCTA";
---

<Layout>
  <!-- 기존 소개 섹션 -->
  <section id="hero">
    <h1>Hanna's Blog</h1>
    <p>Welcome to my personal blog!</p>
    <!-- Social links, 이력서 카드 등 -->
  </section>

  <!-- ✅ 여기: AI 검색 CTA 카드 -->
  <div style="margin-bottom: 2rem;">
    <LLMSearchCTA client:visible />
  </div>

  <!-- 기존 Recent Posts 섹션 -->
  <section id="recent-posts">
    <h2>Recent Posts</h2>
    <!-- ... -->
  </section>
</Layout>
```

> **왜 `client:visible`?** — 스크롤하여 보일 때만 hydrate하므로 초기 로드 성능에 영향 없음.

---

## 📐 블로그 내 배치 시각화

```
┌─────────────────────────────────────────────┐
│  Hanna.Dev    Posts  Tags  About  🔍 ✨AI ◐ │ ← ② Header 트리거
├─────────────────────────────────────────────┤
│                                             │
│  Hanna's Blog                               │
│  Welcome to my personal blog!               │
│  Social Links: 🐙 📷 💼                     │
│  ┌──────────────────┐                       │
│  │ 📄 이력서          │                       │
│  └──────────────────┘                       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ✨ 블로그에 궁금한 점이 있으신가요?     │    │ ← ③ CTA 카드
│  │    AI가 블로그 글을 분석하여 답변...    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Recent Posts                               │
│  • Create collection of TS/JS packages...   │
│  • React Fiber in Reconcile Phase           │
│  • Building a Custom React Renderer         │
│                                             │
│                           ┌────┐            │
│                           │ ✨ │            │ ← ① FAB (모든 페이지)
│                           └────┘            │
└─────────────────────────────────────────────┘
```

---

## 🎨 테마 연동 (자동)

CSS가 블로그의 기존 CSS 변수를 직접 참조하므로 **다크모드 전환 시 자동 대응**됩니다:

| 변수                | Light         | Dark          |
| ------------------- | ------------- | ------------- |
| `--color-fill`      | `255,255,255` | `15,15,15`    |
| `--color-text-base` | `40,39,40`    | `234,237,243` |
| `--color-accent`    | `112,75,191`  | `194,189,255` |
| `--color-card`      | `230,230,230` | `46,46,46`    |
| `--color-border`    | `236,233,233` | `221,216,232` |

---

## 🔧 실제 LLM 백엔드 연동 시

`LLMSearchModal.tsx`에서 `MOCK_ANSWER`와 `MOCK_SOURCES`를 실제 API 호출로 교체:

```tsx
// LLMSearchModal.tsx 내부 handleSubmit 수정
const handleSubmit = async () => {
  if (!query.trim() || phase !== "idle") return;
  setPhase("thinking");

  try {
    const res = await fetch("/api/llm-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data: LLMResponse = await res.json();

    // answer와 sources를 state로 관리하도록 변경
    setAnswer(data.answer);
    setSources(data.sources);
    setPhase("answering");
  } catch (error) {
    // 에러 처리
    setPhase("idle");
  }
};
```

---

## ✅ 요약

| 컴포넌트           | 배치 위치      | Astro Directive     | 역할                      |
| ------------------ | -------------- | ------------------- | ------------------------- |
| `LLMSearchModal`   | `Layout.astro` | `client:load`       | 모달 UI + FAB + ⌘K 단축키 |
| Header 트리거 버튼 | `Header.astro` | Vanilla JS (script) | Custom Event로 모달 열기  |
| `LLMSearchCTA`     | `index.astro`  | `client:visible`    | 홈페이지 진입점 카드      |
