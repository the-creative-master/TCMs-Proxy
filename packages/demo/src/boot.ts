/**
 * Entry point. The proxy engine bundles are classic scripts that must be
 * evaluated before the app module graph imports from them, and they must be
 * fetched fresh: a stale copy left in a browser cache from an older, broken
 * build used to poison the page until a manual hard refresh.
 *
 * So we load both bundles with a cache-busting query, verify the globals they
 * are supposed to define, and only then import the app. Anything that goes
 * wrong ends up in a readable overlay instead of a blank screen.
 */

type EngineSpec = {
  src: string;
  globalName: string;
  label: string;
};

const ENGINES: EngineSpec[] = [
  {
    src: "/scramjet/scramjet.js",
    globalName: "$scramjet",
    label: "proxy engine (scramjet)",
  },
  {
    src: "/controller/controller.api.js",
    globalName: "$scramjetController",
    label: "controller api",
  },
];

const STAMP = Date.now().toString(36);

const bootErrors: string[] = [];
window.addEventListener(
  "error",
  (event) => {
    const message =
      event.message ||
      (event.error instanceof Error ? event.error.message : "") ||
      "script error";
    bootErrors.push(String(message));
  },
  true,
);

function escapeHtml(value: string) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

function supportsRegexpModifiers() {
  try {
    new RegExp("(?i:a)");
    return true;
  } catch {
    return false;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${src}?v=${STAMP}`;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`request for ${src} failed`));
    document.head.append(script);
  });
}

async function describeBundle(src: string) {
  try {
    const response = await fetch(`${src}?v=${STAMP}`, { cache: "no-store" });
    if (!response.ok) return `responded with HTTP ${response.status}`;
    const text = await response.text();
    if (text.includes("rewriter/wasm/out/wasm.js")) {
      return "the served bundle was built without the rust rewriter (missing rewriter/wasm/out/wasm.js)";
    }
    if (text.length < 1024) return "the served bundle is suspiciously small";
    return "the served bundle parsed but did not define its globals";
  } catch (error) {
    return error instanceof Error ? error.message : "could not be fetched";
  }
}

function renderFailure(details: Array<[string, string]>, hints: string[]) {
  const rows = details
    .map(
      ([label, value]) =>
        `<div style="margin:0 0 10px">` +
        `<div style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:#6f7891;margin-bottom:3px">${escapeHtml(
          label,
        )}</div>` +
        `<div style="font-size:0.82rem;color:#dfe3f2;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-word">${escapeHtml(
          value,
        )}</div></div>`,
    )
    .join("");

  const app = document.getElementById("app");
  if (!app) {
    document.body.textContent = `${details.map((d) => d.join(": ")).join(" — ")}`;
    return;
  }

  app.innerHTML =
    `<div style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#07080e;color:#e9ebf5;box-sizing:border-box">` +
    `<div style="max-width:640px">` +
    `<div style="font-size:0.7rem;letter-spacing:0.16em;text-transform:uppercase;color:#ff8f8f;margin-bottom:10px">Startup error</div>` +
    `<h1 style="font-size:1.35rem;margin:0 0 12px;letter-spacing:-0.02em">The proxy engine did not load</h1>` +
    rows +
    `<ul style="color:#99a1b8;line-height:1.65;font-size:0.82rem;margin:14px 0 16px;padding-left:18px">` +
    hints
      .map((hint) => `<li style="margin-bottom:6px">${escapeHtml(hint)}</li>`)
      .join("") +
    `</ul>` +
    `<button onclick="location.reload()" style="border:0;border-radius:10px;padding:9px 14px;font:inherit;font-size:0.82rem;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(135deg,#7c5cff,#4f8bff)">Reload</button>` +
    `</div></div>`;
}

async function boot() {
  for (const engine of ENGINES) {
    await loadScript(engine.src);
  }

  const missing = ENGINES.filter(
    (engine) =>
      !(engine.globalName in window) || !(window as any)[engine.globalName],
  );

  if (missing.length) {
    const details: Array<[string, string]> = [];
    for (const engine of missing) {
      details.push([engine.label, await describeBundle(engine.src)]);
    }
    details.push([
      "Browser errors",
      bootErrors.length
        ? bootErrors.slice(0, 3).join(" | ")
        : "(none reported)",
    ]);

    const hints = [
      "Restore the published bundles with `node scripts/fetch-prebuilt-dist.mjs --force`, then restart `pnpm dev`.",
    ];
    if (!supportsRegexpModifiers()) {
      hints.unshift(
        "This browser does not support RegExp pattern modifiers ((?i:...)), which the proxy engine needs. Update the browser, or use the portable bundles from the script above.",
      );
    }
    renderFailure(details, hints);
    return;
  }

  // Engine globals exist, so the module graph that re-exports them is safe.
  await import("./index.tsx");
}

void boot().catch((error) => {
  renderFailure(
    [
      [
        "Could not start the app",
        error instanceof Error ? error.message : String(error),
      ],
      [
        "Browser errors",
        bootErrors.length
          ? bootErrors.slice(0, 3).join(" | ")
          : "(none reported)",
      ],
    ],
    ["Check the browser console for details, then reload."],
  );
});

export {};
