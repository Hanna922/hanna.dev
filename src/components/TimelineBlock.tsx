interface TimelineBlockProps {
  title: string;
  desc: string;
  link: string;
  startDate: string;
  endDate: string;
}

export const TimelineBlock = ({
  title,
  desc,
  link,
  startDate,
  endDate,
}: TimelineBlockProps) => {
  return (
    <div className="relative">
      <div className="flex items-center">
        <p className="absolute pl-2">🍀</p>
        <p className="absolute pl-8 text-sm sm:pl-14 dark:text-gray-400">
          {startDate} ~ {endDate}
        </p>
        <div className="ml-4 rounded-sm border-l-2 border-gray-200 pb-5 pl-40 pt-5 sm:pl-60">
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-marrsgreen dark:text-carrigreen font-medium"
          >
            {title} 🔗
          </a>
          <p className="text-sm dark:text-gray-400">{desc}</p>
        </div>
      </div>
    </div>
  );
};
