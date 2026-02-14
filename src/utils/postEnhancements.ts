type Cleanup = () => void;

function createProgressBar() {
  const existing = document.getElementById("myBar");
  if (existing) return;

  const progressContainer = document.createElement("div");
  progressContainer.className =
    "progress-container fixed top-0 z-10 h-1 w-full bg-skin-fill";

  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar h-1 w-0 bg-skin-accent";
  progressBar.id = "myBar";

  progressContainer.appendChild(progressBar);
  document.body.appendChild(progressContainer);
}

function updateScrollProgress() {
  const winScroll =
    document.body.scrollTop || document.documentElement.scrollTop;
  const height =
    document.documentElement.scrollHeight -
    document.documentElement.clientHeight;

  if (height <= 0) return;

  const scrolled = (winScroll / height) * 100;
  const myBar = document.getElementById("myBar");

  if (myBar) {
    myBar.style.width = `${scrolled}%`;
  }
}

function addHeadingLinks() {
  const headings = Array.from(document.querySelectorAll("h2, h3, h4, h5, h6"));

  for (const heading of headings) {
    if (heading.querySelector(".heading-link")) continue;

    heading.classList.add("group");

    const link = document.createElement("a");
    link.innerText = "#";
    link.className = "heading-link hidden group-hover:inline-block ml-2";
    link.href = `#${heading.id}`;
    link.ariaHidden = "true";

    heading.appendChild(link);
  }
}

async function copyCode(block: Element, button: HTMLButtonElement) {
  const code = block.querySelector("code");
  const text = code?.textContent ?? "";

  await navigator.clipboard.writeText(text);

  button.innerText = "Copied";
  setTimeout(() => {
    button.innerText = "Copy";
  }, 700);
}

function attachCopyButtons() {
  const codeBlocks = Array.from(document.querySelectorAll("pre"));
  const cleanupHandlers: Cleanup[] = [];

  for (const codeBlock of codeBlocks) {
    if (codeBlock.querySelector(".copy-code")) continue;

    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";

    const copyButton = document.createElement("button");
    copyButton.className =
      "copy-code absolute right-3 -top-3 rounded bg-skin-card px-2 py-1 text-xs leading-4 text-skin-base font-medium";
    copyButton.innerHTML = "Copy";

    codeBlock.setAttribute("tabindex", "0");
    codeBlock.appendChild(copyButton);

    codeBlock?.parentNode?.insertBefore(wrapper, codeBlock);
    wrapper.appendChild(codeBlock);

    const onClick = async () => {
      await copyCode(codeBlock, copyButton);
    };

    copyButton.addEventListener("click", onClick);

    cleanupHandlers.push(() => {
      copyButton.removeEventListener("click", onClick);
      copyButton.remove();
      wrapper.replaceWith(codeBlock);
    });
  }

  return () => {
    cleanupHandlers.forEach(fn => fn());
  };
}

function setupBackToTop() {
  const button = document.querySelector("#back-to-top");
  if (!button) return () => {};

  const onClick = () => {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  };

  button.addEventListener("click", onClick);

  return () => {
    button.removeEventListener("click", onClick);
  };
}

export function initPostEnhancements() {
  createProgressBar();
  addHeadingLinks();

  const detachCopyButtons = attachCopyButtons();
  const detachBackToTop = setupBackToTop();

  document.addEventListener("scroll", updateScrollProgress, { passive: true });
  updateScrollProgress();

  return () => {
    document.removeEventListener("scroll", updateScrollProgress);
    detachCopyButtons();
    detachBackToTop();
  };
}
