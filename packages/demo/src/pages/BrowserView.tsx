import { css, type Component, createState } from "dreamland/core";
import {
	CatchEscapedLinksPlugin,
	UrlWatcherPlugin,
} from "@mercuryworkshop/scramjet-utils";
import { versionInfo } from "@mercuryworkshop/scramjet";
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
});

/** send the browser frame to a url (search queries get resolved first) */
export function navigateTo(url: string) {
	browserState.url = url;
	browserState.showHome = false;
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
							(id) => `engine-switch-dot engine-${id}`
						)}
					></span>
					<span class="engine-switch-label">
						{use(demoSettingsStore.searchEngine).map(
							(id) => getSearchEngine(id).label
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
				new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin)
		);
		browserState.frame = controller.createFrame(this.frameel, {
			plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
		});
		let realHomepage = homepage;
		realHomepage = realHomepage.replaceAll(
			"{{SCRAMJET_VERSION}}",
			String(versionInfo.version)
		);
		realHomepage = realHomepage.replaceAll(
			"{{SCRAMJET_BUILD}}",
			String(versionInfo.build)
		);
		realHomepage = realHomepage.replaceAll(
			"{{SCRAMJET_DATE_PRETTY}}",
			new Date(versionInfo.date).toLocaleString(undefined, {
				dateStyle: "short",
				timeStyle: "short",
			})
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
				(active) => `tab-panel browser-view ${active ? "active" : ""}`
			)}
		>
			<iframe
				this={use(this.frameel)}
				class={use(browserState.showHome).map((home) =>
					home ? "site-frame hidden" : "site-frame"
				)}
			></iframe>
			{use(browserState.showHome).andThen(
				<NewTab
					onNavigate={(url: string) => {
						navigateTo(url);
					}}
				/>
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
`;

export default BrowserView;
