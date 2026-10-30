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
  shortcut("chatgpt", "ChatGPT", "https://chatgpt.com"),
  shortcut("reddit", "Reddit", "https://www.reddit.com"),
  shortcut("eaglercraft", "Eaglercraft", "https://eaglercraft.com"),
];

const SHORTCUTS_REVISION = 3;

export const shortcutsStore = createStore(
  {
    items: DEFAULT_SHORTCUTS.map((item) => ({ ...item })) as Shortcut[],
    revision: SHORTCUTS_REVISION,
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

function readStoredRecord(ident: string): Record<string, unknown> | null {
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(`dls-${ident}`)
        : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Add any recommended shortcut a returning visitor is missing — once per
 * revision. Anyone who deliberately removed YouTube keeps it removed, because
 * the migration never runs twice against the same stored revision.
 */
function migrateShortcuts() {
  const stored = readStoredRecord("tcm-shortcuts");
  const seenRevision = stored?.revision === SHORTCUTS_REVISION;
  if (!seenRevision) {
    const items: Shortcut[] = Array.isArray(shortcutsStore.items)
      ? [...shortcutsStore.items]
      : [];
    const bare = (host: string) => host.replace(/^www\./, "");
    const known = new Set(
      items.map((item) => bare(shortcutHost(item.url))).filter(Boolean),
    );
    const additions = DEFAULT_SHORTCUTS.filter((item) => {
      const host = bare(shortcutHost(item.url));
      return host ? !known.has(host) : false;
    });
    if (additions.length) {
      shortcutsStore.items = [
        ...items,
        ...additions.map((item) => ({ ...item })),
      ];
    }
  }
  shortcutsStore.revision = SHORTCUTS_REVISION;
}

migrateShortcuts();

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

/** the hostname we hang a shortcut's favicon off, or "" if it isn't parseable */
export function shortcutHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Where to try pulling a real site icon from. Both are plain <img> sources, so
 * the browser fetches them directly — no proxying involved. The tile falls back
 * to a monogram when every entry in this list fails.
 */
export function shortcutIconCandidates(url: string): string[] {
  const host = shortcutHost(url);
  if (!host) return [];
  return [
    `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
    `https://${host}/favicon.ico`,
  ];
}

/** shared app mark, served from public/ */
export const LOGO_URL = "./logo.svg";

/* -------------------------------------------------------------------------- */
/*                                  settings                                  */
/* -------------------------------------------------------------------------- */

/**
 * The public Wisp we ship as the default. Requests leave from here, not from
 * your browser. webmc.fun is used instead of mercurywork.shop because the
 * latter rate-limits to 100 kB per IP, which dies on the first real page.
 */
export const PUBLIC_WISP_URL = "wss://wisp.webmc.fun/";

/**
 * Defaults we used to ship. A stored value matching one of these is a leftover
 * default, not a choice, so it is safe to move to the current one.
 */
const RETIRED_DEFAULT_WISP_URLS: ReadonlyArray<string> = [
  "wss://wisp.mercurywork.shop/",
  "ws://wisp.mercurywork.shop/",
];

export type WispPreset = {
  id: string;
  label: string;
  url: string;
  /** short "why you'd pick this" tag shown in the picker */
  note: string;
  /** shown on the row — limits the operator documents */
  detail: string;
};

/**
 * Public Wisp servers, gathered from the places that document them (the
 * wisp-protocol repo, libcurl.js, Terbium, Anura, FreeWisp's own status page)
 * plus community lists. They are run by different people with different limits,
 * so none of them is guaranteed — that is exactly why the picker exists, and
 * why the popover can test one before you commit to it.
 */
export const WISP_PRESETS: ReadonlyArray<WispPreset> = [
  {
    id: "webmc",
    label: "WebMC",
    url: "wss://wisp.webmc.fun/",
    note: "Default",
    detail: "No documented per-IP byte cap",
  },
  {
    id: "freewisp",
    label: "FreeWisp",
    url: "wss://wisp.freewisp.org/",
    note: "50 GB/day",
    detail: "TCP only, ports 22/80/443/8080/8443",
  },
  {
    id: "terbium",
    label: "Terbium",
    url: "wss://wisp.terbiumon.top/wisp/",
    note: "Terbium OS",
    detail: "The endpoint Terbium OS ships as its default",
  },
  {
    id: "anura",
    label: "Anura",
    url: "wss://anura.pro/",
    note: "AnuraOS",
    detail: "Runs alongside the Anura proxy",
  },
  {
    id: "mercury",
    label: "Mercury Workshop",
    url: "wss://wisp.mercurywork.shop/",
    note: "100 kB/IP",
    detail: "Demo server — throttles hard, mostly for trying things out",
  },
];

/** the relay bundled with the dev server, when this page is being served by it */
export function localWispUrl(): string {
  if (typeof location === "undefined") return "";
  const secure = location.protocol === "https:";
  return `${secure ? "wss:" : "ws:"}//${location.host}/wisp/`;
}

export type WispProbeResult = {
  ok: boolean;
  /** milliseconds until the socket opened, or until it failed */
  ms: number;
  message: string;
};

/**
 * Check a server from *this* browser, which is the only place the answer
 * matters: a network can allow websockets to one host and block another. A
 * bare websocket opening is enough of a signal to pick a relay — if the socket
 * opens, the server is reachable and speaking wisp's transport.
 */
export function probeWispUrl(
  url: string,
  timeoutMs = 7000,
): Promise<WispProbeResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let finished = false;
    let socket: WebSocket | null = null;

    const finish = (ok: boolean, message: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {}
      resolve({ ok, ms: Date.now() - started, message });
    };

    const timer = setTimeout(
      () => finish(false, "Timed out — the socket never opened."),
      timeoutMs,
    );

    try {
      socket = new WebSocket(url);
    } catch {
      finish(false, "That is not a valid WebSocket URL.");
      return;
    }

    socket.onopen = () => finish(true, "Socket opened — this server answers.");
    socket.onerror = () =>
      finish(false, "Could not open a socket to that server.");
    socket.onclose = () => finish(false, "The server closed the connection.");
  });
}

function runtimeDefaultWispUrl() {
  const fromEnv = import.meta.env.VITE_WISP_URL as string | undefined;
  if (fromEnv) return fromEnv;
  return PUBLIC_WISP_URL;
}

const DEFAULT_WISP_URL = runtimeDefaultWispUrl();
const DEFAULT_TRANSPORT: AvailableTransports = "libcurl";
const WISP_DEFAULT_REVISION = 3;

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
 * Older builds defaulted to a same-origin relay (ws://<this host>/wisp/) and
 * later to a different public server. Migrate anyone still sitting on one of
 * those over to the current default, but never touch a server the user actually
 * typed in.
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
    const retiredDefault =
      RETIRED_DEFAULT_WISP_URLS.includes(current) ||
      /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(current) ||
      (!!sameOriginRelay && current === sameOriginRelay);
    if (!current || retiredDefault) {
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
