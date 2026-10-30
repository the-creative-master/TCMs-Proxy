import { css, type Component, createState } from "dreamland/core";
import {
  CatchEscapedLinksPlugin,
  UrlWatcherPlugin,
} from "@mercuryworkshop/scramjet-utils";
import { Tap } from "@mercuryworkshop/scramjet";
import { cachePlugin, controller, getTransport } from "..";
import {
  AVAILABLE_TRANSPORTS,
  LOGO_URL,
  WISP_PRESETS,
  demoSettingsDefaults,
  demoSettingsStore,
  getSearchEngine,
  normalizeTransport,
  localWispUrl,
  normalizeWispUrl,
  probeWispUrl,
  resolveNavigationInput,
  type AvailableTransports,
} from "../store";
import NewTab from "./NewTab";
import type { Frame } from "@mercuryworkshop/scramjet-controller";

export const browserState = createState({
  /** what the omnibox shows */
  url: "",
  /** the committed page, used for the "connection" label */
  liveUrl: "",
  frame: null! as Frame,
  showHome: true,
  netError: "",
  netErrorUrl: "",
  netErrorHint: "",
});

const BLANK_DOC = `data:text/html;charset=utf-8,${encodeURIComponent(
  "<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%;background:#0a0b10}</style>",
)}`;

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
      hint: "The connection to that host opened but the TLS handshake was refused. That is what a network allowlist or TLS-inspecting middlebox looks like — the machine running the Wisp server cannot reach this site.",
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
      browserState.netErrorUrl =
        (rawrequest?.remote as string) ?? browserState.url;
      browserState.netErrorHint = hint;
    });
  } catch (error) {
    console.warn("[browser] could not hook request errors", error);
  }
}

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

/** every proxied document lives under this path prefix (set by the engine) */
function isProxiedPath(pathname: string) {
  return pathname.startsWith("/~/sj/");
}

function sameOriginUrl(href: string): URL | null {
  try {
    const parsed = new URL(href, location.href);
    return parsed.origin === location.origin ? parsed : null;
  } catch {
    return null;
  }
}

/** pull the real destination out of `/?goto=<url>` */
function gotoParam(href: string): string | null {
  const parsed = sameOriginUrl(href);
  const target = parsed?.searchParams.get("goto") ?? null;
  return target && target.trim() ? target : null;
}

/** true when a URL would put the proxy inside its own viewport */
function isSelfReferential(href: string) {
  const parsed = sameOriginUrl(href);
  if (!parsed) return false;
  return !isProxiedPath(parsed.pathname);
}

export function navigateToInput(input: string) {
  const target = resolveNavigationInput(input, demoSettingsStore.searchEngine);
  if (!target) return;
  if (isSelfReferential(target)) {
    // never point the viewport back at ourselves — that is the proxy inside
    // the proxy, which has no way to work
    goHome();
    return;
  }
  navigateTo(target);
}

export function goHome() {
  browserState.showHome = true;
  browserState.netError = "";
  browserState.netErrorHint = "";
}

