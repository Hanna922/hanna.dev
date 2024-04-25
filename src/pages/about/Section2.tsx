import { TimelineBlock } from "@components/TimelineBlock";
import { useIntersectionObserver } from "hooks/useIntersectionObserver";
import { useRef } from "react";

export const Section2 = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useIntersectionObserver(sectionRef, { threshold: 0.5 });

  return (
    <section
      ref={sectionRef}
      className="mt-32 flex min-h-[630px] max-w-5xl animate-fade-in flex-col sm:pb-24"
    >
      <div className="timeline-block items-center overflow-hidden opacity-0">
        <h1 className="text-center text-4xl font-semibold">Experience</h1>
      </div>
      <div className="mb-8 mt-20 items-start justify-start">
        {Experiences.map(block => (
          <div
            key={block.title + block.desc}
            className="timeline-block opacity-0"
          >
            <TimelineBlock
              title={block.title}
              desc={block.desc}
              link={block.link}
              startDate={block.startDate}
              endDate={block.endDate}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

const Experiences = [
  {
    title: "TechLabs",
    desc: "Front-end Engineer (Intern)",
    link: "https://www.techlabs.co.kr/",
    startDate: "2024.03",
    endDate: "Current",
  },
  {
    title: "Yourssu",
    desc: "Front-end Engineer",
    link: "https://yourssu.com",
    startDate: "2023.03",
    endDate: "Current",
  },
  {
    title: "Google Developer Student Club",
    desc: "Web/Mobile Part",
    link: "https://gdsc.community.dev/soongsil-university-seoul-south-korea/",
    startDate: "2023.10",
    endDate: "2024.08",
  },
  {
    title: "Central MakeUs Challenge",
    desc: "Front-end Engineer",
    link: "https://cmc.makeus.in/",
    startDate: "2023.06",
    endDate: "2023.09",
  },
  {
    title: "Yourssu",
    desc: "Android Engineer",
    link: "https://yourssu.com",
    startDate: "2021.04",
    endDate: "2023.02",
  },
];
