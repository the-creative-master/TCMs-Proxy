#!/usr/bin/env node
/**
 * Makes `pnpm dev` work on a checkout that has no built dist/ folders.
 *
 * Scramjet is compiled from source by the dev server, but that build needs the
 * rust rewriter (in packages/core/rewriter/wasm/out). Without it the emitted
 * bundle is unusable, so we instead drop in the published
 * @mercuryworkshop dist builds whose versions match each package's package.json.
 *
 * The downloaded bundles are also made compatible with browsers that don't
 * support RegExp pattern modifiers yet by spelling `(?i:url)` as
 * `[uU][rR][lL]`, which matches exactly the same thing.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const targets = [
	{ pkg: "@mercuryworkshop/scramjet", dir: "packages/core", marker: "scramjet.js" },
	{ pkg: "@mercuryworkshop/scramjet-controller", dir: "packages/controller", marker: "controller.api.js" },
	{ pkg: "@mercuryworkshop/scramjet-utils", dir: "packages/utils", marker: "scramjet-utils.mjs" },
];

const force = process.argv.includes("--force");

function isFresh({ dir, marker }) {
	const file = join(dir, "dist", marker);
	if (!existsSync(file)) return false;
	const wasm = join(dir, "dist", "scramjet.wasm");
	if (marker === "scramjet.js" && !existsSync(wasm)) return false;
	// anything older than 5 minutes is fine to keep; this only guards re-runs
	return statSync(file).size > 1024;
}

function normalizeRegexModifiers(root) {
	let patched = 0;
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "types") continue;
				walk(full);
				continue;
			}
			if (!/\.(m?js)$/.test(entry.name)) continue;
			const source = readFileSync(full, "utf8");
			if (!source.includes("(?i:url)")) continue;
			writeFileSync(full, source.replaceAll("(?i:url)", "[uU][rR][lL]"));
			patched += source.split("(?i:url)").length - 1;
		}
	};
	walk(root);
	return patched;
}

let installed = 0;

for (const target of targets) {
	if (!force && isFresh(target)) continue;

	const pkgJson = JSON.parse(readFileSync(join(target.dir, "package.json"), "utf8"));
	const spec = `${target.pkg}@${pkgJson.version}`;
	const tmp = mkdtempSync(join(tmpdir(), "scramjet-dist-"));

	try {
		execFileSync("npm", ["pack", spec, "--pack-destination", tmp, "--silent"], {
			stdio: "pipe",
		});
		const tarball = readdirSync(tmp).find((name) => name.endsWith(".tgz"));
		if (!tarball) throw new Error(`npm pack produced no tarball for ${spec}`);
		execFileSync("tar", ["xzf", join(tmp, tarball), "-C", tmp]);

		const from = join(tmp, "package", "dist");
		if (!existsSync(from)) throw new Error(`${spec} has no dist/ folder`);

		rmSync(join(target.dir, "dist"), { recursive: true, force: true });
		cpSync(from, join(target.dir, "dist"), { recursive: true });
		const patched = normalizeRegexModifiers(join(target.dir, "dist"));
		installed++;
		console.log(
			`[dist] ${target.dir}/dist <- ${spec}${patched ? ` (made ${patched} regex(es) portable)` : ""}`
		);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

if (!installed) console.log("[dist] prebuilt bundles already present");
