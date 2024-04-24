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
            Front-end Enginner
          </span>
        </div>
        <div className="md:mb-8 my-4 mt-2">
          <p>
            안녕하세요. 프론트엔드 개발자 김나영 입니다.
            <br />
            퍼포먼스 최적화에 관심이 많으며 효율적인 코드 작성을 지향합니다.
            <br />
            UX에 더불어 DX 향상을 주도하는 프론트엔드 플랫폼 엔지니어가 되기
            위해 노력하고 있습니다.
          </p>
        </div>
        <div className="flex flex-col flex-wrap">
          <span className="sm:text-sm">
            Bachelor Degree. Software Engineering, Soongsil University (2021 ~ )
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
