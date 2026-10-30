import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { execSync } from "node:child_process";
import http from "node:http";
import chalk from "chalk";
import { createServer } from "vite";
//@ts-expect-error no typedefs
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import {
	normalizeWebsocketUrl,
	warnOnUrlEscape,
	runRspack,
	black,
	printBanner,
} from "./devlib.ts";


// The published dist bundles are required to boot the demo. Fetch them when a
// checkout has none (they are gitignored build artifacts).
const REQUIRED_DISTS = [
	"packages/core/dist/scramjet.js",
	"packages/core/dist/scramjet.wasm",
	"packages/controller/dist/controller.api.js",
	"packages/utils/dist/scramjet-utils.mjs",
];
if (REQUIRED_DISTS.some((file) => !existsSync(file))) {
	stdout.write(chalk.dim("fetching prebuilt scramjet bundles...\n"));
	execSync("node scripts/fetch-prebuilt-dist.mjs", { stdio: "inherit" });
}

const image = await fs.readFile("./assets/scramjet-mini-noalpha.png");

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

warnOnUrlEscape(server);

await server.listen();

const accent = (text: string) => chalk.hex("#f1855bff").bold(text);
const highlight = (text: string) => chalk.hex("#fdd76cff").bold(text);
const urlColor = (text: string) => chalk.hex("#64DFDF").underline(text);
const note = (text: string) => chalk.hex("#CDB4DB")(text);
const connector = chalk.hex("#8D99AE").dim("@");

const lines = [
	black()(`${highlight("SCRAMJET DEV SERVER")}`),
	black()(
		`${accent("demo")} ${connector} ${urlColor(
			`http://localhost:${DEMO_PORT}/`,
		)}`,
	),
	black()(
		`${accent("wisp")} ${connector} ${urlColor(
			process.env.VITE_WISP_URL ??
				`same origin (http://localhost:${DEMO_PORT}${WISP_PROXY_PATH})`,
		)}`,
	),
	black()(chalk.dim(`[${branch}] ${commit} scramjet/${version}`)),
];

// Building scramjet from source requires the rust rewriter
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
