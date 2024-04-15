import { Card } from "@components/Card";

export const Section2 = () => {
  return (
    <div className="mt-28 sm:mt-0">
      <h1 className="mb-4 mt-8 text-center text-3xl font-bold sm:mb-6 sm:mt-12 sm:text-4xl">
        Projects
      </h1>
      <h2 className="mb-4 text-center text-lg font-semibold sm:mb-6">
        comming soon 👩🏻‍💻
      </h2>
      {/* <div className="lg:grid-cols-3 grid grid-cols-1 gap-6 pl-10 pr-10 sm:grid-cols-2">
        {Project.map((project, index) => (
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
      </div> */}
    </div>
  );
};

const Project = [
  {
    title: "YDS (Yourssu Design System)",
    desc: "이거슨 테스트여 데스크릾ㅕㄴ",
    image: "/projects/yds.png",
    tags: ["yourssu", "design system", "react"],
    githubUrl: "https://github.com/yourssu/YDS-React",
  },
  {
    title: "YLS (Yourssu Logging System)",
    desc: "test2",
    image: "/projects/yds.png",
    tags: ["yourssu", "logging system", "react"],
    githubUrl: "",
  },
  {
    title: "All:Chive",
    desc: "test2",
    image: "/projects/allChive.png",
    tags: ["react native"],
    githubUrl: "",
  },
];