function prettyHost(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const BrowserView: Component<
  {},
  {},
  {
    omniboxEl: HTMLInputElement;
    frameel: HTMLIFrameElement;
    connOpen: boolean;
    wispInput: string;
    transportInput: AvailableTransports;
    connStatus: string;
    connError: string;
    probing: boolean;
    probeStatus: string;
    probeOk: boolean;
  }
> = function (cx) {
  this.connOpen ??= false;
  this.connStatus ??= "";
  this.connError ??= "";
  this.probing ??= false;
  this.probeStatus ??= "";
  this.probeOk ??= false;

  const openConnection = () => {
    this.connOpen = !this.connOpen;
    if (this.connOpen) {
      this.wispInput = demoSettingsStore.wispUrl;
      this.transportInput = demoSettingsStore.transport;
      this.connStatus = "";
      this.connError = "";
      this.probeStatus = "";
    }
  };

  const pickServer = (url: string) => {
    this.wispInput = url;
    this.connStatus = "";
    this.connError = "";
    this.probeStatus = "";
  };

  const testServer = async () => {
    if (this.probing) return;
    let candidate: string;
    try {
      candidate = normalizeWispUrl(this.wispInput);
    } catch (error) {
      this.probeOk = false;
      this.probeStatus =
        error instanceof Error ? error.message : "That URL is not valid.";
      return;
    }
    this.probing = true;
    this.probeStatus = "";
    const result = await probeWispUrl(candidate);
    this.probing = false;
    this.probeOk = result.ok;
    this.probeStatus = result.ok
      ? `${result.ms} ms — ${result.message}`
      : result.message;
  };

  const applyConnection = () => {
    this.connError = "";
    try {
      const nextWisp = normalizeWispUrl(this.wispInput);
      const nextTransport = normalizeTransport(this.transportInput);
      const changed =
        nextWisp !== demoSettingsStore.wispUrl ||
        nextTransport !== demoSettingsStore.transport;

      demoSettingsStore.wispUrl = nextWisp;
      demoSettingsStore.transport = nextTransport;
      this.wispInput = nextWisp;
      this.transportInput = nextTransport;

      if (changed) {
        controller.setTransport(getTransport());
        this.connStatus = "Reconnected — new requests use this server.";
      } else {
        this.connStatus = "No changes.";
      }
    } catch (error) {
      this.connStatus = "";
      this.connError =
        error instanceof Error
          ? error.message
          : "Could not apply those settings.";
    }
  };

  cx.mount = async () => {
    await controller.wait();

    const urlWatcher = new UrlWatcherPlugin((url) => {
      if (isSelfReferential(url)) {
        recoverFromAppUrl(url);
        return;
      }
      browserState.url = url;
      browserState.liveUrl = url;
      if (/^https?:/i.test(url)) browserState.showHome = false;
    });
    const catchEscapedLinks = new CatchEscapedLinksPlugin(
      (url) =>
        new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin),
    );

    this.frameel.src = BLANK_DOC;
    browserState.frame = controller.createFrame(this.frameel, {
      plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
    });
    watchRequestErrors(browserState.frame);

    const goto = new URL(location.href).searchParams.get("goto");
    if (goto) {
      navigateTo(goto);
      history.replaceState(null, "", location.href.split("?")[0]);
    }

    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        this.omniboxEl?.focus();
        this.omniboxEl?.select();
      }
      if (event.key === "Escape") {
        this.connOpen = false;
      }
    };
    document.addEventListener("keydown", onKey);
  };

  const submit = () => {
    const value = this.omniboxEl?.value ?? "";
    if (!value.trim()) {
      goHome();
      this.omniboxEl?.blur();
      return;
    }
    navigateToInput(value);
    this.omniboxEl?.blur();
  };

  /**
   * Last line of defence against the viewport loading this app: if the frame
   * ever ends up on one of our own URLs (service worker miss, an escaped link,
   * a `?goto=` bounce) put it back on a proxied page instead of nesting.
   */
  const recoverFromAppUrl = (href: string) => {
    const target = gotoParam(href);
    if (target && !isSelfReferential(target)) {
      navigateTo(target);
      return;
    }
    goHome();
    this.frameel?.setAttribute("src", BLANK_DOC);
  };

  const onFrameLoad = () => {
    let href = "";
    try {
      href = this.frameel?.contentWindow?.location.href ?? "";
    } catch {
      // a genuine cross-origin page — exactly what we want to see
      return;
    }
    if (!href || href === "about:blank" || href.startsWith("data:")) return;
    const parsed = sameOriginUrl(href);
    if (!parsed) return;
    if (isProxiedPath(parsed.pathname)) return;
    recoverFromAppUrl(href);
  };

  const engine = use(demoSettingsStore.searchEngine).map((id) =>
    getSearchEngine(id),
  );

  return (
    <div
      class={use(browserState.showHome).map((home) =>
        home ? "shell home" : "shell browsing",
      )}
    >
      <div class="aurora" aria-hidden="true">
        <span class="blob one"></span>
        <span class="blob two"></span>
        <span class="blob three"></span>
      </div>

      <header class="chrome">
        <button
          class="brand"
          title="New tab"
          on:click={() => {
            goHome();
            this.omniboxEl?.focus();
          }}
        >
          <img
            class="brand-mark"
            src={LOGO_URL}
            alt="TCM's Proxy"
            width="30"
            height="30"
          />
        </button>

        <div class="nav">
          <button
            class="icon-btn"
            title="Back"
            on:click={() => browserState.frame?.back()}
          >
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <button
            class="icon-btn"
            title="Forward"
            on:click={() => browserState.frame?.forward()}
          >
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
          <button
            class="icon-btn"
            title="Reload"
            on:click={() => browserState.frame?.reload()}
          >
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>

        <form
          class="omni"
          on:submit={(e: SubmitEvent) => {
            e.preventDefault();
            submit();
          }}
        >
          <span
            class={engine.map((e) => `omni-engine engine-${e.id}`)}
            title="Search engine"
          >
            {engine.map((e) => e.glyph)}
          </span>
          <input
            id="search"
            class="omni-input"
            type="text"
            spellcheck={false}
            autocomplete="off"
            this={use(this.omniboxEl)}
            placeholder={engine.map(
              (e) => `Search ${e.label} or enter address`,
            )}
          />
          {use(browserState.showHome).map((home) =>
            home ? null : (
              <button
                type="button"
                class="omni-site"
                title="Back to new tab"
                on:click={() => goHome()}
              >
                {use(browserState.liveUrl).map((url) =>
                  url ? prettyHost(url) : "",
                )}
              </button>
            ),
          )}
        </form>

        <div class="chrome-actions">
          <button
            class={use(this.connOpen).map((open) =>
              open ? "icon-btn connection active" : "icon-btn connection",
            )}
            title="Connection"
            on:click={openConnection}
          >
            <span class="dot"></span>
          </button>
        </div>

        {use(this.connOpen).andThen(
          <div class="popover">
            <div class="popover-head">
              <span>Connection</span>
              <button
                class="popover-close"
                on:click={() => {
                  this.connOpen = false;
                }}
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="popover-servers">
              {[
                ...WISP_PRESETS,
                {
                  id: "local",
                  label: "This machine",
                  url: localWispUrl(),
                  note: "Local",
                  detail: "The relay bundled with the dev server",
                },
              ].map((preset) => (
                <button
                  type="button"
                  class={use(this.wispInput).map((current) =>
                    current === preset.url ? "server-row active" : "server-row",
                  )}
                  title={preset.detail}
                  on:click={() => pickServer(preset.url)}
                >
                  <span class="server-dot"></span>
                  <span class="server-text">
                    <span class="server-name">{preset.label}</span>
                    <span class="server-host">{prettyHost(preset.url)}</span>
                  </span>
                  <span class="server-note">{preset.note}</span>
                </button>
              ))}
            </div>
            <label class="popover-field">
              <span>Wisp server</span>
              <input
                type="text"
                spellcheck={false}
                value={use(this.wispInput)}
                on:input={(e: InputEvent) => {
                  this.wispInput = (e.target as HTMLInputElement).value;
                }}
                on:keydown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") applyConnection();
                }}
              />
            </label>
            <label class="popover-field">
              <span>Transport</span>
              <select
                value={use(this.transportInput)}
                on:change={(e: Event) => {
                  this.transportInput = (e.target as HTMLSelectElement)
                    .value as AvailableTransports;
                }}
              >
                {AVAILABLE_TRANSPORTS.map((option) => (
                  <option value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div class="popover-test">
              <button
                type="button"
                class="test-btn"
                on:click={() => void testServer()}
              >
                {use(this.probing).map((busy) =>
                  busy ? "Testing…" : "Test connection",
                )}
              </button>
              {use(this.probeStatus).map((status) =>
                status ? (
                  <span
                    class={use(this.probeOk).map((ok) =>
                      ok ? "probe-result ok" : "probe-result bad",
                    )}
                  >
                    {status}
                  </span>
                ) : null,
              )}
            </div>
            <p class="popover-note">
              Every proxied request leaves from the machine running this Wisp
              server, not from your browser — so pick one your network can
              reach. Testing happens in this browser, not on the server.
            </p>
            {use(this.connError).andThen(
              <div class="popover-error">{use(this.connError)}</div>,
            )}
            {use(this.connStatus).andThen(
              <div class="popover-status">{use(this.connStatus)}</div>,
            )}
            <div class="popover-actions">
              <button
                class="ghost"
                on:click={() => {
                  pickServer(demoSettingsDefaults.wispUrl);
                  this.transportInput = demoSettingsDefaults.transport;
                }}
              >
                Defaults
              </button>
              <button class="primary" on:click={applyConnection}>
                Apply
              </button>
            </div>
          </div>,
        )}
      </header>

      <main class="viewport">
        <iframe
          this={use(this.frameel)}
          class="site-frame"
          on:load={onFrameLoad}
        ></iframe>

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
      </main>

      {use(browserState.showHome).andThen(
        <NewTab
          onNavigate={(url: string) => {
            navigateTo(url);
          }}
        />,
      )}
    </div>
  );
};

