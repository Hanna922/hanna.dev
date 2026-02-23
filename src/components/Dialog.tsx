import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import { DetailDialogContent } from "../const";
import { useBlogLocale } from "hooks/useBlogLocale";

interface DetailDialogProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DetailDialog = ({
  title,
  open,
  onOpenChange,
}: DetailDialogProps) => {
  const content = DetailDialogContent.find(item => item.title === title);
  const { locale, translate } = useBlogLocale();

  return (
    <Dialog.Root modal={true} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay fixed inset-0 bg-black opacity-30" />
        <Dialog.Content
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#d6d6d6 #f3f4f6",
            overflowWrap: "break-word",
          }}
          className="DialogContent fixed left-1/2 top-1/2 z-50 flex h-4/5 w-5/6 -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl bg-white p-4 outline-none sm:h-5/6 sm:w-1/2 sm:rounded-2xl sm:p-10"
        >
          {content?.images?.length && content.images.length > 0 ? (
            <div className="flex w-full flex-col gap-3">
              {content.images.length === 1 ? (
                <img
                  src={content.images[0]}
                  alt={title}
                  className="rounded-md object-contain"
                />
              ) : (
                <div className="flex w-full flex-col gap-3">
                  {content.images.map((src, idx) => (
                    <img
                      key={`${src}-${idx}`}
                      src={src}
                      alt={`${title}-${idx + 1}`}
                      className="w-full rounded-md object-contain"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <Dialog.Title className="DialogTitle mt-2 font-mono text-sm font-semibold text-black sm:mt-5 sm:text-2xl">
            {title}
          </Dialog.Title>
          <Dialog.Description className="DialogDescription sm:text-md mt-2 text-sm text-black">
            {locale === "en" && content?.overviewEn
              ? content.overviewEn
              : content?.overview}
          </Dialog.Description>

          <div className="sm:text-md mt-2 flex justify-between text-sm text-black">
            <span className="font-semibold">
              {translate("dialog.duration")}
            </span>
            <span>{content?.date}</span>
          </div>
          <div className="sm:text-md mt-2 flex justify-between text-sm text-black">
            <span className="font-semibold">{translate("dialog.team")}</span>
            <span>
              {locale === "en" && content?.teamEn
                ? content.teamEn
                : content?.team}
            </span>
          </div>
          <div className="mt-3 border-t-2" />
          <span className="sm:text-md my-2 font-mono text-sm font-semibold text-black">
            {translate("dialog.role")}
          </span>
          <span className="sm:text-md ml-4 whitespace-pre-wrap text-sm leading-6 text-black">
            {locale === "en" && content?.roleEn
              ? content.roleEn
              : content?.role}
          </span>
          <div className="mt-3 border-t-2" />
          <span className="sm:text-md my-2 font-mono text-sm font-semibold text-black">
            {translate("dialog.experience")}
          </span>
          <span className="sm:text-md ml-4 whitespace-pre-wrap text-sm text-black">
            {locale === "en" && content?.experienceEn
              ? content.experienceEn
              : content?.experience}
          </span>
          <div className="mt-3 border-t-2" />
          <span className="sm:text-md my-2 font-mono text-sm font-semibold text-black">
            {translate("dialog.technology")}
          </span>
          <span className="sm:text-md ml-4 whitespace-pre-wrap text-sm text-black">
            {content?.tech}
          </span>
          {(content?.performance || content?.performanceEn) && (
            <>
              <div className="mt-3 border-t-2" />
              <span className="sm:text-md my-2 font-mono text-sm font-semibold text-black">
                {translate("dialog.result")}
              </span>
              <span className="sm:text-md ml-4 whitespace-pre-wrap text-sm text-black">
                {locale === "en" && content?.performanceEn
                  ? content.performanceEn
                  : content?.performance}
              </span>
            </>
          )}
          <div className="mt-3 border-t-2" />
          <span className="sm:text-md my-2 font-mono text-sm font-semibold text-black">
            {translate("dialog.links")}
          </span>
          <span className="sm:text-md ml-4 text-sm leading-6 text-black">
            {content?.link.map(link => (
              <React.Fragment key={link.url}>
                <span className="font-semibold">{`- ${link.title}: `}</span>
                <a
                  href={link.url}
                  className="border-violet-600 hover:border-b-2 hover:text-violet-800"
                >
                  {link.url}
                </a>
                <br className="gap-10" />
              </React.Fragment>
            ))}
          </span>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
