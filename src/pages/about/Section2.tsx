import { Card } from "@components/Card";
import { useRef } from "react";

export const Section2 = () => {
  const scrollMajorRef = useRef<HTMLDivElement | null>(null);
  const scrollMinorRef = useRef<HTMLDivElement | null>(null);

  const handleCarousel = (e: React.MouseEvent) => {
    const target = e.target as HTMLButtonElement;
    const scrollValue = 500;

    if (scrollMajorRef.current && target.closest(".major-carousel")) {
      const x = scrollMajorRef.current.scrollLeft;
      const scrollDirection =
        target.className === "left" ? -scrollValue : scrollValue;

      scrollMajorRef.current.scrollTo({
        left: x + scrollDirection,
        behavior: "smooth",
      });
    } else if (scrollMinorRef.current && target.closest(".minor-carousel")) {
      const x = scrollMinorRef.current.scrollLeft;
      const scrollDirection =
        target.className === "left" ? -scrollValue : scrollValue;

      scrollMinorRef.current.scrollTo({
        left: x + scrollDirection,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="ml-36 mr-36 mt-28">
      <h2 className="mb-4 text-2xl font-semibold">😆 Major Projects</h2>
      <div
        className="major-carousel flex gap-10 overflow-x-scroll"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        ref={scrollMajorRef}
      >
        <button
          className="absolute left-16 z-10 ml-4 mt-28 h-10 w-10 bg-transparent"
          onClick={handleCarousel}
        >
          <img
            src="/assets/carousel_left_icon.svg"
            alt="carousel_left_icon"
            className="left"
            style={{
              width: "50px",
              height: "50px",
            }}
          />
        </button>
        <button
          className="absolute right-20 z-10 mt-28 h-10 w-10 bg-transparent"
          onClick={handleCarousel}
        >
          <img
            src="/assets/carousel_right_icon.svg"
            alt="carousel_right_icon"
            className="right"
            style={{
              width: "50px",
              height: "50px",
            }}
          />
        </button>
        {MajorProject.map((project, index) => (
          <Card
            key={project.title}
            index={index}
            project={{
              title: project.title || "",
              desc: project.desc || "",
              image: project.image || "",
              tags: project.tags || [],
              githubUrl: project.githubUrl || "",
            }}
          />
        ))}
      </div>

      <h2 className="mb-4 mt-8 text-2xl font-semibold">🙂 Minor Projects</h2>
      <div
        className="minor-carousel flex gap-10 overflow-x-scroll"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        ref={scrollMinorRef}
      >
        <button
          className="absolute left-16 z-10 ml-4 mt-28 h-10 w-10 bg-transparent"
          onClick={handleCarousel}
        >
          <img
            src="/assets/carousel_left_icon.svg"
            alt="carousel_left_icon"
            className="left"
            style={{
              width: "50px",
              height: "50px",
            }}
          />
        </button>
        <button
          className="absolute right-20 z-10 mt-28 h-10 w-10 bg-transparent"
          onClick={handleCarousel}
        >
          <img
            src="/assets/carousel_right_icon.svg"
            alt="carousel_right_icon"
            className="right"
            style={{
              width: "50px",
              height: "50px",
            }}
          />
        </button>
        {MinorProject.map((project, index) => (
          <Card
            key={project.title}
            index={index}
            project={{
              title: project.title || "",
              desc: project.desc || "",
              image: project.image || "",
              tags: project.tags || [],
              githubUrl: project.githubUrl || "",
            }}
          />
        ))}
      </div>
    </div>
  );
};

const MajorProject = [
  {
    title: "YDS (Yourssu Design System)",
    desc: "숭실대학교 중앙동아리 '유어슈' 디자인 시스템 개발",
    image: "/projects/yds.png",
    tags: ["Yourssu", "Design System", "React", "Storybook"],
    githubUrl: "https://github.com/yourssu/YDS-React",
  },
  {
    title: "Soomsil",
    desc: "숭실대학교 학생들의 편의를 위한 서랍장/검색 서비스",
    image: "/projects/soomsil-home.png",
    tags: ["Yourssu", "3-TF", "React", "React Query"],
    githubUrl: "https://github.com/yourssu/Soomsil-Web",
  },
  {
    title: "All:Chive",
    desc: "링크부터 스크린샷까지 손쉽게 관리하는 아카이빙 서비스",
    image: "/projects/allChive.png",
    tags: ["React Native", "Cross Platform", "React Query"],
    githubUrl: "https://github.com/ALL-CHIVE/All-Chive-Mobile",
  },
  {
    title: "YLS (Yourssu Logging System)",
    desc: "숭실대학교 중앙동아리 '유어슈' 로깅 시스템 개발",
    image: "/projects/yls.png",
    tags: ["Yourssu", "Logging System", "React", "Crypto"],
    githubUrl: "https://github.com/yourssu/YLS-Web",
  },
];

const MinorProject = [
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
    tags: ["Yourssu", "React", "React Query", "Pair Programming"],
    githubUrl: "https://github.com/Hanna922/YourSSU-RealWorld-HH",
  },
  {
    title: "Signature",
    desc: "Tensorflow hand tracking을 이용한 글씨 흩트리기",
    image: "/projects/signature.png",
    tags: ["GDSC", "Tensorflow", "React", "Canvas", "PixiJS"],
    githubUrl: "https://github.com/gdsc-ssu/signature",
  },
  {
    title: "I-Got-It",
    desc: "아가리 파이터들을 위한 결심 공유 프로젝트",
    image: "/projects/i-got-it-mail.png",
    tags: ["Yourssu", "React", "React Query", "Recoil"],
    githubUrl: "https://github.com/yourssu/i-got-it-frontend",
  },
];
