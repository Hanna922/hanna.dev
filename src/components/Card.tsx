import { useRef, useState } from "react";
import { DetailDialog } from "./Dialog";

interface Props {
  project: {
    title: string;
    image: string;
    desc: string;
    tags: string[];
    githubUrl: string;
    bgColor?: string;
  };
}

export const Card = ({ project }: Props) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [openDetailDialog, setOpenDetailDialog] = useState(false);

  const handleOpenDetailDialog = () => {
    setOpenDetailDialog(true);
  };

  return (
    <div ref={sectionRef} className={`py-2 sm:basis-1/2 sm:px-8 sm:py-4`}>
      <div className={`project-card min-w-72 sm:w-96`}>
        <div className="overflow-hidden">
          <img
            className={`project-image ${project.bgColor} sm-2 relative aspect-[16/9] hover:cursor-pointer hover:opacity-80`}
            src={project.image}
            alt={project.title}
            onClick={handleOpenDetailDialog}
          />
        </div>
        <div className="overflow-hidden">
          <div className="project-text flex items-center justify-between">
            <h3 className="text-marrsgreen dark:text-carrigreen my-2 text-lg font-medium">
              {project.title}
            </h3>
            <div className="my-2 mr-[0.1rem] flex items-center space-x-5 sm:my-0 sm:space-x-3">
              <a
                href={project.githubUrl}
                title={`See '${project.title}' on Github`}
                target="_blank"
                rel="noreferrer"
                className="focus-visible:outline-marrsgreen dark:focus-visible:outline-carrigreen mr-1 rounded-full"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  className="dark:bg-carddark scale-150 opacity-75 hover:-rotate-12 hover:bg-gray-300 sm:scale-125 dark:hover:bg-gray-600"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12.026 2c-5.509 0-9.974 4.465-9.974 9.974 0 4.406 2.857 8.145 6.821 9.465.499.09.679-.217.679-.481 0-.237-.008-.865-.011-1.696-2.775.602-3.361-1.338-3.361-1.338-.452-1.152-1.107-1.459-1.107-1.459-.905-.619.069-.605.069-.605 1.002.07 1.527 1.028 1.527 1.028.89 1.524 2.336 1.084 2.902.829.091-.645.351-1.085.635-1.334-2.214-.251-4.542-1.107-4.542-4.93 0-1.087.389-1.979 1.024-2.675-.101-.253-.446-1.268.099-2.64 0 0 .837-.269 2.742 1.021a9.582 9.582 0 0 1 2.496-.336 9.554 9.554 0 0 1 2.496.336c1.906-1.291 2.742-1.021 2.742-1.021.545 1.372.203 2.387.099 2.64.64.696 1.024 1.587 1.024 2.675 0 3.833-2.33 4.675-4.552 4.922.355.308.675.916.675 1.846 0 1.334-.012 2.41-.012 2.737 0 .267.178.577.687.479C19.146 20.115 22 16.379 22 11.974 22 6.465 17.535 2 12.026 2z"
                  ></path>
                </svg>
              </a>
              <a
                title={`See live demo of '${project.title}'`}
                target="_blank"
                rel="noreferrer"
                className="focus-visible:outline-marrsgreen dark:focus-visible:outline-carrigreen mr-8 rounded-full hover:cursor-pointer"
                onClick={handleOpenDetailDialog}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="bg-cardlight dark:bg-carddark h-7 w-7 scale-125 rounded-full p-1 hover:-rotate-12 hover:bg-gray-300 sm:scale-100 dark:hover:bg-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </a>
              <DetailDialog
                title={project.title}
                open={openDetailDialog}
                onOpenChange={setOpenDetailDialog}
              />
            </div>
          </div>
        </div>
        <div className="overflow-hidden">
          <p className="project-desc">{project.desc}</p>
        </div>
        <ul
          aria-label={`Tech Stack used in ${project.title}`}
          className={`md:mt-2 md:mb-6 mb-4 mt-2 flex flex-wrap overflow-hidden text-sm`}
        >
          {project.tags.map(tag => (
            <li
              key={tag}
              className="project-tags my-1 mr-2 rounded bg-[color:rgba(var(--color-card),1)] px-2 py-1 dark:bg-[color:rgba(var(--color-card),1)]"
            >
              {tag}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
