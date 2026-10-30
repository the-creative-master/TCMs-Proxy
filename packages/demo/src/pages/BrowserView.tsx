import { css, type Component, createState } from "dreamland/core";
import {
  CatchEscapedLinksPlugin,
  UrlWatcherPlugin,
} from "@mercuryworkshop/scramjet-utils";
import { Tap, versionInfo } from "@mercuryworkshop/scramjet";
import { cachePlugin, controller } from "..";
import {
  SEARCH_ENGINES,
  demoSettingsStore,
  getSearchEngine,
  resolveNavigationInput,
} from "../store";
import homepage from "./homepage.html?raw";
import NewTab from "./NewTab";
import type { Frame } from "@mercuryworkshop/scramjet-controller";

export const browserState = createState({
  url: "",
  frame: null! as Frame,
  showHome: true,
  netError: "",
  netErrorUrl: "",
  netErrorHint: "",
});

/**
 * Turn a transport failure into something a human can act on. The one that
 * matters in practice is curl's "SSL connect error 35": the connection opens
 * but the TLS handshake is killed, which is what a network that only allows a
 * handful of hosts (or a TLS-inspecting middlebox) looks like.
 */
function explainNetworkError(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String((error as { message?: string })?.message ?? error ?? "");

  if (/SSL connect error|error code 35|CURLE_SSL_CONNECT_ERROR/i.test(raw)) {
    return {
      problem: "TLS handshake blocked",
      hint: "The connection to that host opened but the TLS handshake was refused. That is what a network allowlist or a TLS-inspecting middlebox looks like — the machine running the Wisp server cannot reach this site.",
    };
  }
  if (/Could not resolve|code 6|CURLE_COULDNT_RESOLVE/i.test(raw)) {
    return {
      problem: "DNS failed",
      hint: "The Wisp server could not resolve that hostname.",
    };
  }
  if (/Connection refused|code 7|CURLE_COULDNT_CONNECT/i.test(raw)) {
    return {
      problem: "Connection refused",
      hint: "That host refused the connection from the Wisp server.",
    };
  }
  if (/timed out|timeout|code 28/i.test(raw)) {
    return {
      problem: "Connection timed out",
      hint: "The Wisp server never got a reply. The destination or the network in between is dropping traffic.",
    };
  }
  return { problem: raw || "Request failed", hint: "" };
}

function watchRequestErrors(frame: Frame) {
  try {
    Tap.tap(frame.hooks.error.request, ({ rawrequest, error }) => {
      const { problem, hint } = explainNetworkError(error);
      browserState.netError = problem;
      browserState.netErrorUrl = rawrequest?.remote ?? browserState.url;
      browserState.netErrorHint = hint;
    });
  } catch (error) {
    console.warn("[browser] could not hook request errors", error);
  }
}

/** send the browser frame to a url (search queries get resolved first) */
export function navigateTo(url: string) {
  browserState.url = url;
  browserState.showHome = false;
  browserState.netError = "";
  browserState.netErrorHint = "";
  try {
    browserState.frame?.go(url);
  } catch (error) {
    console.error("[browser] navigation failed", error);
  }
}

export function navigateToInput(input: string) {
  const target = resolveNavigationInput(input, demoSettingsStore.searchEngine);
  if (target) navigateTo(target);
}

export function goHome() {
  browserState.showHome = true;
}

export const Omnibox: Component<
  {},
  {},
  {
    inputEl: HTMLInputElement;
  }
