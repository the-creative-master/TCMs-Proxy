import LoadInterstitial from "./components/LoadInterstitial";
import App from "./App";
import LibcurlClient from "@mercuryworkshop/libcurl-transport";
import EpoxyClient from "@mercuryworkshop/epoxy-transport";
import { defaultConfigDev } from "@mercuryworkshop/scramjet";
import { Controller } from "@mercuryworkshop/scramjet-controller";
import { HttpCachePlugin } from "@mercuryworkshop/scramjet-utils";
import { demoSettingsStore } from "./store";

let app = document.getElementById("app")!;

let controller: InstanceType<typeof Controller>;
const cachePlugin = new HttpCachePlugin();

export function getTransport(): LibcurlClient | EpoxyClient {
  const wispUrl = demoSettingsStore.wispUrl;
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
    setTimeout(resolve, timeoutMs),
  );

  // Wait for whichever happens first; on timeout we continue to avoid blocking the UI.
  await Promise.race([ready, controllerChanged, timeout]);
}

function escapeHtml(value: string) {
  return value.replace(
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

async function init() {
  const interstitial: any = (
    <LoadInterstitial status={"Loading"}></LoadInterstitial>
  );
  document.body.append(interstitial);
  interstitial.showModal();

  try {
    if (!navigator.serviceWorker) {
      throw new Error(
        "Service workers are unavailable in this context. If you are viewing this inside an embedded preview, open it in a new browser tab.",
      );
    }
    if (!window.isSecureContext) {
      throw new Error(
        "Service workers need a secure context (https or localhost). Open the demo over https or on localhost.",
      );
    }
    const registration = await navigator.serviceWorker.register("./sw.js");

    // Non-blocking progress updates on state transitions.
    const updateStatus = (sw: ServiceWorker | null) => {
      if (!sw) return;
      const set = (msg: string) => (interstitial.$.state.status = msg);
      const apply = () => {
        switch (sw.state) {
          case "installing":
            set("Installing service worker...");
            break;
          case "installed":
            set("Service worker installed, waiting to activate...");
            break;
          case "activating":
            set("Activating service worker...");
            break;
          case "activated":
            set("Service worker activated");
            break;
          case "redundant":
            set("Service worker became redundant");
            break;
        }
      };
      apply();
      sw.addEventListener("statechange", apply);
    };

    updateStatus(registration.installing ?? registration.waiting ?? null);

    // Wait for control or readiness with a timeout; don't hang the UI on updates.
    interstitial.$.state.status =
      "Waiting for service worker to take control...";
    await waitForControllerOrReady(10000);
    interstitial.$.state.status =
      "Service worker ready, waiting for controller init";
    const readySw = navigator.serviceWorker.controller ?? registration.active;
    if (!readySw) {
      throw new Error("No service worker available for controller");
    }
    controller = new Controller({
      serviceworker: readySw,
      transport: getTransport(),
      scramjetConfig: defaultConfigDev,
    });
    await controller.wait();
    console.log(controller);
    interstitial.$.state.status = "Controller initialized";
    interstitial.close();
  } catch (e) {
    console.error("Error during service worker registration:", e);
    // Always close the modal on error to prevent hanging UI.
    try {
      interstitial.close();
    } catch {}
    app.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#07080e;color:#e9ebf5;box-sizing:border-box">
				<div style="max-width:560px">
					<div style="font-size:0.7rem;letter-spacing:0.16em;text-transform:uppercase;color:#ff8f8f;margin-bottom:10px">Startup error</div>
					<h1 style="font-size:1.35rem;margin:0 0 10px;letter-spacing:-0.02em">Could not start the proxy</h1>
					<p style="color:#99a1b8;line-height:1.6;font-size:0.88rem;margin:0 0 8px">${escapeHtml(
            e instanceof Error ? e.message : String(e),
          )}</p>
					<p style="color:#7d859b;line-height:1.6;font-size:0.8rem;margin:0 0 14px">Service worker registration or the controller handshake failed. Scramjet routes every request through a service worker, so it cannot run without one. Check the console for details, then reload. If this page is embedded in a preview frame, open it in a new tab.</p>
					<button onclick="location.reload()" style="border:0;border-radius:10px;padding:9px 14px;font:inherit;font-size:0.82rem;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(135deg,#7c5cff,#4f8bff)">Reload</button>
				</div>
			</div>`;
  }
}

async function mount() {
  try {
    const root = <App />;
    app.replaceWith(root);
  } catch (e) {
    let err = e as any;
    app.replaceWith(
      document.createTextNode(
        `Error mounting: ${"message" in err ? err.message : err}`,
      ),
    );
    console.error(err);
    throw e;
  }
}

init().then(() => mount());
export { controller, cachePlugin };
