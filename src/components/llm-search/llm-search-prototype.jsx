import { useState, useRef, useEffect, useCallback } from "react";

/* ============================================
   Design Tokens (mirrors blog CSS variables)
   ============================================ */
const THEMES = {
  light: {
    fill: "255,255,255",
    textBase: "40,39,40",
    accent: "112,75,191",
    card: "230,230,230",
    border: "236,233,233",
  },
  dark: {
    fill: "15,15,15",
    textBase: "234,237,243",
    accent: "194,189,255",
    card: "46,46,46",
    border: "221,216,232",
  },
};

const rgb = v => `rgb(${v})`;
const rgba = (v, a) => `rgba(${v},${a})`;

/* ============================================
   Icons
   ============================================ */
function SparkleIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"
        fill={color}
        stroke={color}
        strokeWidth="1"
      />
    </svg>
  );
}

function SendIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  );
}

function LinkIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CloseIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SunIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function SearchIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/* ============================================
   Streaming Hook
   ============================================ */
function useStreamingText(text, speed = 14, active = false) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) {
      setDisplayed("");
      setDone(false);
      return;
    }
    setDisplayed("");
    setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(iv);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(iv);
  }, [text, active, speed]);
  return { displayed, done };
}

/* ============================================
   Data
   ============================================ */
const POSTS = [
  {
    title: "Create collection of TS/JS packages used in Yourssu",
    slug: "/posts/create-collection-of-packages/",
    date: "2024년 6월 28일",
    desc: "Yrano = Yourssu Resourceful and Noteworthy Operations",
  },
  {
    title: "React Fiber in Reconcile Phase",
    slug: "/posts/react-fiber-in-reconcile-phase/",
    date: "2024년 5월 25일",
    desc: "React Reconcile Phase의 Fiber 샅샅이 뜯어보기!",
  },
  {
    title: "Building a Custom React Renderer",
    slug: "/posts/building-a-custom-react-renderer/",
    date: "2024년 5월 20일",
    desc: "ReactDOM 대신 Custom Renderer를 구축하는 방법을 알아보자",
  },
  {
    title: "Big Migration Journey (Node, Bundler ...)",
    slug: "/posts/big-migration-journey/",
    date: "2024년 4월 15일",
    desc: "Node14, Webpack 마이그레이션 경험기 (w. 에러들..)",
  },
];

const EXAMPLES = [
  "React Fiber가 뭔가요?",
  "Yrano 프로젝트에 대해 알려주세요",
  "마이그레이션 경험에서 겪은 에러는?",
  "Custom Renderer는 어떻게 만드나요?",
];

const MOCK_ANSWER = `React Fiber는 React 16에서 도입된 새로운 재조정(Reconciliation) 엔진입니다. 기존 Stack Reconciler의 한계를 극복하기 위해 설계되었으며, 작업을 작은 단위(fiber)로 나누어 비동기적으로 처리할 수 있는 것이 핵심입니다.

블로그 글에서 다룬 주요 내용은 다음과 같습니다:

• Fiber 노드는 컴포넌트의 인스턴스와 1:1로 매핑되며, type, stateNode, child, sibling, return 등의 속성을 가집니다.

• Reconcile Phase에서 Fiber는 beginWork()와 completeWork() 두 단계를 거쳐 변경사항을 수집하고, Commit Phase에서 실제 DOM에 반영합니다.

• 이 구조 덕분에 작업 우선순위 지정과 중단/재개가 가능해져, 사용자 인터랙션에 더 빠르게 반응할 수 있습니다.`;

/* ============================================
   Main Component
   ============================================ */