> = function (cx) {
  const submit = () => {
    const value = this.inputEl?.value ?? browserState.url;
    navigateToInput(value);
  };

  const cycleEngine = () => {
    const current = demoSettingsStore.searchEngine;
    const index = SEARCH_ENGINES.findIndex((engine) => engine.id === current);
    const next = SEARCH_ENGINES[(index + 1) % SEARCH_ENGINES.length];
    demoSettingsStore.searchEngine = next.id;
  };

  cx.mount = () => {
    const focusOmnibox = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        this.inputEl?.focus();
        this.inputEl?.select();
      }
    };
    document.addEventListener("keydown", focusOmnibox);
  };

  return (
    <form
      class="url-form"
      on:submit={(e: SubmitEvent) => {
        e.preventDefault();
        submit();
      }}
    >
      <div class="browser-omnibox-shell">
        <div class="omnibox-nav">
          <button
            type="button"
            class="nav-btn"
            title="Back"
            on:click={() => browserState.frame?.back()}
          >
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <button
            type="button"
            class="nav-btn"
            title="Forward"
            on:click={() => browserState.frame?.forward()}
          >
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
          <button
            type="button"
            class="nav-btn"
            title="Reload"
            on:click={() => browserState.frame?.reload()}
          >
            <span class="material-symbols-outlined">refresh</span>
          </button>
          <button
            type="button"
            class="nav-btn"
            title="Home"
            on:click={() => goHome()}
          >
            <span class="material-symbols-outlined">home</span>
          </button>
        </div>

        <div class="omnibox-input-wrap">
          <input
            id="search"
            class="url-input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            this={use(this.inputEl)}
            value={use(browserState.url)}
            placeholder="Search or enter address"
          />
        </div>

        <button
          type="button"
          class="engine-switch"
          title="Click to switch search engine"
          on:click={(e: MouseEvent) => {
            e.preventDefault();
            cycleEngine();
          }}
        >
          <span
            class={use(demoSettingsStore.searchEngine).map(
              (id) => `engine-switch-dot engine-${id}`,
            )}
          ></span>
          <span class="engine-switch-label">
            {use(demoSettingsStore.searchEngine).map(
              (id) => getSearchEngine(id).label,
            )}
          </span>
        </button>

        <button type="submit" class="go-btn" title="Go">
          <span class="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </form>
  );
};

Omnibox.style = css`
  :scope {
    display: flex;
    align-items: center;
    padding: 7px 9px;
    background: rgba(12, 14, 22, 0.92);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
  }
  .browser-omnibox-shell {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 6px;
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    padding: 3px 4px 3px 6px;
    border-radius: 13px;
    flex: 1;
    transition:
      border-color 0.14s ease,
      box-shadow 0.14s ease;
  }
  .browser-omnibox-shell:focus-within {
    border-color: rgba(124, 92, 255, 0.55);
    box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.14);
  }
  .omnibox-nav {
    display: flex;
    align-items: center;
    gap: 1px;
    padding-right: 5px;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
  }
  .nav-btn {
    border: 0;
    background: transparent;
    color: #939bb1;
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .nav-btn:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #eef0f8;
  }
  .browser-omnibox-shell .material-symbols-outlined {
    font-size: 15px !important;
    line-height: 1 !important;
    font-variation-settings:
      "OPSZ" 20,
      "wght" 300,
      "FILL" 0,
      "GRAD" 0;
  }
  .omnibox-input-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .url-input {
    box-sizing: border-box;
    width: 100%;
    padding: 6px 6px;
    font-size: 0.86rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #eef0f8;
    outline: none;
    font-family: inherit;
  }
  .url-input::placeholder {
    color: #737b91;
  }
  .engine-switch {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.05);
    color: #b9c0d4;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 560;
    padding: 4px 9px;
    border-radius: 9px;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .engine-switch:hover {
    background: rgba(124, 92, 255, 0.18);
    color: #eae7ff;
  }
  .engine-switch-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .engine-google {
    background: #4285f4;
  }
  .engine-bing {
    background: #00a4ef;
  }
  .engine-duckduckgo {
    background: #de5833;
  }
  .engine-brave {
    background: #fb542b;
  }
  .go-btn {
    flex: none;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 9px;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: #fff;
    background: linear-gradient(135deg, #7c5cff, #4f8bff);
    box-shadow: 0 6px 16px rgba(96, 92, 255, 0.3);
  }
  .go-btn .material-symbols-outlined {
    font-size: 15px !important;
    color: #fff;
  }
  @media (max-width: 600px) {
    .engine-switch-label {
      display: none;
    }
  }
`;

const BrowserView: Component<
  {
    active: boolean;
  },
  {},
  {
    frameel: HTMLIFrameElement;
  }
