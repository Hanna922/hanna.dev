import ProfileImage from "assets/images/hanna-profile-image.png";
import ScrollImage from "assets/images/scroll-down.svg";

export const Section1 = () => {
  return (
    <section className="min-h-[630px] max-w-5xl animate-fade-in gap-10 px-4 sm:mt-8 sm:flex sm:items-center sm:justify-center sm:px-8 sm:pb-24">
      <div className="md:w-80 relative mx-auto flex h-80 w-72 transform animate-rock items-center">
        <div className="xs:scale-95 pointer-events-none absolute mx-auto">
          <img
            src={ProfileImage.src}
            id="hanna-profile-image"
            aria-label="Hanna Profile Image"
            alt="Hanna Profile Image"
          />
        </div>
      </div>

      <div className="lg:basis-2/3">
        <span className="text-marrsgreen lg:text-lg dark:text-carrigreen animate-fade-in font-medium">
          Hi my name is
        </span>
        <div className="overflow-hidden">
          <h1 className="fade-in text-animation md:text-5xl lg:text-7xl md:my-2 my-1 text-4xl font-semibold">
            Hanna (Nayoung)
          </h1>
        </div>
        <div className="overflow-hidden">
          <span className="text-animation md:text-3xl lg:text-5xl md:my-3 text-marrsgreen dark:text-carrigreen block text-2xl font-medium">
            Software Engineer
          </span>
        </div>
        <div className="md:mb-8 my-4 mt-2">
          <p>
            I'm a Software Engineer focused on Frontend and product delivery,
            with strong interest in practical AI solutions.
          </p>
        </div>
        <div className="flex flex-col flex-wrap">
          <span className="sm:text-sm">
            Bachelor Degree. Software Engineering, Soongsil University (2021.03
            ~ 2026.02)
          </span>
          <span className="sm:text-sm">Residence. Seoul, South Korea</span>
        </div>
      </div>
      <div className="absolute left-0 mt-10 flex w-full items-center justify-center sm:bottom-8">
        <div className="flex animate-bounce flex-col items-center">
          <span className="text-marrsgreen font-medium">Scroll</span>
          <img
            className="infinite h-8 w-8"
            src={ScrollImage.src}
            alt="Scroll Down"
          />
        </div>
      </div>
    </section>
  );
};
