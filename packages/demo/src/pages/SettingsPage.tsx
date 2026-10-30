import { css, type Component } from "dreamland/core";
import { controller, getTransport } from "..";
import {
	AVAILABLE_TRANSPORTS,
	SEARCH_ENGINES,
	type AvailableTransports,
	type SearchEngineId,
	demoSettingsDefaults,
	demoSettingsStore,
	normalizeMaxRequests,
	normalizeSearchEngine,
	normalizeTransport,
	normalizeWispUrl,
	resetShortcuts,
	shortcutsStore,
} from "../store";

const SettingsView: Component<
	{},
	{
		wispUrlInput: string;
		transportInput: AvailableTransports;
		maxRequestsInput: string;
		searchEngineInput: SearchEngineId;
		status: string;
		error: string;
	},
	{}
> = function () {
	this.wispUrlInput ??= demoSettingsStore.wispUrl;
	this.transportInput ??= demoSettingsStore.transport;
	this.maxRequestsInput ??= String(demoSettingsStore.maxRequests);
	this.searchEngineInput ??= demoSettingsStore.searchEngine;
	this.status ??= "";
	this.error ??= "";

	const syncInputsFromStore = () => {
		this.wispUrlInput = demoSettingsStore.wispUrl;
		this.transportInput = demoSettingsStore.transport;
		this.maxRequestsInput = String(demoSettingsStore.maxRequests);
		this.searchEngineInput = demoSettingsStore.searchEngine;
	};

	const applySettings = async () => {
		this.error = "";
		this.status = "Applying settings...";

		try {
			const nextWispUrl = normalizeWispUrl(this.wispUrlInput);
			const nextTransport = normalizeTransport(this.transportInput);
			const nextMaxRequests = normalizeMaxRequests(this.maxRequestsInput);
			const nextSearchEngine = normalizeSearchEngine(this.searchEngineInput);
			const wispChanged = nextWispUrl !== demoSettingsStore.wispUrl;
			const transportChanged = nextTransport !== demoSettingsStore.transport;

			demoSettingsStore.wispUrl = nextWispUrl;
			demoSettingsStore.transport = nextTransport;
			demoSettingsStore.maxRequests = nextMaxRequests;
			demoSettingsStore.searchEngine = nextSearchEngine;

			this.wispUrlInput = nextWispUrl;
			this.transportInput = nextTransport;
			this.maxRequestsInput = String(nextMaxRequests);
			this.searchEngineInput = nextSearchEngine;

			if (wispChanged || transportChanged) {
				controller.setTransport(getTransport());
			}
			this.status =
				wispChanged || transportChanged
					? "Settings saved. Transport updated for new requests."
					: "Settings saved.";
		} catch (error) {
			this.status = "";
			this.error =
				error instanceof Error ? error.message : "Failed to apply settings.";
		}
	};

	const resetDefaults = async () => {
		this.error = "";
		this.status = "Resetting settings...";
		this.wispUrlInput = demoSettingsDefaults.wispUrl;
		this.transportInput = demoSettingsDefaults.transport;
		this.maxRequestsInput = String(demoSettingsDefaults.maxRequests);
		this.searchEngineInput = demoSettingsDefaults.searchEngine;
		await applySettings();
	};

	return (
		<div class="settings-panel">
			<div class="settings-header">
				<h2>Demo Settings</h2>
				<p>
					Update runtime settings without reloading. The new tab page is the
					home page: it hosts the search engine switcher and your shortcuts.
					Wisp changes apply to future requests only.
				</p>
			</div>

			<label class="field">
				<span class="label">Wisp server</span>
				<input
					type="text"
					value={use(this.wispUrlInput)}
					spellcheck={false}
					on:input={(e: InputEvent) => {
						this.wispUrlInput = (e.target as HTMLInputElement).value;
					}}
				/>
				<span class="hint">Example: ws://localhost:4142/</span>
			</label>

			<label class="field">
				<span class="label">Transport</span>
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
				<span class="hint">
					Transport client used to dispatch outbound requests over Wisp.
				</span>
			</label>

			<label class="field">
				<span class="label">Search engine</span>
				<select
					value={use(this.searchEngineInput)}
					on:change={(e: Event) => {
						this.searchEngineInput = (e.target as HTMLSelectElement)
							.value as SearchEngineId;
					}}
				>
					{SEARCH_ENGINES.map((engine) => (
						<option value={engine.id}>
							{engine.label} — {engine.hint}
						</option>
					))}
				</select>
				<span class="hint">
					Used for omnibox searches and for the new tab search box.
				</span>
			</label>

			<label class="field">
				<span class="label">Request log limit</span>
				<input
					type="number"
					min="10"
					max="5000"
					step="10"
					value={use(this.maxRequestsInput)}
					on:input={(e: InputEvent) => {
						this.maxRequestsInput = (e.target as HTMLInputElement).value;
					}}
				/>
				<span class="hint">
					Maximum number of captured requests kept in memory.
				</span>
			</label>

			<div class="field">
				<span class="label">Shortcuts</span>
				<div class="inline-row">
					<span class="hint">
						{use(shortcutsStore.items).map(
							(items) =>
								`${items.length} saved shortcut${items.length === 1 ? "" : "s"}`
						)}
					</span>
					<button
						type="button"
						on:click={() => {
							resetShortcuts();
							this.status = "Shortcuts restored to defaults.";
							this.error = "";
						}}
					>
						Restore default shortcuts
					</button>
				</div>
				<span class="hint">
					Add, edit, or remove shortcuts from the browser new tab page.
				</span>
			</div>

			<div class="actions">
				<button type="button" class="primary" on:click={applySettings}>
					Apply Settings
				</button>
				<button type="button" on:click={resetDefaults}>
					Reset Defaults
				</button>
				<button
					type="button"
					on:click={() => {
						syncInputsFromStore();
						this.error = "";
						this.status = "Inputs reverted to saved settings.";
					}}
				>
					Revert Inputs
				</button>
			</div>

			{use(this.error).map((error) =>
				error ? <div class="message error">{error}</div> : null
			)}
			{use(this.status).map((status) =>
				status ? <div class="message status">{status}</div> : null
			)}
		</div>
	);
};

