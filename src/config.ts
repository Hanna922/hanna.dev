import type { Site, SocialObjects } from "./types";

export const SITE: Site = {
  website: "https://hanna-dev.com/", // replace domain
  author: "Hanna",
  desc: "Hanna's personal blog & website.",
  title: "Hanna.Dev",
  ogImage: "https://hanna-dev.com/og-image.png",
  lightAndDarkMode: true,
  postPerPage: 3,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
};

export const LOCALE = {
  lang: "ko",
  langTag: ["ko-KR"],
} as const;

export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};

export const SOCIALS: SocialObjects = [
  {
    name: "Github",
    href: "https://github.com/Hanna922",
    linkTitle: `${SITE.title} on Github`,
    active: true,
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/hanna._.yng/",
    linkTitle: `${SITE.title} on Instagram`,
    active: true,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/%EB%82%98%EC%98%81-%EA%B9%80-89b421236/",
    linkTitle: `${SITE.title} on LinkedIn`,
    active: true,
  },
  {
    name: "Mail",
    href: "mailto:p.ping0922@gmail.com",
    linkTitle: `Send an email to ${SITE.title}`,
    active: false,
  },
];