> = function (cx) {
  cx.mount = async () => {
    await controller.wait();

    let urlWatcher = new UrlWatcherPlugin((url) => {
      browserState.url = url;
      if (/^https?:/i.test(url)) browserState.showHome = false;
    });
    let catchEscapedLinks = new CatchEscapedLinksPlugin(
      (url) =>
        new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin),
    );
    browserState.frame = controller.createFrame(this.frameel, {
      plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
    });
    watchRequestErrors(browserState.frame);
    let realHomepage = homepage;
    realHomepage = realHomepage.replaceAll(
      "{{SCRAMJET_VERSION}}",
      String(versionInfo.version),
    );
    realHomepage = realHomepage.replaceAll(
      "{{SCRAMJET_BUILD}}",
      String(versionInfo.build),
    );
    realHomepage = realHomepage.replaceAll(
      "{{SCRAMJET_DATE_PRETTY}}",
      new Date(versionInfo.date).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      }),
    );
    this.frameel.src = `data:text/html;base64,${btoa(realHomepage)}`;

    let goto = new URL(location.href).searchParams.get("goto");
    if (goto) {
      navigateTo(goto);
      history.replaceState(null, "", location.href.split("?")[0]);
    }
  };

  return (
    <div
      class={use(this.active).map(
        (active) => `tab-panel browser-view ${active ? "active" : ""}`,
      )}
    >
      <iframe
        this={use(this.frameel)}
        class={use(browserState.showHome).map((home) =>
          home ? "site-frame hidden" : "site-frame",
        )}
      ></iframe>
      {use(browserState.showHome).andThen(
        <NewTab
          onNavigate={(url: string) => {
            navigateTo(url);
          }}
        />,
      )}
      {use(browserState.netError).map((error) =>
        error ? (
          <div class="net-error">
            <div class="net-error-body">
              <div class="net-error-title">
                <span class="net-error-dot"></span>
                Can&rsquo;t reach{" "}
                <span class="net-error-url">
                  {use(browserState.netErrorUrl)}
                </span>
              </div>
              <div class="net-error-problem">{error}</div>
              {use(browserState.netErrorHint).map((hint) =>
                hint ? <div class="net-error-hint">{hint}</div> : null,
              )}
            </div>
            <div class="net-error-actions">
              <button
                on:click={() => {
                  browserState.netError = "";
                  browserState.frame?.reload();
                }}
              >
                Retry
              </button>
              <button
                class="ghost"
                on:click={() => {
                  browserState.netError = "";
                  browserState.netErrorHint = "";
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
};

BrowserView.style = css`
  :scope {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: none;
    flex-direction: column;
    position: relative;
    background: #07080e;
  }
  :scope.active {
    display: flex;
  }

  iframe.site-frame {
    background: white;
    flex: 1;
    border: none;
    width: 100%;
    min-height: 0;
  }
  iframe.site-frame.hidden {
    visibility: hidden;
  }

  .net-error {
    position: absolute;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    width: min(620px, calc(100% - 32px));
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 16px;
    border: 1px solid rgba(255, 122, 122, 0.32);
    background: linear-gradient(
      170deg,
      rgba(46, 24, 30, 0.97),
      rgba(24, 16, 22, 0.97)
    );
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    color: #f4e9ec;
    z-index: 5;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
    animation: net-in 0.16s ease-out;
  }
  @keyframes net-in {
    from {
      opacity: 0;
      transform: translate(-50%, 6px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  .net-error-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .net-error-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.82rem;
    font-weight: 620;
  }
  .net-error-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff6b6b;
    box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.18);
    flex: none;
  }
  .net-error-url {
    color: #ffc9c9;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 0.76rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .net-error-problem {
    font-size: 0.78rem;
    color: #ffb4b4;
  }
  .net-error-hint {
    font-size: 0.75rem;
    line-height: 1.5;
    color: #c9b8bd;
  }
  .net-error-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: none;
  }
  .net-error-actions button {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.07);
    color: #f4e9ec;
    border-radius: 9px;
    padding: 6px 12px;
    font: inherit;
    font-size: 0.76rem;
    font-weight: 560;
    cursor: pointer;
  }
  .net-error-actions button:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  .net-error-actions button.ghost {
    background: transparent;
    border-color: transparent;
    color: #a89aa0;
  }
`;

export default BrowserView;
