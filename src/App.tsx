import { useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import TitleBar from "./titlebar";

const NOTES_DIR = "notes";
const UI_STATE_KEY = "mono-ui-state";

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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const storedTheme = localStorage.getItem("notes-theme");
    return storedTheme === "light" ? "light" : "dark";
  });
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    return localStorage.getItem("mono-has-opened") !== "true";
  });
  const [splitId, setSplitId] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [isSplitPickMode, setIsSplitPickMode] = useState(false);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const saveTimeoutRef = useRef<number | null>(null);
  const closeConfirmedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rightTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const paletteOpenRef = useRef(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const appWindow = getCurrentWindow();

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeId) ?? notes[0],
    [notes, activeId],
  );

  const wordCount = useMemo(() => {
    const text = activeNote?.content?.trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }, [activeNote?.content]);

  const isDirty = activeNote ? dirtyIds.has(activeNote.id) : false;
  const hasUnsaved = dirtyIds.size > 0;

  const ensureNotesDir = async () => {
    const dirExists = await exists(NOTES_DIR, {
      baseDir: BaseDirectory.AppData,
    });
    if (!dirExists) {
      await mkdir(NOTES_DIR, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      });
    }
  };

  const updateScrollHint = () => {
    const el = textareaRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    setShowScrollHint(maxScroll > 4 && el.scrollTop < maxScroll - 4);
  };

  useEffect(() => {
    const id = window.requestAnimationFrame(updateScrollHint);
    return () => window.cancelAnimationFrame(id);
  }, [activeNote?.content, activeNote?.id]);

  useEffect(() => {
    const onResize = () => updateScrollHint();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeNote?.id]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("notes-theme", theme);
  }, [theme]);

  // Persistent UI State Sync
  useEffect(() => {
    const state = {
      activeId,
      splitId,
      activePane,
    };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  }, [activeId, splitId, activePane]);

  useEffect(() => {
    let isMounted = true;

    const loadNotes = async () => {
      try {
        await ensureNotesDir();
        const entries = await readDir(NOTES_DIR, {
          baseDir: BaseDirectory.AppData,
        });
        const loaded: Note[] = [];

        for (const entry of entries) {
          if (!entry.name?.endsWith(".json")) continue;

          try {
            const raw = await readTextFile(`${NOTES_DIR}/${entry.name}`, {
              baseDir: BaseDirectory.AppData,
            });
            const parsed = JSON.parse(raw) as Note;
            if (parsed?.id) loaded.push(parsed);
          } catch (error) {
            console.error("Failed to read note", entry.name, error);
          }
        }

        if (!isMounted) return;

        // Hydrate UI State from LocalStorage
        let storedState: {
          activeId?: string;
          splitId?: string | null;
          activePane?: "left" | "right";
        } = {};
        try {
          const raw = localStorage.getItem(UI_STATE_KEY);
          if (raw) storedState = JSON.parse(raw);
        } catch {
          storedState = {};
        }

        if (loaded.length === 0) {
          const seed = createNote({
            title: "Welcome",
            content: "Start typing your first note here.",
          });
          setNotes([seed]);
          setActiveId(seed.id);
          setSplitId(null);
          setActivePane("left");
          await writeTextFile(
            `${NOTES_DIR}/${seed.id}.json`,
            JSON.stringify(seed),
            { baseDir: BaseDirectory.AppData },
          );
        } else {
          loaded.sort((a, b) => b.updatedAt - a.updatedAt);
          const ids = new Set(loaded.map((n) => n.id));

          // Ensure stored IDs actually exist in the loaded files
          const nextActive =
            storedState.activeId && ids.has(storedState.activeId)
              ? storedState.activeId
              : loaded[0].id;

          const nextSplit =
            storedState.splitId && ids.has(storedState.splitId)
              ? storedState.splitId
              : null;

          const nextPane = storedState.activePane ?? "left";

          setNotes(loaded);
          setActiveId(nextActive);
          setSplitId(nextSplit);
          setActivePane(nextPane);
        }
      } catch (error) {
        console.error("Failed to load notes", error);
      }
    };

    loadNotes();

    return () => {
      isMounted = false;
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (paletteOpenRef.current) return;

      const isMod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isMod && key === "k") {
        event.preventDefault();
        setIsPaletteOpen(true);
        return;
      }

      if (isMod && event.shiftKey && key === "n") {
        event.preventDefault();
        createSplitNote();
        return;
      }

      if (isMod && key === "n") {
        event.preventDefault();
        createNew();
        return;
      }

      if (isMod && splitId) {
        if (event.key === "ArrowLeft" || event.key === "Left") {
          event.preventDefault();
          setActivePane("left");
          textareaRef.current?.focus();
        } else if (event.key === "ArrowRight" || event.key === "Right") {
          event.preventDefault();
          setActivePane("right");
          rightTextareaRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [splitId]);

  useEffect(() => {
    paletteOpenRef.current = isPaletteOpen;
  }, [isPaletteOpen]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    appWindow
      .onCloseRequested((event) => {
        if (closeConfirmedRef.current) return;
        if (!hasUnsaved) return;

        event.preventDefault();
        const confirmed = window.confirm(
          "You have unsaved changes. Close anyway?",
        );
        if (confirmed) {
          closeConfirmedRef.current = true;
          void appWindow.close();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [appWindow, hasUnsaved]);

  const markDirty = (id: string) => {
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const markSaved = (id: string) => {
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const scheduleSave = (note: Note) => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        await ensureNotesDir();
        await writeTextFile(
          `${NOTES_DIR}/${note.id}.json`,
          JSON.stringify(note),
          {
            baseDir: BaseDirectory.AppData,
          },
        );
        markSaved(note.id);
      } catch (error) {
        console.error("Failed to save note", error);
      }
    }, 500);
  };

  const ensureActiveNote = () => {
    if (activeNote) return activeNote;
    const seed = createNote();
    setNotes([seed]);
    setActiveId(seed.id);
    markDirty(seed.id);
    scheduleSave(seed);
    return seed;
  };

  const updateNoteTitle = (noteId: string, title: string) => {
    const updatedAt = Date.now();
    setNotes((prev) =>
      prev.map((note) =>
        note.id === noteId ? { ...note, title, updatedAt } : note,
      ),
    );
    markDirty(noteId);
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      scheduleSave({ ...note, title, updatedAt });
    }
  };

  const updateNoteContent = (noteId: string, content: string) => {
    const updatedAt = Date.now();
    setNotes((prev) =>
      prev.map((note) =>
        note.id === noteId ? { ...note, content, updatedAt } : note,
      ),
    );
    markDirty(noteId);
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      scheduleSave({ ...note, content, updatedAt });
    }
  };

  const updateTitle = (title: string) => {
    const current = activeNote ?? ensureActiveNote();
    if (!current) return;
    updateNoteTitle(current.id, title);
  };

  const updateContent = (content: string) => {
    const current = activeNote ?? ensureActiveNote();
    if (!current) return;
    updateNoteContent(current.id, content);
  };

  function createNew() {
    const newNote = createNote();
    setNotes((prev) => [newNote, ...prev]);
    setActiveId(newNote.id);
    setActivePane("left");
    markDirty(newNote.id);
    scheduleSave(newNote);
  }

  function createSplitNote() {
    const newNote = createNote();
    setNotes((prev) => [newNote, ...prev]);
    setSplitId(newNote.id);
    setActivePane("right");
    markDirty(newNote.id);
    scheduleSave(newNote);
  }

  const deleteNote = async (noteId?: string) => {
    const targetId = noteId ?? activeNote?.id;
    if (!targetId) return;

    if (splitId === targetId) {
      setSplitId(null);
      setActivePane("left");
    }

    const remaining = notes.filter((note) => note.id !== targetId);

    if (remaining.length === 0) {
      const seed = createNote();
      setNotes([seed]);
      setActiveId(seed.id);
      markDirty(seed.id);
      scheduleSave(seed);
    } else {
      setNotes(remaining);
      if (activeId === targetId) {
        setActiveId(remaining[0]?.id ?? "");
      }
    }

    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });

    try {
      await remove(`${NOTES_DIR}/${targetId}.json`, {
        baseDir: BaseDirectory.AppData,
      });
    } catch (error) {
      console.error("Failed to delete note", error);
    }
  };

  const selectNote = (noteId: string) => {
    setActiveId(noteId);
    setIsPaletteOpen(false);
    setQuery("");
  };

  const isDark = theme === "dark";

  const panelClass =
    "bg-popover/70 border-border text-foreground shadow-2xl ring-1 ring-inset ring-border/30";

  const glassGradient =
    "bg-gradient-to-b from-white/40 to-transparent dark:from-white/10";

  const overlayClass = "bg-black/20 backdrop-blur-sm dark:bg-black/40";
  const itemClass =
    "cursor-pointer rounded-md px-3 py-2 text-sm hover:bg-accent/60 data-[selected=true]:bg-accent/70 data-[selected=true]:backdrop-blur-sm";

  const dismissWelcome = () => {
    localStorage.setItem("mono-has-opened", "true");
    setShowWelcome(false);
  };

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background text-foreground backdrop-blur-2xl">
        <TitleBar />
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <div className="relative mb-10 h-24 w-24">
            <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-tr from-indigo-500 via-blue-400 to-emerald-400 opacity-40 blur-2xl" />

            <div className="relative flex h-full w-full items-center justify-center ">
              <img
                src="./logo.png"
                alt="mono logo"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-indigo-500 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
              mono
            </span>
          </h1>
          <p className="mt-4 text-balance text-sm leading-relaxed text-muted-foreground">
            Your minimal, fast note space. Designed for focus.
            <br />
            <span className="mt-3 block font-mono text-[11px] font-medium uppercase tracking-wider opacity-60">
              Press{" "}
              <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5">
                Ctrl
              </kbd>
              <span className="mx-1">+</span>
              <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5">
                K
              </kbd>{" "}
              to explore
            </span>
          </p>

          <div className="mt-12 w-full px-10">
            <Button
              variant="default"
              size="lg"
              onClick={dismissWelcome}
              className="w-full rounded-full bg-gradient-to-tr from-indigo-500 via-blue-400 to-emerald-400 py-6 text-base font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-100"
            >
              Get started
            </Button>
          </div>
        </div>

        <div className="fixed bottom-4 right-4 z-50">
          <ThemeToggle isDark={isDark} setTheme={setTheme} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen pt-10 box-border font-sans bg-background text-foreground">
      <TitleBar />
      <div className="flex h-full flex-col">
        {splitId ? (
          <div className="flex h-full">
            <div className="flex w-1/2 flex-col border-r border-border">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <input
                    className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40"
                    placeholder="Title"
                    value={activeNote?.title ?? ""}
                    onChange={(e) => updateTitle(e.currentTarget.value)}
                    onFocus={() => setActivePane("left")}
                  />
                  <span
                    className={`h-2 w-2 rounded-full ${
                      activePane === "left"
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                  <Button
                    variant="ghost"
                    size="icon-tab"
                    aria-label="Close split"
                    onClick={() => {
                      setSplitId(null);
                      setActivePane("left");
                    }}
                  >
                    <SplitIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-tab"
                    aria-label="Delete note"
                    onClick={() => {
                      if (!activeNote) return;
                      void deleteNote(activeNote.id);
                    }}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </div>
              <textarea
                id="text"
                ref={textareaRef}
                className="no-scrollbar flex-1 resize-none bg-transparent px-6 py-5 text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
                placeholder="Start typing..."
                value={activeNote?.content ?? ""}
                onChange={(e) => updateContent(e.currentTarget.value)}
                onScroll={updateScrollHint}
                onFocus={() => setActivePane("left")}
              />
            </div>
            <div className="flex w-1/2 flex-col">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <input
                    className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40"
                    placeholder="Title"
                    value={notes.find((n) => n.id === splitId)?.title ?? ""}
                    onChange={(e) =>
                      splitId && updateNoteTitle(splitId, e.currentTarget.value)
                    }
                    onFocus={() => setActivePane("right")}
                  />
                  <span
                    className={`h-2 w-2 rounded-full ${
                      activePane === "right"
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                  <Button
                    variant="ghost"
                    size="icon-tab"
                    aria-label="Delete split note"
                    onClick={() => {
                      if (!splitId) return;
                      void deleteNote(splitId);
                    }}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </div>
              <textarea
                ref={rightTextareaRef}
                className="no-scrollbar flex-1 resize-none bg-transparent px-6 py-5 text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
                placeholder="Start typing..."
                value={notes.find((n) => n.id === splitId)?.content ?? ""}
                onChange={(e) =>
                  splitId && updateNoteContent(splitId, e.currentTarget.value)
                }
                onFocus={() => setActivePane("right")}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <input
                  className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40"
                  placeholder="Title"
                  value={activeNote?.title ?? ""}
                  onChange={(e) => updateTitle(e.currentTarget.value)}
                />
                <Button
                  variant="ghost"
                  size="icon-tab"
                  aria-label="Open split"
                  onClick={() => {
                    setIsSplitPickMode(true);
                    setIsPaletteOpen(true);
                  }}
                >
                  <SplitIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-tab"
                  aria-label="Delete note"
                  onClick={() => {
                    if (!activeNote) return;
                    void deleteNote(activeNote.id);
                  }}
                >
                  <TrashIcon />
                </Button>
              </div>
            </div>

            <textarea
              id="text"
              ref={textareaRef}
              className="no-scrollbar flex-1 resize-none bg-transparent px-6 py-5 text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
              placeholder="Start typing..."
              value={activeNote?.content ?? ""}
              onChange={(e) => updateContent(e.currentTarget.value)}
              onScroll={updateScrollHint}
            />
          </>
        )}

        {showScrollHint ? (
          <div className="pointer-events-none fixed bottom-14 left-1/2 -translate-x-1/2 text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        ) : null}
        <div className="pointer-events-none fixed bottom-4 left-4 text-[11px] text-muted-foreground">
          <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5">
            Ctrl
          </kbd>
          <span className="mx-1">+</span>
          <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5">
            K
          </kbd>
          <span className="mx-2">actions</span>
        </div>
      </div>

      {isPaletteOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className={`absolute inset-0 ${overlayClass} `}
            aria-label="Close command palette"
            onClick={() => {
              setIsPaletteOpen(false);
              setIsSplitPickMode(false);
            }}
          />
          <div className="absolute left-1/2 top-20 w-[560px] -translate-x-1/2">
            <div
              className={`overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${panelClass}`}
            >
              <Command className="w-full">
                <div
                  className={`border-b border-border ${glassGradient} px-4 py-3`}
                >
                  <Command.Input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                    placeholder="Search notes or type New..."
                    value={query}
                    onValueChange={setQuery}
                    autoFocus
                  />
                </div>

                <Command.List className="no-scrollbar max-h-80 overflow-y-auto p-2">
                  <Command.Empty className="px-3 py-2 text-sm text-muted-foreground">
                    No results.
                  </Command.Empty>

                  <Command.Group className="text-xs font-medium text-muted-foreground px-3 py-2">
                    <Command.Item
                      value="New note"
                      onSelect={() => {
                        if (isSplitPickMode) {
                          createSplitNote();
                        } else if (activePane === "right") {
                          createSplitNote();
                        } else {
                          createNew();
                        }
                        setIsSplitPickMode(false);
                        setIsPaletteOpen(false);
                        setQuery("");
                      }}
                      className={itemClass}
                    >
                      New note
                    </Command.Item>
                    {notes.map((note) => (
                      <Command.Item
                        key={note.id}
                        value={`${note.id} ${note.title} ${note.content}`}
                        onSelect={() => {
                          if (isSplitPickMode || activePane === "right") {
                            setSplitId(note.id);
                            setActivePane("right");
                          } else {
                            selectNote(note.id);
                            setActivePane("left");
                          }
                          setIsSplitPickMode(false);
                          setIsPaletteOpen(false);
                          setQuery("");
                        }}
                        className={itemClass}
                      >
                        <div className="flex flex-col">
                          <span className="truncate font-medium">
                            {note.title === "" ? "Untitled" : note.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(note.updatedAt).toLocaleString()}
                          </span>
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                </Command.List>
              </Command>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isDirty ? "bg-destructive" : "bg-emerald-500"
            }`}
          />
          {isDirty ? "Unsaved" : "Saved"}
        </span>
        <span className="h-3 w-px bg-border" />
        <span>{wordCount} words</span>
        <span className="h-3 w-px bg-border" />
        <ThemeToggle isDark={isDark} setTheme={setTheme} />
      </div>
    </div>
  );
}

interface ThemeToggleProps {
  isDark: boolean;
  setTheme: (theme: "light" | "dark") => void;
}

function ThemeToggle({ isDark, setTheme }: ThemeToggleProps) {
  return (
    <Button
      variant="ghost"
      size="icon-tab"
      aria-label="Toggle theme"
      className="rounded-full"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

const TrashIcon = () => (
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
  >
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 6l1 14h10l1-14" />
  </svg>
);

const SplitIcon = () => (
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
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 3v18" />
  </svg>
);

const SunIcon = () => (
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
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
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
  >
    <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
  </svg>
);

export default App;
