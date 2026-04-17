// import { getCurrentWindow } from "@tauri-apps/api/window";
// import { Button } from "./button";

// const appWindow = getCurrentWindow();

// function minimize() {
//   appWindow.minimize();
// }

// function maximize() {
//   appWindow.toggleMaximize();
// }

// function close() {
//   appWindow.close();
// }

// function Minus() {
//   return (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="16"
//       height="16"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       className="lucide lucide-minus-icon lucide-minus"
//     >
//       <path d="M5 12h14" />
//     </svg>
//   );
// }

// function Maximize() {
//   return (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="16"
//       height="16"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       className="lucide lucide-maximize-icon lucide-maximize"
//     >
//       <path d="M8 3H5a2 2 0 0 0-2 2v3" />
//       <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
//       <path d="M3 16v3a2 2 0 0 0 2 2h3" />
//       <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
//     </svg>
//   );
// }

// function X() {
//   return (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="16"
//       height="16"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       className="lucide lucide-x-icon lucide-x"
//     >
//       <path d="M18 6 6 18" />
//       <path d="m6 6 12 12" />
//     </svg>
//   );
// }

// interface TitleBarProps {
//   isSidebarOpen: boolean;
//   onToggleSidebar?: () => void;
// }

// const MenuIcon = () => (
//   <svg
//     xmlns="http://www.w3.org/2000/svg"
//     width="16"
//     height="16"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <line x1="4" x2="20" y1="12" y2="12" />
//     <line x1="4" x2="20" y1="6" y2="6" />
//     <line x1="4" x2="20" y1="18" y2="18" />
//   </svg>
// );

// export default function TitleBar({ isSidebarOpen, onToggleSidebar }: TitleBarProps) {
//   return (
//     <div className={`fixed top-0 z-50 flex items-center h-10 bg-background text-foreground select-none transition-all duration-300 ${isSidebarOpen ? "left-64" : "left-0"}`}>
//       <div className="flex items-center pl-4">
//         <Button
//           variant="ghost"
//           size="icon-tab"
//           aria-label="Toggle sidebar"
//           onClick={(e) => {
//             e.stopPropagation();
//             onToggleSidebar?.();
//           }}
//         >
//           <MenuIcon />
//         </Button>
//       </div>
//       <div className="flex-1 h-full" data-tauri-drag-region />
//       <div className="flex items-center pr-4 gap-3">
//         <Button
//           variant="ghost"
//           size="icon-tab"
//           onClick={(e) => {
//             e.stopPropagation();
//             minimize();
//           }}
//         >
//           <Minus />
//         </Button>
//         <Button
//           variant="ghost"
//           size="icon-tab"
//           onClick={(e) => {
//             e.stopPropagation();
//             maximize();
//           }}
//         >
//           <Maximize />
//         </Button>
//         <Button
//           variant="destructive"
//           size="icon-tab"
//           onClick={(e) => {
//             e.stopPropagation();
//             close();
//           }}
//         >
//           <X />
//         </Button>
//       </div>
//     </div>
//   );
// }
