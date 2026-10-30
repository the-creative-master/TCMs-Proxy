import { createReadStream, existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { execSync } from "node:child_process";
import http from "node:http";
import chalk from "chalk";
import { createServer, type Connect } from "vite";
//@ts-expect-error no typedefs
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import {
  normalizeWebsocketUrl,
  warnOnUrlEscape,
  runRspack,
  black,
  printBanner,
} from "./devlib.ts";

// The published dist bundles are required to boot the demo, and a bundle built
// without the rust rewriter parses fine but throws at runtime, which shows up
// as a blank page. Fetch/repair them before the dev server starts serving.
const REQUIRED_DISTS = [
  "packages/core/dist/scramjet.js",
  "packages/core/dist/scramjet.wasm",
  "packages/controller/dist/controller.api.js",
  "packages/utils/dist/scramjet-utils.mjs",
];

function engineBundlesAreBroken() {
  if (REQUIRED_DISTS.some((file) => !existsSync(file))) return "missing";
  const core = readFileSync("packages/core/dist/scramjet.js", "utf8");
  // marker only present when the rewriter glue was not resolved at build time
  if (core.includes("rewriter/wasm/out/wasm.js")) return "no-rewriter";
  if (core.length < 16 * 1024) return "suspiciously-small";
  return null;
}

const brokenReason = engineBundlesAreBroken();
if (brokenReason) {
  stdout.write(
    chalk.dim(
      `engine bundles ${brokenReason === "missing" ? "missing" : `broken (${brokenReason})`}, fetching published builds...\n`,
    ),
  );
  execSync("node scripts/fetch-prebuilt-dist.mjs --force", {
    stdio: "inherit",
  });
}

const image = await fs.readFile("./assets/tcm-mini-noalpha.png");

const commit = execSync("git rev-parse --short HEAD", {
  encoding: "utf-8",
}).replace(/\r?\n|\r/g, "");
const branch = execSync("git rev-parse --abbrev-ref HEAD", {
  encoding: "utf-8",
}).replace(/\r?\n|\r/g, "");
const packagejson = JSON.parse(await fs.readFile("./package.json", "utf-8"));
const version = packagejson.version;

const DEMO_PORT = process.env.DEMO_PORT || 4141;
const WISP_PORT = process.env.WISP_PORT || 4142;

// The wisp server is also exposed through the vite dev server on this path so
// that the browser can reach it on the same origin (needed when the dev server
// is opened through a tunnel / preview url instead of localhost).
const WISP_PROXY_PATH = "/wisp/";

const escapeForPage = (value: string) =>
  value.replace(
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
const DEFAULT_WISP_URL = "wss://wisp.webmc.fun/";

if (process.env.VITE_WISP_URL) {
  process.env.VITE_WISP_URL = normalizeWebsocketUrl(process.env.VITE_WISP_URL);
} else {
  // let the client derive ws(s)://<current host>/wisp/ at runtime
  delete process.env.VITE_WISP_URL;
}

const wispserver = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("wisp server js rewrite");
});
wisp.options.allow_private_ips = true;
wisp.options.allow_loopback_ips = true;

wispserver.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

wispserver.listen(Number(WISP_PORT));

const server = await createServer({
  configFile: "./packages/demo/vite.config.ts",
  root: "./packages/demo",
  server: {
    host: true,
    port: Number(DEMO_PORT),
    strictPort: true,
    allowedHosts: true,
    proxy: {
      [WISP_PROXY_PATH]: {
        target: `ws://127.0.0.1:${WISP_PORT}`,
        ws: true,
        rewrite: (path) => path.replace(/^\/wisp\/?/, "/"),
      },
    },
  },
});

/**
 * A proxied document always comes back through the service worker, so a request
 * for the engine prefix that reaches this server means the worker missed it.
 * Vite's SPA fallback would then answer with index.html and the demo would load
 * inside its own viewport — so answer with a real error instead of nesting.
 */
server.middlewares.stack.unshift({
  route: "",
  handle: (
    req: Connect.IncomingMessage,
    res: http.ServerResponse,
    next: Connect.NextFunction,
  ) => {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith("/~/sj/")) {
      next();
      return;
    }
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Proxied request missed the service worker</title>
     <meta name="tcm-proxy-miss" content="1">
     <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07080e;color:#e9ebf5;font:15px/1.6 system-ui,sans-serif">
       <div style="max-width:520px;padding:28px">
         <div style="font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#ff8f8f;margin-bottom:10px">Proxy miss</div>
         <h1 style="font-size:1.2rem;margin:0 0 10px">This request never reached the service worker</h1>
         <p style="color:#99a1b8;margin:0 0 14px">Proxied documents live under <code>${escapeForPage(url)}</code>. Seeing this page means the worker was not controlling the request yet — most of the time a reload is all it takes.</p>
         <button onclick="location.reload()" style="border:0;border-radius:10px;padding:9px 14px;font:inherit;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(135deg,#7c5cff,#4f8bff)">Reload</button>
       </div>
       <script>
         // a miss is usually the worker still claiming the frame: retry twice
         try {
           var key = "tcm-proxy-miss:${escapeForPage(url).replace(/[^a-zA-Z0-9._~-]/g, "")}";
           var tries = Number(sessionStorage.getItem(key) || 0);
           if (tries < 2) {
             sessionStorage.setItem(key, String(tries + 1));
             setTimeout(function () { location.reload(); }, 400);
           } else {
             sessionStorage.removeItem(key);
           }
         } catch (e) {}
       </script>
     </body>`,
    );
  },
});

warnOnUrlEscape(server);

await server.listen();

const accent = (text: string) => chalk.hex("#f1855bff").bold(text);
const highlight = (text: string) => chalk.hex("#fdd76cff").bold(text);
const urlColor = (text: string) => chalk.hex("#64DFDF").underline(text);
const note = (text: string) => chalk.hex("#CDB4DB")(text);
const connector = chalk.hex("#8D99AE").dim("@");

const lines = [
  black()(`${highlight("TCM'S PROXY DEV SERVER")}`),
  black()(
    `${accent("demo")} ${connector} ${urlColor(
      `http://localhost:${DEMO_PORT}/`,
    )}`,
  ),
  black()(
    `${accent("wisp")} ${connector} ${urlColor(
      process.env.VITE_WISP_URL ?? DEFAULT_WISP_URL,
    )}`,
  ),
  black()(
    chalk.dim(
      `        local relay also available: ws://localhost:${DEMO_PORT}${WISP_PROXY_PATH}`,
    ),
  ),
  black()(chalk.dim(`[${branch}] ${commit} engine/${version}`)),
];

// Building the engine from source requires the rust rewriter
// (pnpm rewriter:build -> packages/core/rewriter/wasm/out/wasm.js).
// When it isn't built, rebuilding would overwrite the prebuilt dist with a
// bundle that can't load the wasm rewriter (the browser then shows nothing),
// so keep the published dist in that case.
const REWRITER_GLUE = "./packages/core/rewriter/wasm/out/wasm.js";
const canRebuild = existsSync(REWRITER_GLUE);

if (canRebuild) {
  const { default: rspackConfig } = await import("./rspack.config.ts");
  runRspack(rspackConfig);
} else {
  stdout.write(
    chalk.yellow(
      `${chalk.bold("!")} rewriter not built (run \`pnpm rewriter:build\`) - ` +
        "using prebuilt packages/*/dist instead of rebuilding.\n",
    ),
  );
}

printBanner(image, lines);
