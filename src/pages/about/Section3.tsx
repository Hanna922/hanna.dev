import { Card } from "@components/Card";
import { useIntersectionObserver } from "hooks/useIntersectionObserver";
import { useRef } from "react";

export const Section3 = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const scrollMajorRef = useRef<HTMLDivElement | null>(null);
  const scrollMinorRef = useRef<HTMLDivElement | null>(null);

  useIntersectionObserver(sectionRef, { threshold: 0.1 });

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
    <div ref={sectionRef} className="ml-10 sm:mb-8 sm:ml-36 sm:mr-36 sm:mt-28">
      <div className="mb-12 animate-fade-in items-center">
        <h1 className="timeline-block text-center text-4xl font-semibold opacity-0">
          Project
        </h1>
      </div>

      <h2 className="timeline-block mb-4 text-2xl font-semibold opacity-0">
        😆 Major Projects
      </h2>

      <div
        className="major-carousel flex overflow-x-scroll"
        style={{ scrollbarWidth: "none" }}
        ref={scrollMajorRef}
      >
        <button
          className="hidden sm:absolute sm:z-10 sm:-ml-16 sm:mt-28 sm:flex sm:h-10 sm:w-10 sm:bg-transparent"
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
          className="hidden sm:absolute sm:right-20 sm:z-10 sm:mt-28 sm:flex sm:h-10 sm:w-10 sm:bg-transparent"
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
        <div className="timeline-block flex flex-row gap-10 sm:gap-0 sm:opacity-0">
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
      </div>

      <h2 className="timeline-block mb-4 mt-8 text-2xl font-semibold opacity-0">
        🙂 Minor Projects
      </h2>
      <div
        className="minor-carousel overflow-x-scroll sm:flex"
        style={{ scrollbarWidth: "none" }}
        ref={scrollMinorRef}
      >
        <button
          className="hidden sm:absolute sm:z-10 sm:-ml-16 sm:mt-28 sm:flex sm:h-10 sm:w-10 sm:bg-transparent"
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
          className="hidden sm:absolute sm:right-20 sm:z-10 sm:mt-28 sm:flex sm:h-10 sm:w-10 sm:bg-transparent"
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
        <div className="timeline-block flex flex-row gap-10 sm:gap-0 sm:opacity-0">
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