export default function HannaLLMSearchPrototype() {
  const [theme, setTheme] = useState("light");
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("idle");
  const [showSources, setShowSources] = useState(false);
  const inputRef = useRef(null);
  const answerRef = useRef(null);

  const t = THEMES[theme];

  const { displayed: streamedText, done: streamDone } = useStreamingText(
    MOCK_ANSWER,
    14,
    phase === "answering"
  );

  useEffect(() => {
    if (streamDone) setPhase("done");
  }, [streamDone]);
  useEffect(() => {
    if (phase === "done") {
      const tm = setTimeout(() => setShowSources(true), 200);
      return () => clearTimeout(tm);
    }
  }, [phase]);
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);
  useEffect(() => {
    if (answerRef.current)
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
  }, [streamedText]);

  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(p => !p);
      }
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = () => {
    if (!query.trim() || phase !== "idle") return;
    setPhase("thinking");
    setTimeout(() => setPhase("answering"), 1500);
  };

  const handleReset = () => {
    setQuery("");
    setPhase("idle");
    setShowSources(false);
    inputRef.current?.focus();
  };

  const handleExampleClick = q => {
    setQuery(q);
    setPhase("thinking");
    setTimeout(() => setPhase("answering"), 1500);
  };

  /* ============================================
     Styles
     ============================================ */
  const s = {
    page: {
      fontFamily:
        '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: rgb(t.fill),
      color: rgb(t.textBase),
      minHeight: "100vh",
      transition: "background 0.3s, color 0.3s",
    },
    topBar: {
      height: 3,
      background: `linear-gradient(90deg, ${rgb(t.accent)}, ${rgba(t.accent, 0.6)})`,
    },
    nav: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      maxWidth: 720,
      margin: "0 auto",
      padding: "14px 20px",
      borderBottom: `1px solid ${rgba(t.border, 0.5)}`,
    },
    logo: {
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: -0.3,
      color: rgb(t.textBase),
      textDecoration: "none",
    },
    navRight: { display: "flex", alignItems: "center", gap: 16 },
    navLink: {
      fontSize: 14,
      color: rgba(t.textBase, 0.6),
      textDecoration: "none",
      cursor: "pointer",
    },
    aiBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 7,
      border: `1px solid ${rgba(t.border, 0.5)}`,
      background: "transparent",
      color: rgba(t.textBase, 0.6),
      fontSize: 13,
      cursor: "pointer",
      transition: "all 0.2s",
      fontFamily: "inherit",
    },
    kbd: {
      fontSize: 10,
      padding: "1px 4px",
      borderRadius: 3,
      background: rgba(t.textBase, 0.05),
      border: `1px solid ${rgba(t.border, 0.4)}`,
      fontFamily: "monospace",
      marginLeft: 2,
    },
    main: { maxWidth: 720, margin: "0 auto", padding: "42px 20px" },
    h1: { fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: -0.5 },
    subtitle: {
      color: rgba(t.textBase, 0.55),
      fontSize: 15,
      marginBottom: 8,
      lineHeight: 1.6,
    },
    /* CTA Card */
    cta: {
      padding: "22px 26px",
      borderRadius: 14,
      border: `1px solid ${rgba(t.border, 0.5)}`,
      background: `linear-gradient(135deg, ${rgba(t.accent, 0.06)} 0%, ${rgba(t.fill, 0.8)} 100%)`,
      marginTop: 28,
      marginBottom: 40,
      cursor: "pointer",
      transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
      textAlign: "left",
      width: "100%",
      fontFamily: "inherit",
    },
    ctaTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
    ctaIcon: {
      width: 30,
      height: 30,
      borderRadius: 8,
      background: rgb(t.accent),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    ctaTitle: { fontSize: 15, fontWeight: 600, color: rgb(t.textBase) },
    ctaDesc: {
      fontSize: 13.5,
      color: rgba(t.textBase, 0.5),
      margin: 0,
      paddingLeft: 40,
      lineHeight: 1.5,
    },
    /* Posts */
    sectionTitle: { fontSize: 20, fontWeight: 700, marginBottom: 20 },
    postLink: {
      color: rgb(t.accent),
      fontSize: 15,
      fontWeight: 500,
      textDecoration: "none",
      cursor: "pointer",
    },
    postDate: { fontSize: 12.5, color: rgba(t.textBase, 0.4), marginTop: 3 },
    postDesc: { fontSize: 13.5, color: rgba(t.textBase, 0.55), marginTop: 3 },
    /* FAB */
    fab: {
      position: "fixed",
      bottom: 24,
      right: 24,
      width: 50,
      height: 50,
      borderRadius: 15,
      border: "none",
      background: `linear-gradient(135deg, ${rgb(t.accent)}, ${rgba(t.accent, 0.7)})`,
      color: "#fff",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 4px 20px ${rgba(t.accent, 0.3)}`,
      zIndex: 999,
      transition: "transform 0.2s",
    },
    /* Modal */
    backdrop: {
      position: "fixed",
      inset: 0,
      background: rgba(t.textBase, 0.3),
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingTop: "8vh",
      zIndex: 1000,
    },
    modal: {
      width: "100%",
      maxWidth: 560,
      maxHeight: "72vh",
      background: rgb(t.fill),
      borderRadius: 18,
      boxShadow: `0 24px 80px rgba(0,0,0,${theme === "dark" ? "0.5" : "0.15"}), 0 0 0 1px ${rgba(t.border, 0.3)}`,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      margin: "0 16px",
    },
    modalHeader: {
      padding: "16px 18px 12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `1px solid ${rgba(t.border, 0.5)}`,
      flexShrink: 0,
    },
    titleGroup: { display: "flex", alignItems: "center", gap: 8 },
    modalIcon: {
      width: 24,
      height: 24,
      borderRadius: 6,
      background: `linear-gradient(135deg, ${rgb(t.accent)}, ${rgba(t.accent, 0.7)})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: { fontSize: 14, fontWeight: 600, color: rgb(t.textBase) },
    badge: {
      fontSize: 9,
      fontWeight: 600,
      padding: "2px 6px",
      borderRadius: 20,
      background: rgba(t.accent, 0.12),
      color: rgb(t.accent),
      letterSpacing: 0.3,
    },
    closeBtn: {
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: 4,
      borderRadius: 6,
      color: rgba(t.textBase, 0.4),
      display: "flex",
      transition: "all 0.15s",
    },
    content: {
      flex: 1,
      overflowY: "auto",
      padding: "18px 18px 0",
      minHeight: 0,
    },
    idleHint: {
      fontSize: 13,
      color: rgba(t.textBase, 0.4),
      marginBottom: 14,
      textAlign: "center",
    },
    exBtn: {
      padding: "10px 14px",
      borderRadius: 9,
      border: `1px solid ${rgba(t.border, 0.5)}`,
      background: rgb(t.fill),
      fontSize: 13,
      color: rgb(t.textBase),
      cursor: "pointer",
      textAlign: "left",
      transition: "all 0.2s",
      lineHeight: 1.4,
      fontFamily: "inherit",
      width: "100%",
    },
    userRow: { display: "flex", justifyContent: "flex-end", marginBottom: 14 },
    userBubble: {
      padding: "9px 14px",
      borderRadius: "13px 13px 4px 13px",
      background: rgb(t.accent),
      color: "#fff",
      fontSize: 13.5,
      maxWidth: "80%",
      lineHeight: 1.5,
      wordBreak: "keep-all",
    },
    asstRow: { display: "flex", gap: 9, marginBottom: 14 },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: 7,
      background: rgba(t.accent, 0.1),
      color: rgb(t.accent),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 2,
    },
    asstBubble: {
      padding: "12px 16px",
      borderRadius: "4px 13px 13px 13px",
      background: rgba(t.textBase, 0.04),
      border: `1px solid ${rgba(t.border, 0.5)}`,
      fontSize: 13.5,
      color: rgb(t.textBase),
      lineHeight: 1.7,
      whiteSpace: "pre-wrap",
      wordBreak: "keep-all",
    },
    thinkLabel: {
      fontSize: 11.5,
      color: rgba(t.textBase, 0.4),
      marginBottom: 4,
    },
    cursor: {
      display: "inline-block",
      width: 2,
      height: 15,
      background: rgb(t.accent),
      marginLeft: 2,
      verticalAlign: "text-bottom",
    },
    srcLabel: {
      fontSize: 11,
      fontWeight: 600,
      color: rgba(t.textBase, 0.4),
      marginBottom: 7,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 12,
    },
    srcCard: (vis, i) => ({
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "9px 12px",
      borderRadius: 9,
      border: `1px solid ${rgba(t.border, 0.5)}`,
      textDecoration: "none",
      color: rgb(t.textBase),
      background: rgb(t.fill),
      transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(8px)",
      transitionDelay: `${i * 80}ms`,
      cursor: "pointer",
      marginBottom: 5,
    }),
    srcIdx: {
      width: 22,
      height: 22,
      borderRadius: 5,
      background: rgba(t.accent, 0.1),
      color: rgb(t.accent),
      fontSize: 10,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    srcTitle: { flex: 1, fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 },
    footer: {
      padding: "12px 14px 14px",
      borderTop: `1px solid ${rgba(t.border, 0.5)}`,
      flexShrink: 0,
    },
    inputWrap: active => ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderRadius: 11,
      border: `1.5px solid ${active ? rgba(t.accent, 0.5) : rgba(t.border, 0.5)}`,
      padding: "3px 3px 3px 14px",
      transition: "border-color 0.2s",
      background: rgb(t.fill),
    }),
    input: {
      flex: 1,
      border: "none",
      outline: "none",
      fontSize: 13.5,
      color: rgb(t.textBase),
      background: "transparent",
      fontFamily: "inherit",
    },
    sendBtn: active => ({
      width: 32,
      height: 32,
      borderRadius: 8,
      border: "none",
      background: active
        ? `linear-gradient(135deg, ${rgb(t.accent)}, ${rgba(t.accent, 0.7)})`
        : rgba(t.textBase, 0.05),
      color: active ? "#fff" : rgba(t.textBase, 0.15),
      cursor: active ? "pointer" : "default",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      transition: "all 0.2s",
    }),
    resetBtn: {
      width: "100%",
      padding: 9,
      borderRadius: 9,
      border: `1px solid ${rgba(t.border, 0.5)}`,
      background: rgb(t.fill),
      fontSize: 12.5,
      color: rgba(t.textBase, 0.45),
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "all 0.2s",
    },
    disclaimer: {
      textAlign: "center",
      fontSize: 10.5,
      color: rgba(t.textBase, 0.22),
      marginTop: 7,
    },
    /* Footer */
    blogFooter: {
      maxWidth: 720,
      margin: "0 auto",
      padding: "32px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderTop: `1px solid ${rgba(t.border, 0.4)}`,
      marginTop: 40,
    },
    footerText: { fontSize: 13, color: rgba(t.textBase, 0.35) },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        @keyframes dotP{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes modalIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes bdIn{from{opacity:0}to{opacity:1}}
        @keyframes cblink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fabG{0%,100%{box-shadow:0 4px 20px ${rgba(t.accent, 0.25)}}50%{box-shadow:0 4px 28px ${rgba(t.accent, 0.45)}}}
        * { box-sizing: border-box; margin: 0; }
        body { margin: 0; }
      `}</style>

      <div style={s.page}>
        {/* Top accent line */}
        <div style={s.topBar} />

        {/* Nav */}
        <nav style={s.nav}>
          <span style={s.logo}>Hanna.Dev</span>
          <div style={s.navRight}>
            <span style={s.navLink}>Posts</span>
            <span style={s.navLink}>Tags</span>
            <span style={s.navLink}>About</span>
            <span
              style={{ ...s.navLink, display: "flex", alignItems: "center" }}
            >
              <SearchIcon size={16} />
            </span>

            {/* ✨ AI Search trigger in nav */}
            <button
              style={s.aiBtn}
              onClick={() => setIsOpen(true)}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = rgb(t.accent);
                e.currentTarget.style.color = rgb(t.accent);
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = rgba(t.border, 0.5);
                e.currentTarget.style.color = rgba(t.textBase, 0.6);
              }}
            >
              <SparkleIcon size={13} color="currentColor" />
              <span>AI</span>
              <kbd style={s.kbd}>⌘K</kbd>
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(p => (p === "light" ? "dark" : "light"))}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: rgba(t.textBase, 0.6),
                display: "flex",
                padding: 2,
              }}
            >
              {theme === "light" ? (
                <MoonIcon size={17} />
              ) : (
                <SunIcon size={17} />
              )}
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main style={s.main}>
          <h1 style={s.h1}>Hanna's Blog</h1>
          <p style={s.subtitle}>Welcome to my personal blog!</p>
          <p style={{ ...s.subtitle, fontSize: 14 }}>
            You can follow me on my social media and{" "}
            <span style={{ textDecoration: "underline", cursor: "pointer" }}>
              Github
            </span>{" "}
            account. 👋🏻
          </p>

          {/* Resume card */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 10,
              border: `1px solid ${rgba(t.border, 0.5)}`,
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
              width: "fit-content",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: rgba(t.accent, 0.08),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              📄
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>이력서</div>
              <div style={{ fontSize: 12.5, color: rgba(t.textBase, 0.45) }}>
                PDF로 보기 →
              </div>
            </div>
          </div>

          {/* ✨ CTA Card - 여기에 배치 */}
          <button
            style={s.cta}
            onClick={() => setIsOpen(true)}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = rgba(t.accent, 0.4);
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = `0 8px 30px ${rgba(t.accent, 0.1)}`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = rgba(t.border, 0.5);
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={s.ctaTop}>
              <div style={s.ctaIcon}>
                <SparkleIcon size={14} color="#fff" />
              </div>
              <span style={s.ctaTitle}>블로그에 궁금한 점이 있으신가요?</span>
            </div>
            <p style={s.ctaDesc}>
              AI가 블로그 글을 분석하여 질문에 답변해 드립니다. 클릭하거나{" "}
              <kbd style={s.kbd}>⌘K</kbd>를 눌러보세요.
            </p>
          </button>

          {/* Recent Posts */}
          <h2 style={s.sectionTitle}>Recent Posts</h2>
          {POSTS.map((p, i) => (
            <div key={i} style={{ marginBottom: 22 }}>
              <a style={s.postLink}>{p.title}</a>
              <div style={s.postDate}>📅 {p.date}</div>
              <div style={s.postDesc}>{p.desc}</div>
            </div>
          ))}

          {/* All Posts link */}
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <span style={{ ...s.postLink, fontSize: 14 }}>All Posts →</span>
          </div>
        </main>

        {/* Footer */}
        <div style={s.blogFooter}>
          <span style={s.footerText}>
            Copyright © 2026 | All rights reserved.
          </span>
          <div
            style={{ display: "flex", gap: 12, color: rgba(t.textBase, 0.4) }}
          >
            <span style={{ cursor: "pointer" }}>🐙</span>
            <span style={{ cursor: "pointer" }}>📷</span>
            <span style={{ cursor: "pointer" }}>💼</span>
          </div>
        </div>
      </div>

      {/* ============================================
         FAB
         ============================================ */}
      {!isOpen && (
        <button
          style={s.fab}
          onClick={() => setIsOpen(true)}
          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
        >
          <SparkleIcon size={20} color="#fff" />
        </button>
      )}

      {/* ============================================
         Modal
         ============================================ */}
      {isOpen && (
        <div
          style={{ ...s.backdrop, animation: "bdIn 0.2s ease-out" }}
          onClick={e => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
              handleReset();
            }
          }}
        >
          <div
            style={{
              ...s.modal,
              animation: "modalIn 0.25s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            {/* Header */}
            <div style={s.modalHeader}>
              <div style={s.titleGroup}>
                <div style={s.modalIcon}>
                  <SparkleIcon size={12} color="#fff" />
                </div>
                <span style={s.modalTitle}>Hanna.Dev AI</span>
                <span style={s.badge}>BETA</span>
              </div>
              <button
                style={s.closeBtn}
                onClick={() => {
                  setIsOpen(false);
                  handleReset();
                }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background = rgba(t.textBase, 0.06))
                }
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <CloseIcon size={17} />
              </button>
            </div>

            {/* Content */}
            <div ref={answerRef} style={s.content}>
              {phase === "idle" && (
                <div>
                  <p style={s.idleHint}>블로그 글에 대해 무엇이든 물어보세요</p>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 7 }}
                  >
                    {EXAMPLES.map((q, i) => (
                      <button
                        key={i}
                        style={s.exBtn}
                        onClick={() => handleExampleClick(q)}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = rgb(t.accent);
                          e.currentTarget.style.background = rgba(
                            t.accent,
                            0.06
                          );
                          e.currentTarget.style.color = rgb(t.accent);
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = rgba(
                            t.border,
                            0.5
                          );
                          e.currentTarget.style.background = rgb(t.fill);
                          e.currentTarget.style.color = rgb(t.textBase);
                        }}
                      >
                        <span style={{ marginRight: 8, opacity: 0.4 }}>→</span>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {phase !== "idle" && (
                <div style={s.userRow}>
                  <div style={s.userBubble}>{query}</div>
                </div>
              )}

              {phase === "thinking" && (
                <div style={s.asstRow}>
                  <div style={s.avatar}>
                    <SparkleIcon size={13} />
                  </div>
                  <div style={s.asstBubble}>
                    <div style={s.thinkLabel}>
                      블로그 글을 분석하고 있어요...
                    </div>
                    <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            display: "block",
                            background: rgba(t.accent, 0.7),
                            animation: `dotP 1.2s ease-in-out ${i * 0.15}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(phase === "answering" || phase === "done") && (
                <div style={s.asstRow}>
                  <div style={s.avatar}>
                    <SparkleIcon size={13} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={s.asstBubble}>
                      {streamedText}
                      {phase === "answering" && (
                        <span
                          style={{
                            ...s.cursor,
                            animation: "cblink 0.8s step-end infinite",
                          }}
                        />
                      )}
                    </div>
                    {(phase === "done" || showSources) && (
                      <div>
                        <div style={s.srcLabel}>📎 참고한 글</div>
                        {POSTS.slice(0, 2).map((p, i) => (
                          <div
                            key={i}
                            style={s.srcCard(showSources, i)}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = rgb(t.accent);
                              e.currentTarget.style.background = rgba(
                                t.accent,
                                0.06
                              );
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = rgba(
                                t.border,
                                0.5
                              );
                              e.currentTarget.style.background = rgb(t.fill);
                            }}
                          >
                            <span style={s.srcIdx}>{i + 1}</span>
                            <span style={s.srcTitle}>{p.title}</span>
                            <LinkIcon
                              size={12}
                              color={rgba(t.textBase, 0.35)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={s.footer}>
              {phase === "done" ? (
                <button
                  style={s.resetBtn}
                  onClick={handleReset}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = rgb(t.accent);
                    e.currentTarget.style.color = rgb(t.accent);
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = rgba(t.border, 0.5);
                    e.currentTarget.style.color = rgba(t.textBase, 0.45);
                  }}
                >
                  ↻ 새 질문하기
                </button>
              ) : (
                <div style={s.inputWrap(phase !== "idle")}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                    placeholder="블로그에 대해 질문해 보세요..."
                    disabled={phase !== "idle"}
                    style={s.input}
                  />
                  <button
                    style={s.sendBtn(query.trim() && phase === "idle")}
                    onClick={handleSubmit}
                    disabled={!query.trim() || phase !== "idle"}
                  >
                    <SendIcon size={14} />
                  </button>
                </div>
              )}
              <div style={s.disclaimer}>
                AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
