import { createStore } from "dreamland/core";

export type AvailableTransports = "libcurl" | "epoxy";

export const AVAILABLE_TRANSPORTS: ReadonlyArray<{
  value: AvailableTransports;
  label: string;
}> = [
  { value: "libcurl", label: "Libcurl" },
  { value: "epoxy", label: "Epoxy" },
];

/* -------------------------------------------------------------------------- */
/*                               search engines                               */
/* -------------------------------------------------------------------------- */

export type SearchEngineId = "google" | "bing" | "duckduckgo" | "brave";

export type SearchEngine = {
  id: SearchEngineId;
  label: string;
  glyph: string;
  color: string;
  searchUrl: string;
  hint: string;
};

export const SEARCH_ENGINES: ReadonlyArray<SearchEngine> = [
  {
    id: "google",
    label: "Google",
    glyph: "G",
    color: "#4285f4",
    searchUrl: "https://www.google.com/search?q=",
    hint: "The classic",
  },
  {
    id: "bing",
    label: "Bing",
    glyph: "b",
    color: "#00a4ef",
    searchUrl: "https://www.bing.com/search?q=",
    hint: "Microsoft",
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo",
    glyph: "D",
    color: "#de5833",
    searchUrl: "https://duckduckgo.com/?q=",
    hint: "Private",
  },
  {
    id: "brave",
    label: "Brave",
    glyph: "B",
    color: "#fb542b",
    searchUrl: "https://search.brave.com/search?q=",
    hint: "Independent",
  },
];

export const DEFAULT_SEARCH_ENGINE: SearchEngineId = "google";

export function getSearchEngine(id: string): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? SEARCH_ENGINES[0];
}

export function normalizeSearchEngine(value: string): SearchEngineId {
  const engine = SEARCH_ENGINES.find((candidate) => candidate.id === value);
  if (!engine) {
    throw new TypeError(`Unknown search engine: ${value}`);
  }
  return engine.id;
}

export function buildSearchUrl(engine: SearchEngineId, query: string) {
  return getSearchEngine(engine).searchUrl + encodeURIComponent(query.trim());
}

const SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/;
const DOMAIN_RE =
  /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$|^localhost(:\d+)?([/?#].*)?$/i;

/** Best-effort guess: is this omnibox input a URL rather than a search query? */
export function looksLikeUrl(input: string) {
  const value = input.trim();
  if (!value || /\s/.test(value)) return false;
  if (SCHEME_RE.test(value)) return true;
  if (IPV4_RE.test(value)) return true;
  // require a plausible tld so "3.14" or "hello" stay searches
  if (DOMAIN_RE.test(value) && /\.[a-z]{2,}/i.test(value)) return true;
  return false;
}

/**
 * Turn whatever the user typed into a URL we can hand to the proxy.
 * Text -> search on the currently selected engine, hosts -> https URL.
 */
export function resolveNavigationInput(
  input: string,
  engine: SearchEngineId,
): string | null {
  const value = input.trim();
  if (!value) return null;

  if (!looksLikeUrl(value)) {
    return buildSearchUrl(engine, value);
  }

  if (SCHEME_RE.test(value)) return value;
  return `https://${value}`;
}

/* -------------------------------------------------------------------------- */
/*                                 shortcuts                                  */
/* -------------------------------------------------------------------------- */

export type Shortcut = {
  id: string;
  name: string;
  url: string;
};

function shortcut(id: string, name: string, url: string): Shortcut {
  return { id, name, url };
}

export const DEFAULT_SHORTCUTS: ReadonlyArray<Shortcut> = [
  shortcut("youtube", "YouTube", "https://www.youtube.com"),
  shortcut("wikipedia", "Wikipedia", "https://www.wikipedia.org"),
  shortcut("reddit", "Reddit", "https://www.reddit.com"),
  shortcut("github", "GitHub", "https://github.com"),
  shortcut("discord", "Discord", "https://discord.com/app"),
  shortcut("chatgpt", "ChatGPT", "https://chatgpt.com"),
];

export const shortcutsStore = createStore(
  {
    items: DEFAULT_SHORTCUTS.map((item) => ({ ...item })) as Shortcut[],
  },
  {
    ident: "tcm-shortcuts",
    backing: "localstorage",
    autosave: "auto",
  },
);

// the store is restored from localStorage merge, so make sure `items` is sane
if (!Array.isArray(shortcutsStore.items)) {
  shortcutsStore.items = DEFAULT_SHORTCUTS.map((item) => ({ ...item }));
}

function newShortcutId() {
  return `sc-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function normalizeShortcutUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError("A URL is required.");
  }

  const withScheme = SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new TypeError("That doesn't look like a valid URL.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new TypeError("Shortcuts must use http or https.");
  }
  return parsed.toString();
}

export function shortcutNameFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const label = host.split(".")[0] ?? host;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "Shortcut";
  }
}

export function addShortcut(name: string, url: string): Shortcut {
  const item: Shortcut = {
    id: newShortcutId(),
    name: name.trim() || shortcutNameFromUrl(url),
    url,
  };
  shortcutsStore.items = [...shortcutsStore.items, item];
  return item;
}

export function updateShortcut(id: string, name: string, url: string) {
  shortcutsStore.items = shortcutsStore.items.map((item) =>
    item.id === id
      ? { ...item, name: name.trim() || shortcutNameFromUrl(url), url }
      : item,
  );
}

export function removeShortcut(id: string) {
  shortcutsStore.items = shortcutsStore.items.filter((item) => item.id !== id);
}

export function resetShortcuts() {
  shortcutsStore.items = DEFAULT_SHORTCUTS.map((item) => ({ ...item }));
}

/** deterministic pretty gradient for a shortcut tile */
export function shortcutTileColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  const hue = hash;
  return `linear-gradient(140deg, hsl(${hue} 68% 56%), hsl(${
    (hue + 42) % 360
  } 72% 42%))`;
}

export function monogram(name: string) {
  const trimmed = name.trim();
  return (trimmed ? trimmed[0] : "?").toUpperCase();
}

/* -------------------------------------------------------------------------- */
/*                                  settings                                  */
/* -------------------------------------------------------------------------- */

/** the public Wisp network — requests leave from here, not from your browser */
export const PUBLIC_WISP_URL = "wss://wisp.mercurywork.shop/";

function runtimeDefaultWispUrl() {
  const fromEnv = import.meta.env.VITE_WISP_URL as string | undefined;
  if (fromEnv) return fromEnv;
  return PUBLIC_WISP_URL;
}

const DEFAULT_WISP_URL = runtimeDefaultWispUrl();
const DEFAULT_TRANSPORT: AvailableTransports = "libcurl";
const WISP_DEFAULT_REVISION = 2;

export const demoSettingsStore = createStore(
  {
    transport: DEFAULT_TRANSPORT as AvailableTransports,
    wispUrl: DEFAULT_WISP_URL,
    searchEngine: DEFAULT_SEARCH_ENGINE as SearchEngineId,
    wispRevision: WISP_DEFAULT_REVISION,
  },
  {
    ident: "scramjet-demo-settings",
    backing: "localstorage",
    autosave: "auto",
  },
);

/**
 * Older builds defaulted to a same-origin relay (ws://<this host>/wisp/), which
 * only works when the page itself is the dev server. Migrate anyone still
 * sitting on that default over to the public Wisp, but never touch a server the
 * user actually typed in.
 */
(function migrateWispDefault() {
  if (import.meta.env.VITE_WISP_URL) return;

  // read what is actually persisted: the store merge fills in the new
  // revision for keys that were never saved, so the merged state can't tell
  // us whether this visitor has seen the new default yet.
  let stored: Record<string, unknown> | null = null;
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("dls-scramjet-demo-settings")
        : null;
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }

  const seenRevision = stored?.wispRevision === WISP_DEFAULT_REVISION;
  if (!seenRevision) {
    const current = String(demoSettingsStore.wispUrl ?? "");
    const sameOriginRelay =
      typeof location !== "undefined"
        ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/`
        : "";
    const oldRelayPattern =
      /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(current) ||
      (!!sameOriginRelay && current === sameOriginRelay);
    if (!current || oldRelayPattern) {
      demoSettingsStore.wispUrl = DEFAULT_WISP_URL;
    }
  }
  demoSettingsStore.wispRevision = WISP_DEFAULT_REVISION;
})();

export function normalizeWispUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError("Wisp URL is required.");
  }

  let normalized = trimmed;
  if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
    normalized = `ws://${normalized}`;
  }

  const parsed = new URL(normalized);
  if (!parsed.pathname || parsed.pathname === "") {
    parsed.pathname = "/";
  }
  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }

  return parsed.toString();
}

export function normalizeTransport(value: string): AvailableTransports {
  if (AVAILABLE_TRANSPORTS.some((t) => t.value === value)) {
    return value as AvailableTransports;
  }
  throw new TypeError(`Unknown transport: ${value}`);
}

export const demoSettingsDefaults = {
  wispUrl: normalizeWispUrl(DEFAULT_WISP_URL),
  transport: DEFAULT_TRANSPORT,
  searchEngine: DEFAULT_SEARCH_ENGINE,
};
