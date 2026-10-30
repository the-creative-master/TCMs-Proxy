import { css, type Component } from "dreamland/core";
import FlagEditor from "./components/FlagEditor";
import BrowserView from "./pages/BrowserView";
import RequestViewer from "./pages/RequestViewer";
import PlaygroundView from "./pages/Playground";
import SettingsView from "./pages/SettingsPage";
import { Omnibox } from "./pages/BrowserView";
import { requestsState } from "./pages/RequestViewer";

type TabId = "browser" | "requests" | "playground" | "settings";

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: string }> = [
	{ id: "browser", label: "Browser", icon: "public" },
	{ id: "requests", label: "Requests", icon: "swap_vert" },
	{ id: "playground", label: "Playground", icon: "code" },
	{ id: "settings", label: "Settings", icon: "settings" },
];

const App: Component<
	{},
	{},
	{
		activeTab: TabId;
	}
> = function (cx) {
	this.activeTab ??= "browser";

	return (
		<div>
			<div class="top-bar">
				<div class="brand">
					<div class="brand-mark">TCM</div>
					<div class="brand-text">
						<span class="brand-name">TCM's Proxy</span>
						<span class="brand-sub">scramjet</span>
					</div>
				</div>

				<div class="tab-bar">
					{TABS.map((tab) => (
						<button
							class={use(this.activeTab).map(
								(active) => `tab-button ${active === tab.id ? "active" : ""}`
							)}
							on:click={() => {
								this.activeTab = tab.id;
							}}
						>
							<span class="material-symbols-outlined">{tab.icon}</span>
							<span class="tab-label">
								{tab.label}
								{tab.id === "requests"
									? use(requestsState.requests).map((requests) =>
											requests.length ? ` ${requests.length}` : ""
										)
									: ""}
							</span>
						</button>
					))}
				</div>

				<div class="top-actions">
					<FlagEditor inline={true} />
				</div>
			</div>

			<div class="toolbar-slot">
				{use(this.activeTab).andThen(<Omnibox />)}
			</div>

			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel browser-panel ${tab === "browser" ? "active" : ""}`
				)}
			>
				<BrowserView
					active={use(this.activeTab).map((tab) => tab === "browser")}
				/>
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel requests-panel ${tab === "requests" ? "active" : ""}`
				)}
			>
				<RequestViewer
					active={use(this.activeTab).map((tab) => tab === "requests")}
				/>
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel playground-panel ${tab === "playground" ? "active" : ""}`
				)}
			>
				<PlaygroundView
					active={use(this.activeTab).map((tab) => tab === "playground")}
				/>
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel settings-tab ${tab === "settings" ? "active" : ""}`
				)}
			>
				<SettingsView />
			</div>
		</div>
	);
};

App.style = css`
	@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0");
	@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");

	:scope {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		margin: 0;
		overflow: hidden;
		position: absolute;
		top: 0;
		left: 0;
		padding: 0;
		background: #07080e;
		color: #e9ebf5;
		font-family:
			"Inter",
			system-ui,
			-apple-system,
			"Segoe UI",
			sans-serif;
		box-sizing: border-box;
	}
	.material-symbols-outlined {
		font-family: "Material Symbols Outlined";
		font-weight: normal;
		font-style: normal;
		font-size: 11px;
		line-height: 1;
		letter-spacing: normal;
		text-transform: none;
		display: inline-block;
		white-space: nowrap;
		word-wrap: normal;
		direction: ltr;
		-webkit-font-smoothing: antialiased;
	}
	.top-bar {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background:
			linear-gradient(
				180deg,
				rgba(20, 23, 38, 0.96),
				rgba(11, 13, 21, 0.96)
			);
		box-sizing: border-box;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		flex: none;
	}
	.brand-mark {
		width: 26px;
		height: 26px;
		border-radius: 9px;
		display: grid;
		place-items: center;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		color: #fff;
		background: linear-gradient(135deg, #7c5cff, #22d3ee);
		box-shadow:
			0 8px 20px rgba(96, 92, 255, 0.35),
			inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.brand-name {
		font-size: 0.82rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: #f2f4fb;
	}
	.brand-sub {
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #6f7891;
	}
	.tab-bar {
		display: flex;
		align-items: center;
		gap: 3px;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab-bar::-webkit-scrollbar {
		display: none;
	}
	.tab-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: #99a1b8;
		padding: 7px 12px;
		border-radius: 10px;
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		transition:
			background 0.14s ease,
			color 0.14s ease;
	}
	.tab-button .material-symbols-outlined {
		font-size: 16px;
		opacity: 0.85;
	}
	.tab-button:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #d9ddec;
	}
	.tab-button.active {
		background: linear-gradient(
			140deg,
			rgba(124, 92, 255, 0.25),
			rgba(79, 139, 255, 0.16)
		);
		border-color: rgba(124, 92, 255, 0.4);
		color: #f4f5ff;
	}
	.top-actions {
		display: flex;
		align-items: center;
		margin-left: auto;
		flex: none;
	}
	.toolbar-slot {
		display: flex;
		flex: none;
		width: 100%;
		min-width: 0;
	}
	.tab-panel {
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
		display: none;
	}
	.tab-panel.active {
		display: flex;
	}
	.requests-panel {
		flex-direction: column;
	}
	.playground-panel {
		width: 100%;
		min-width: 0;
		min-height: 0;
	}
	.settings-tab {
		width: 100%;
		min-width: 0;
		min-height: 0;
	}
	@media (max-width: 720px) {
		.brand-text {
			display: none;
		}
		.tab-button {
			padding: 7px 9px;
		}
	}
`;
export default App;
