import { Card } from "@components/Card";
import { MajorProject, MinorProject } from "const";
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
          {MajorProject.map(project => (
            <Card
              key={project.title}
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
          {MinorProject.map(project => (
            <Card
              key={project.title}
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