SettingsView.style = css`
	:scope {
		display: block;
		flex: 1;
		min-width: 0;
		min-height: 0;
		padding: 22px;
		background: #07080e;
		color: #e9ebf5;
		overflow: auto;
		font-family:
			system-ui,
			-apple-system,
			"Segoe UI",
			sans-serif;
		box-sizing: border-box;
	}

	.settings-header {
		margin-bottom: 18px;
		padding-bottom: 14px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
	}

	.settings-header h2 {
		margin: 0 0 6px;
		font-size: 1rem;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.settings-header p {
		margin: 0;
		color: #99a1b8;
		line-height: 1.5;
		font-size: 0.82rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 14px;
		max-width: 720px;
	}

	.label {
		font-size: 0.8rem;
		font-weight: 620;
		color: #e9ebf5;
	}

	input,
	select {
		width: 100%;
		padding: 0.55em 0.7em;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		color: #eef0f8;
		font: inherit;
		font-size: 0.88rem;
		outline: none;
		box-sizing: border-box;
	}

	input:focus,
	select:focus {
		border-color: rgba(124, 92, 255, 0.6);
		box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.14);
	}

	select {
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		background-image:
			linear-gradient(45deg, transparent 50%, #9aa2b8 50%),
			linear-gradient(135deg, #9aa2b8 50%, transparent 50%);
		background-position:
			calc(100% - 14px) 50%,
			calc(100% - 9px) 50%;
		background-size:
			5px 5px,
			5px 5px;
		background-repeat: no-repeat;
		padding-right: 28px;
		cursor: pointer;
	}

	.hint {
		color: #868ea4;
		font-size: 0.76rem;
	}
	.inline-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.inline-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 18px;
	}

	button {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.05);
		color: #e9ebf5;
		padding: 0.5em 0.85em;
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 550;
		line-height: 1.2;
		min-height: 30px;
		transition:
			background 0.12s ease,
			transform 0.12s ease;
	}

	button:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	button:active {
		transform: translateY(1px);
	}

	button.primary {
		border-color: transparent;
		background: linear-gradient(135deg, #7c5cff, #4f8bff);
		color: #fff;
		box-shadow: 0 8px 22px rgba(96, 92, 255, 0.3);
	}

	button.primary:hover {
		background: linear-gradient(135deg, #8a6dff, #5c95ff);
	}

	.message {
		margin-top: 12px;
		padding: 0.65em 0.85em;
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		font-size: 0.82rem;
		max-width: 720px;
	}

	.message.error {
		border-color: rgba(255, 90, 90, 0.3);
		background: rgba(255, 90, 90, 0.08);
		color: #ffb4b4;
	}

	.message.status {
		color: #b8c2cc;
	}
`;
export default SettingsView;
