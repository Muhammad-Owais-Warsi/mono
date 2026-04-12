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
    return storedTheme === "dark" ? "dark" : "light";
  });
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    return localStorage.getItem("mono-has-opened") !== "true";
  });
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const saveTimeoutRef = useRef<number | null>(null);
  const closeConfirmedRef = useRef(false);
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

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("notes-theme", theme);
  }, [theme]);

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

        if (loaded.length === 0) {
          const seed = createNote({
            title: "Welcome",
            content: "Start typing your first note here.",
          });
          setNotes([seed]);
          setActiveId(seed.id);
          await writeTextFile(
            `${NOTES_DIR}/${seed.id}.json`,
            JSON.stringify(seed),
            {
              baseDir: BaseDirectory.AppData,
            },
          );
        } else {
          loaded.sort((a, b) => b.updatedAt - a.updatedAt);
          setNotes(loaded);
          setActiveId(loaded[0]?.id ?? "");
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
      const isCmdK =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCmdK) {
        event.preventDefault();
        setIsPaletteOpen(true);
      }

      const isCtrlN =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n";
      if (isCtrlN) {
        event.preventDefault();
        createNew();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  const updateTitle = (title: string) => {
    const current = activeNote ?? ensureActiveNote();
    if (!current) return;
    const updated = {
      ...current,
      title,
      updatedAt: Date.now(),
    };
    setNotes((prev) =>
      prev.map((note) => (note.id === updated.id ? updated : note)),
    );
    markDirty(updated.id);
    scheduleSave(updated);
  };

  const updateContent = (content: string) => {
    const current = activeNote ?? ensureActiveNote();
    if (!current) return;
    const updated = {
      ...current,
      content,
      updatedAt: Date.now(),
    };
    setNotes((prev) =>
      prev.map((note) => (note.id === updated.id ? updated : note)),
    );
    markDirty(updated.id);
    scheduleSave(updated);
  };

  const createNew = () => {
    const newNote = createNote();
    setNotes((prev) => [newNote, ...prev]);
    setActiveId(newNote.id);
    markDirty(newNote.id);
    scheduleSave(newNote);
  };

  const deleteNote = async (noteId?: string) => {
    const targetId = noteId ?? activeNote?.id;
    if (!targetId) return;

    const remaining = notes.filter((note) => note.id !== targetId);

    if (remaining.length === 0) {
      const seed = createNote();
      setNotes([seed]);
      setActiveId(seed.id);
      markDirty(seed.id);
      scheduleSave(seed);
    } else {
      setNotes(remaining);
      setActiveId(remaining[0]?.id ?? "");
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

  return (
    <div className="h-screen w-screen pt-10 box-border font-sans bg-background text-foreground">
      <TitleBar isDark={isDark} />
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <input
              className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/70"
              placeholder="Title"
              value={activeNote?.title ?? ""}
              onChange={(e) => updateTitle(e.currentTarget.value)}
            />
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
          className="flex-1 resize-none bg-transparent px-6 py-5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
          placeholder="Start typing..."
          value={activeNote?.content ?? ""}
          onChange={(e) => updateContent(e.currentTarget.value)}
        />

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
            onClick={() => setIsPaletteOpen(false)}
          />
          <div className="absolute left-1/2 top-20 w-[560px] -translate-x-1/2">
            <div
              className={`overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${panelClass}`}
            >
              <Command
                className="w-full"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setIsPaletteOpen(false);
                  }
                }}
              >
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

                <Command.List className="max-h-80 overflow-y-auto p-2">
                  <Command.Empty className="px-3 py-2 text-sm text-muted-foreground">
                    No results.
                  </Command.Empty>

                  <Command.Group className="text-xs font-medium text-muted-foreground px-3 py-2">
                    <Command.Item
                      value="New note"
                      onSelect={() => {
                        createNew();
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
                        value={`${note.title} ${note.content}`}
                        onSelect={() => selectNote(note.id)}
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

      {showWelcome ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/80 backdrop-blur-2xl">
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

            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              Welcome to{" "}
              <span className="bg-gradient-to-r from-indigo-500 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                mono
              </span>
            </h1>
            <p className="mt-4 text-balance text-sm leading-relaxed text-zinc-500">
              Your minimal, fast note space. Designed for focus.
              <br />
              <span className="mt-3 block font-mono text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Press{" "}
                <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-zinc-600 shadow-sm">
                  ⌘
                </kbd>{" "}
                +{" "}
                <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-zinc-600 shadow-sm">
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
