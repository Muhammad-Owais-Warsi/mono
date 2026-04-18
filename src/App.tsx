import { useEffect, useMemo, useRef, useState } from "react";
import {
  BaseDirectory,
  mkdir,
  exists,
  readDir,
  readTextFile,
  writeTextFile,
  remove,
} from "@tauri-apps/plugin-fs";

import "./App.css";
import { Button } from "./button";

const NOTES_DIR = "notes";

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
};

const createNote = (overrides?: Partial<Note>): Note => ({
  id: crypto.randomUUID(),
  title: "",
  content: "",
  updatedAt: Date.now(),
  ...overrides,
});

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [splitId, setSplitId] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const storedTheme = localStorage.getItem("notes-theme");
    return storedTheme === "light" ? "light" : "dark";
  });

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    noteId: string;
  } | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const saveTimeoutRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rightTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeId),
    [notes, activeId],
  );
  const splitNote = useMemo(
    () => notes.find((n) => n.id === splitId),
    [notes, splitId],
  );

  const wordCount = useMemo(() => {
    const target = activePane === "left" ? activeNote : splitNote;
    const text = target?.content?.trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }, [activeNote, splitNote, activePane]);

  // --- Core Actions ---

  const scheduleSave = (note: Note) => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(async () => {
      await writeTextFile(
        `${NOTES_DIR}/${note.id}.json`,
        JSON.stringify(note),
        { baseDir: BaseDirectory.AppData },
      );
      setDirtyIds((prev) => {
        const next = new Set(prev);
        next.delete(note.id);
        return next;
      });
    }, 500);
  };

  const updateNoteData = (id: string, updates: Partial<Note>) => {
    const now = Date.now();
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: now } : n)),
    );
    setDirtyIds((prev) => new Set(prev).add(id));
    const target = notes.find((n) => n.id === id);
    if (target) scheduleSave({ ...target, ...updates, updatedAt: now });
  };

  const handleNewNote = () => {
    const n = createNote();
    setNotes((prev) => [n, ...prev]);
    activePane === "right" && splitId ? setSplitId(n.id) : setActiveId(n.id);
    scheduleSave(n);
  };

  const deleteNote = async (id: string) => {
    const remaining = notes.filter((n) => n.id !== id);
    if (id === splitId) setSplitId(null);
    if (id === activeId) setActiveId(remaining[0]?.id ?? "");
    setNotes(remaining);
    try {
      await remove(`${NOTES_DIR}/${id}.json`, {
        baseDir: BaseDirectory.AppData,
      });
    } catch (e) {
      console.error(e);
    }
    setContextMenu(null);
  };

  const handleSidebarSelect = (id: string) => {
    activePane === "right" && splitId ? setSplitId(id) : setActiveId(id);
  };

  // --- Effects ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewNote();
      }
      if (isMod && splitId) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setActivePane("left");
          textareaRef.current?.focus();
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setActivePane("right");
          rightTextareaRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [splitId, activePane, notes]);

  useEffect(() => {
    const loadNotes = async () => {
      try {
        const dirExists = await exists(NOTES_DIR, {
          baseDir: BaseDirectory.AppData,
        });
        if (!dirExists)
          await mkdir(NOTES_DIR, {
            baseDir: BaseDirectory.AppData,
            recursive: true,
          });
        const entries = await readDir(NOTES_DIR, {
          baseDir: BaseDirectory.AppData,
        });
        const loaded: Note[] = [];
        for (const entry of entries) {
          if (!entry.name?.endsWith(".json")) continue;
          const raw = await readTextFile(`${NOTES_DIR}/${entry.name}`, {
            baseDir: BaseDirectory.AppData,
          });
          loaded.push(JSON.parse(raw));
        }
        if (loaded.length === 0) {
          const seed = createNote({
            title: "Welcome",
            content: "Start typing...",
          });
          setNotes([seed]);
          setActiveId(seed.id);
          await writeTextFile(
            `${NOTES_DIR}/${seed.id}.json`,
            JSON.stringify(seed),
            { baseDir: BaseDirectory.AppData },
          );
        } else {
          const sorted = loaded.sort((a, b) => b.updatedAt - a.updatedAt);
          setNotes(sorted);
          setActiveId(sorted[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadNotes();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    theme === "dark"
      ? root.classList.add("dark")
      : root.classList.remove("dark");
    localStorage.setItem("notes-theme", theme);
  }, [theme]);

  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      {isSidebarOpen && (
        <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar flex flex-col h-full">
          <div className="p-4 flex items-center justify-between border-b border-border/50">
            <h2 className="text-xs font-bold tracking-widest opacity-50">
              MONO
            </h2>
            <Button variant="ghost" size="sm" onClick={handleNewNote}>
              +
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {notes.map((note) => (
              <button
                key={note.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    noteId: note.id,
                  });
                }}
                onClick={() => handleSidebarSelect(note.id)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm truncate ${
                  activeId === note.id || splitId === note.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-accent/40 opacity-70 hover:opacity-100"
                }`}
              >
                {note.title || "Untitled"}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Editor Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-12 border-b border-border flex items-center px-4 justify-between bg-background/50 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <MenuIcon />
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={splitId ? "text-orange-500" : ""}
              onClick={() =>
                setSplitId(
                  splitId
                    ? null
                    : (notes.find((n) => n.id !== activeId)?.id ?? activeId),
                )
              }
            >
              <SplitIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-red-400"
              onClick={() =>
                deleteNote(
                  activePane === "left" ? activeId : splitId || activeId,
                )
              }
            >
              <TrashIcon />
            </Button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane */}
          <div
            className={`flex flex-col min-w-0 relative ${splitId ? "w-1/2 border-r border-border" : "w-full"}`}
          >
            <div className="flex items-center px-10 pt-10 gap-3">
              <input
                className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:opacity-20"
                placeholder="Title"
                value={activeNote?.title ?? ""}
                onChange={(e) =>
                  updateNoteData(activeId, { title: e.target.value })
                }
                onFocus={() => setActivePane("left")}
              />
              {activePane === "left" && splitId && (
                <div className="h-2 w-2 rounded-full bg-orange-500 " />
              )}
            </div>
            <textarea
              ref={textareaRef}
              className="no-scrollbar flex-1 px-10 py-6 bg-transparent outline-none resize-none leading-relaxed text-base opacity-80"
              placeholder="Start writing..."
              value={activeNote?.content ?? ""}
              onChange={(e) =>
                updateNoteData(activeId, { content: e.target.value })
              }
              onFocus={() => setActivePane("left")}
            />
          </div>

          {/* Right Pane */}
          {splitId && (
            <div className="w-1/2 flex flex-col min-w-0 bg-accent/5 relative">
              <div className="flex items-center px-10 pt-10 gap-3">
                <input
                  className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:opacity-20"
                  placeholder="Title"
                  value={splitNote?.title ?? ""}
                  onChange={(e) =>
                    updateNoteData(splitId, { title: e.target.value })
                  }
                  onFocus={() => setActivePane("right")}
                />
                {activePane === "right" && (
                  <div className="h-2 w-2 rounded-full bg-orange-500 " />
                )}
              </div>
              <textarea
                ref={rightTextareaRef}
                className="no-scrollbar flex-1 px-10 py-6 bg-transparent outline-none resize-none leading-relaxed text-base opacity-80"
                placeholder="Split note..."
                value={splitNote?.content ?? ""}
                onChange={(e) =>
                  updateNoteData(splitId, { content: e.target.value })
                }
                onFocus={() => setActivePane("right")}
              />
            </div>
          )}
        </div>

        {/* Footer Redesigned */}
        <footer className="absolute bottom-6 right-8 flex items-center gap-4 bg-background/80  pointer-events-auto">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <div
              className={`h-1.5 w-1.5 rounded-full ${dirtyIds.size > 0 ? "bg-orange-500 " : "bg-emerald-500"}`}
            />
            <span>{dirtyIds.size > 0 ? "Saved" : "Saved"}</span>
          </div>
          <div className="h-3 w-[1px] bg-border/60" />
          <span className="text-[11px] text-muted-foreground">
            {wordCount} words
          </span>
          <div className="h-3 w-[1px] bg-border/60" />
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-muted-foreground "
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </footer>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-3 py-2 text-xs text-red-400  flex items-center gap-2"
            onClick={() => deleteNote(contextMenu.noteId)}
          >
            <TrashIcon size={14} />
            Delete Note
          </button>
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

const MenuIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);

const SplitIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 3v18" />
  </svg>
);

const TrashIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const SunIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="M4.93 4.93l1.41 1.41" />
    <path d="M17.66 17.66l1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="M6.34 17.66l-1.41 1.41" />
    <path d="M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export default App;