BrowserView.style = css`
  @import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0");

  :scope {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #080910;
    color: #e9ebf5;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
    box-sizing: border-box;
  }
  :scope * {
    box-sizing: border-box;
  }
  .material-symbols-outlined {
    font-family: "Material Symbols Outlined";
    font-weight: normal;
    font-style: normal;
    font-size: 18px;
    line-height: 1;
    display: inline-block;
    white-space: nowrap;
    direction: ltr;
    -webkit-font-smoothing: antialiased;
  }

  .aurora {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .blob {
    position: absolute;
    display: block;
    border-radius: 50%;
    filter: blur(70px);
    opacity: 0.5;
  }
  .blob.one {
    width: 46vw;
    height: 46vw;
    left: -10vw;
    top: -16vw;
    background: radial-gradient(circle, #6d4bff, transparent 70%);
    animation: drift 26s ease-in-out infinite alternate;
  }
  .blob.two {
    width: 40vw;
    height: 40vw;
    right: -12vw;
    top: -10vw;
    background: radial-gradient(circle, #1fb6d6, transparent 70%);
    animation: drift 32s ease-in-out infinite alternate-reverse;
  }
  .blob.three {
    width: 38vw;
    height: 38vw;
    left: 30vw;
    bottom: -22vw;
    background: radial-gradient(circle, #ff5d8f, transparent 70%);
    opacity: 0.28;
    animation: drift 38s ease-in-out infinite alternate;
  }
  @keyframes drift {
    from {
      transform: translate3d(0, 0, 0) scale(1);
    }
    to {
      transform: translate3d(4vw, 3vw, 0) scale(1.12);
    }
  }

  .chrome {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    height: 54px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 8px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: linear-gradient(
      180deg,
      rgba(28, 31, 48, 0.86),
      rgba(14, 16, 26, 0.9)
    );
    backdrop-filter: blur(20px) saturate(160%);
    box-shadow:
      0 18px 44px rgba(0, 0, 0, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
  .brand {
    flex: none;
    width: 34px;
    height: 34px;
    border: 0;
    padding: 0;
    border-radius: 11px;
    cursor: pointer;
    display: grid;
    place-items: center;
    background: transparent;
    transition: transform 0.14s ease;
  }
  .brand:hover {
    transform: translateY(-1px);
  }
  .brand-mark {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    display: block;
    filter: drop-shadow(0 8px 18px rgba(96, 92, 255, 0.4));
  }
  .nav {
    flex: none;
    display: flex;
    align-items: center;
    gap: 1px;
    padding-right: 6px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
  }
  .icon-btn {
    width: 30px;
    height: 30px;
    border: 0;
    padding: 0;
    border-radius: 9px;
    background: transparent;
    color: #98a0b8;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.13s ease,
      color 0.13s ease;
  }
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #f1f3fa;
  }
  .icon-btn .material-symbols-outlined {
    font-size: 17px;
  }

  .omni {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 10px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(8, 10, 18, 0.55);
    transition:
      border-color 0.14s ease,
      box-shadow 0.14s ease,
      background 0.14s ease;
  }
  .omni:focus-within {
    border-color: rgba(124, 92, 255, 0.65);
    background: rgba(8, 10, 18, 0.78);
    box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.16);
  }
  .omni-engine {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    font-size: 0.66rem;
    font-weight: 800;
    color: #fff;
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
  .omni-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: #f2f4fb;
    font: inherit;
    font-size: 0.86rem;
    outline: none;
    padding: 0;
  }
  .omni-input::placeholder {
    color: #737b91;
  }
  .omni-site {
    flex: none;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    cursor: pointer;
    padding: 4px 9px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: #b9c0d4;
    font: inherit;
    font-size: 0.72rem;
  }
  .omni-site:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #eef0f8;
  }

  .chrome-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .icon-btn.connection {
    position: relative;
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
  }
  .icon-btn.connection .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18);
  }
  .icon-btn.connection.active {
    background: rgba(124, 92, 255, 0.22);
    border-color: rgba(124, 92, 255, 0.45);
  }

  .popover {
    position: absolute;
    top: 56px;
    right: 0;
    width: 340px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(16, 18, 30, 0.98);
    box-shadow: 0 28px 70px rgba(0, 0, 0, 0.6);
    animation: pop-in 0.14s ease-out;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(-5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .popover-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.82rem;
    font-weight: 650;
  }
  .popover-close {
    border: 0;
    background: transparent;
    color: #8b93a9;
    cursor: pointer;
    padding: 2px;
    border-radius: 6px;
    display: grid;
    place-items: center;
  }
  .popover-close:hover {
    color: #e9ebf5;
    background: rgba(255, 255, 255, 0.08);
  }
  .popover-servers {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 208px;
    overflow: auto;
    padding: 4px;
    border-radius: 11px;
    background: rgba(8, 10, 18, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }
  .server-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #d5daea;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .server-row:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .server-row.active {
    background: rgba(124, 92, 255, 0.18);
  }
  .server-dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
  }
  .server-row.active .server-dot {
    background: #7cf0b6;
    box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.16);
  }
  .server-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .server-name {
    font-size: 0.78rem;
    font-weight: 560;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .server-host {
    font-size: 0.66rem;
    color: #7d859b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .server-note {
    flex: none;
    font-size: 0.64rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 2px 6px;
    border-radius: 999px;
    color: #a9b1c6;
    background: rgba(255, 255, 255, 0.07);
  }
  .server-row.active .server-note {
    color: #cfc6ff;
    background: rgba(124, 92, 255, 0.26);
  }

  .popover-test {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .test-btn {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: #e9ebf5;
    border-radius: 8px;
    padding: 6px 10px;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 560;
    cursor: pointer;
  }
  .test-btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .probe-result {
    font-size: 0.7rem;
    line-height: 1.35;
  }
  .probe-result.ok {
    color: #7cf0b6;
  }
  .probe-result.bad {
    color: #ffb4b4;
  }

  .popover-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.72rem;
    color: #9aa3b8;
  }
  .popover-field input,
  .popover-field select {
    width: 100%;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(8, 10, 18, 0.7);
    color: #f1f3fa;
    font: inherit;
    font-size: 0.78rem;
    outline: none;
  }
  .popover-field input:focus,
  .popover-field select:focus {
    border-color: rgba(124, 92, 255, 0.65);
    box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.14);
  }
  .popover-note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.5;
    color: #7d859b;
  }
  .popover-error,
  .popover-status {
    font-size: 0.74rem;
    padding: 7px 9px;
    border-radius: 8px;
  }
  .popover-error {
    color: #ffb4b4;
    background: rgba(255, 90, 90, 0.1);
    border: 1px solid rgba(255, 90, 90, 0.28);
  }
  .popover-status {
    color: #b6f0d3;
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.25);
  }
  .popover-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .popover-actions button {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: #e9ebf5;
    border-radius: 9px;
    padding: 7px 12px;
    font: inherit;
    font-size: 0.76rem;
    font-weight: 560;
    cursor: pointer;
  }
  .popover-actions button:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .popover-actions button.ghost {
    background: transparent;
    border-color: transparent;
    color: #9aa3b8;
  }
  .popover-actions button.primary {
    border-color: transparent;
    background: linear-gradient(135deg, #7c5cff, #4f8bff);
    color: #fff;
  }

  .viewport {
    position: absolute;
    top: 78px;
    left: 12px;
    right: 12px;
    bottom: 12px;
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: #0b0d14;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
    z-index: 5;
  }
  :scope.home .viewport {
    opacity: 0;
    pointer-events: none;
  }
  iframe.site-frame {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: #fff;
  }

  .net-error {
    position: absolute;
    left: 50%;
    bottom: 20px;
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

  @media (max-width: 620px) {
    .nav {
      display: none;
    }
    .omni-site {
      display: none;
    }
    .popover {
      width: calc(100vw - 40px);
      right: -4px;
    }
  }
`;

export default BrowserView;
