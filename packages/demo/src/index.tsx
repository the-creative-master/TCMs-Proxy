import App from "./App";
import LibcurlClient from "@mercuryworkshop/libcurl-transport";
import EpoxyClient from "@mercuryworkshop/epoxy-transport";
import { defaultConfigDev } from "@mercuryworkshop/scramjet";
import { Controller } from "@mercuryworkshop/scramjet-controller";
import { HttpCachePlugin } from "@mercuryworkshop/scramjet-utils";
import { demoSettingsStore, getRuntimeWispUrl } from "./store";

let app = document.getElementById("app")!;

type ProxyController = InstanceType<typeof Controller>;
let controller: ProxyController;
let resolveControllerReady!: (value: ProxyController) => void;
let rejectControllerReady!: (reason?: unknown) => void;

/** Resolves when the proxy controller is usable, without blocking the app shell. */
export const controllerReady = new Promise<ProxyController>((resolve, reject) => {
	resolveControllerReady = resolve;
	rejectControllerReady = reject;
});
void controllerReady.catch(() => {});

const cachePlugin = new HttpCachePlugin();

export function getTransport(): LibcurlClient | EpoxyClient {
	const wispUrl = getRuntimeWispUrl(demoSettingsStore.wispUrl);
	switch (demoSettingsStore.transport) {
		case "epoxy":
			return new EpoxyClient({ wisp: wispUrl });
		case "libcurl":
		default:
			return new LibcurlClient({ wisp: wispUrl });
	}
}

async function waitForControllerOrReady(timeoutMs = 10000): Promise<void> {
	if (navigator.serviceWorker.controller) return;

	const ready = navigator.serviceWorker.ready.then(() => {});
	const controllerChanged = new Promise<void>((resolve) => {
		const onChange = () => {
			navigator.serviceWorker.removeEventListener("controllerchange", onChange);
			resolve();
		};
		navigator.serviceWorker.addEventListener("controllerchange", onChange, {
			once: true,
		} as any);
	});
	const timeout = new Promise<void>((resolve) =>
		setTimeout(resolve, timeoutMs)
	);

	// Wait for whichever happens first; on timeout we continue to avoid blocking the UI.
	await Promise.race([ready, controllerChanged, timeout]);
}

async function waitForControllerInitialization(
	proxyController: ProxyController,
	timeoutMs = 20000
): Promise<void> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			proxyController.wait(),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error("Proxy controller initialization timed out.")),
					timeoutMs
				);
			}),
		]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
}

async function init() {
	try {
		const registration = await navigator.serviceWorker.register("./sw.js");
		await waitForControllerOrReady();

		const readySw = navigator.serviceWorker.controller ?? registration.active;
		if (!readySw) {
			throw new Error("No service worker is available for the proxy.");
		}

		controller = new Controller({
			serviceworker: readySw,
			transport: getTransport(),
			scramjetConfig: defaultConfigDev,
		});
		await waitForControllerInitialization(controller);
		console.log("TCMs Proxy controller initialized", controller);
		resolveControllerReady(controller);
	} catch (error) {
		console.error("TCMs Proxy could not initialize the proxy controller:", error);
		rejectControllerReady(error);
	}
}

function mount() {
	try {
		const root = <App />;
		app.replaceWith(root);
		app = root as HTMLElement;
	} catch (error) {
		const errorScreen = document.createElement("main");
		errorScreen.setAttribute("role", "alert");
		errorScreen.style.cssText =
			"min-height:100vh;display:grid;place-content:center;padding:2rem;background:#0d1217;color:#e8edf1;font:500 16px system-ui,sans-serif;text-align:center";
		errorScreen.textContent =
			"TCMs Proxy could not start. Refresh the page to try again.";
		app.replaceWith(errorScreen);
		console.error("TCMs Proxy failed to render:", error);
	}
}

// Render the branded interface immediately. Proxy startup happens in the
// background, so a slow or unavailable service worker never leaves a blank page.
mount();
void init();

export { controller, cachePlugin };
