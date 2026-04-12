import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "./button";

const appWindow = getCurrentWindow();

function minimize() {
  appWindow.minimize();
}

function maximize() {
  appWindow.toggleMaximize();
}

function close() {
  appWindow.close();
}

function startDrag() {
  appWindow.startDragging();
}

function enableDragging(element: HTMLElement) {
  element.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      // Left mouse button only
      startDrag();
    }
  });
}

function Minus() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-minus-icon lucide-minus"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function Maximize() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-maximize-icon lucide-maximize"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function X() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-x-icon lucide-x"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function Square() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-square-icon lucide-square"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}

export default function TitleBar({ isDark }: { isDark: boolean }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center w-full h-10 bg-background text-foreground select-none">
      <div className="flex-1 h-full" data-tauri-drag-region />
      <div className="flex items-center pr-4 gap-3">
        <Button
          variant="ghost"
          size="icon-tab"
          onClick={(e) => {
            e.stopPropagation();
            minimize();
          }}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-tab"
          onClick={(e) => {
            e.stopPropagation();
            maximize();
          }}
        >
          <Maximize />
        </Button>
        <Button
          variant="destructive"
          size="icon-tab"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
