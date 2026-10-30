import { css, type Component } from "dreamland/core";
import {
	monogram,
	normalizeShortcutUrl,
	shortcutNameFromUrl,
	shortcutTileColor,
	type Shortcut,
} from "../store";

const ShortcutEditor: Component<
	{
		shortcut: Shortcut | null;
		onSubmit: (name: string, url: string) => string | null;
		onDelete: (() => void) | null;
		onClose: () => void;
	},
	{},
	{
		nameInput: string;
		urlInput: string;
		error: string;
	}
> = function (cx) {
	this.nameInput ??= this.shortcut?.name ?? "";
	this.urlInput ??= this.shortcut?.url ?? "";
	this.error ??= "";

	cx.mount = () => {
		const input = cx.root.querySelector<HTMLInputElement>(".sc-name");
		input?.focus();
		input?.select();
	};

	const save = () => {
		this.error = "";
		let url: string;
		try {
			url = normalizeShortcutUrl(this.urlInput);
		} catch (error) {
			this.error =
				error instanceof Error ? error.message : "Invalid shortcut URL.";
			return;
		}
		const name = this.nameInput.trim() || shortcutNameFromUrl(url);
		const failure = this.onSubmit?.(name, url);
		if (failure) {
			this.error = failure;
			return;
		}
		this.onClose?.();
	};

	const closeOnBackdrop = (event: MouseEvent) => {
		if (event.target === event.currentTarget) this.onClose?.();
	};

	return (
		<div class="sc-overlay" on:click={closeOnBackdrop}>
			<div class="sc-card">
				<div class="sc-title">
					{this.shortcut ? "Edit shortcut" : "Add shortcut"}
				</div>
				<label class="sc-field">
					<span>Name</span>
					<input
						class="sc-name"
						type="text"
						spellcheck={false}
						placeholder="YouTube"
						value={use(this.nameInput)}
						on:input={(e: InputEvent) => {
							this.nameInput = (e.target as HTMLInputElement).value;
						}}
						on:keydown={(e: KeyboardEvent) => {
							if (e.key === "Enter") save();
							if (e.key === "Escape") this.onClose?.();
						}}
					/>
				</label>
				<label class="sc-field">
					<span>URL</span>
					<input
						type="text"
						spellcheck={false}
						placeholder="youtube.com"
						value={use(this.urlInput)}
						on:input={(e: InputEvent) => {
							this.urlInput = (e.target as HTMLInputElement).value;
						}}
						on:keydown={(e: KeyboardEvent) => {
							if (e.key === "Enter") save();
							if (e.key === "Escape") this.onClose?.();
						}}
					/>
				</label>
				<div class="sc-preview">
					<div
						class="sc-preview-tile"
						style={{
							background: shortcutTileColor(
								(this.shortcut?.id ?? "new").trim().toLowerCase()
							),
						}}
					>
						{use(this.nameInput).map((name) => monogram(name || "?"))}
					</div>
					<div class="sc-preview-text">
						<span class="sc-preview-name">
							{use(this.nameInput, this.urlInput).map(
								([name, url]) =>
									name.trim() || shortcutNameFromUrl(url || "https://example.com")
							)}
						</span>
						<span class="sc-preview-url">
							{use(this.urlInput).map((url) => url.trim() || "example.com")}
						</span>
					</div>
				</div>
				{use(this.error).andThen(<div class="sc-error">{use(this.error)}</div>)}
				<div class="sc-actions">
					{this.onDelete
						? (
								<button
									class="sc-btn danger"
									on:click={() => this.onDelete?.()}
								>
									Delete
								</button>
							)
						: null}
					<div class="sc-spacer"></div>
					<button class="sc-btn" on:click={() => this.onClose?.()}>
						Cancel
					</button>
					<button class="sc-btn primary" on:click={save}>
						{this.shortcut ? "Save changes" : "Add shortcut"}
					</button>
				</div>
			</div>
		</div>
	);
};

ShortcutEditor.style = css`
	:scope {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(6, 8, 16, 0.66);
		backdrop-filter: blur(10px);
		font-family: inherit;
		animation: sc-fade 0.14s ease-out;
	}
	@keyframes sc-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.sc-card {
		width: min(420px, calc(100vw - 32px));
		padding: 20px;
		border-radius: 20px;
		background: linear-gradient(
			170deg,
			rgba(30, 34, 54, 0.98),
			rgba(17, 19, 31, 0.98)
		);
		border: 1px solid rgba(255, 255, 255, 0.09);
		box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5);
		color: #e8eaf3;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sc-title {
		font-size: 0.98rem;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.sc-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.76rem;
		color: #9aa3b8;
	}
	.sc-field input {
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		border-radius: 11px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(9, 11, 20, 0.75);
		color: #f1f3fa;
		font: inherit;
		font-size: 0.86rem;
		outline: none;
		transition:
			border-color 0.12s ease,
			box-shadow 0.12s ease;
	}
	.sc-field input:focus {
		border-color: rgba(124, 92, 255, 0.75);
		box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.16);
	}
	.sc-preview {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.sc-preview-tile {
		width: 38px;
		height: 38px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 1rem;
		color: #fff;
		flex: none;
	}
	.sc-preview-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.sc-preview-name {
		font-size: 0.86rem;
		font-weight: 600;
	}
	.sc-preview-url {
		font-size: 0.74rem;
		color: #8b93a7;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sc-error {
		padding: 8px 10px;
		border-radius: 10px;
		font-size: 0.78rem;
		color: #ffb4b4;
		background: rgba(255, 90, 90, 0.1);
		border: 1px solid rgba(255, 90, 90, 0.25);
	}
	.sc-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 2px;
	}
	.sc-spacer {
		flex: 1;
	}
	.sc-btn {
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.05);
		color: #e8eaf3;
		border-radius: 10px;
		padding: 8px 13px;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 550;
		cursor: pointer;
		transition:
			background 0.12s ease,
			transform 0.12s ease;
	}
	.sc-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	.sc-btn:active {
		transform: translateY(1px);
	}
	.sc-btn.primary {
		border-color: transparent;
		background: linear-gradient(135deg, #7c5cff, #4f8bff);
		color: #fff;
		box-shadow: 0 8px 22px rgba(96, 92, 255, 0.32);
	}
	.sc-btn.primary:hover {
		background: linear-gradient(135deg, #8a6dff, #5c95ff);
	}
	.sc-btn.danger {
		color: #ffb4b4;
		border-color: rgba(255, 90, 90, 0.28);
		background: rgba(255, 90, 90, 0.08);
	}
`;

export default ShortcutEditor;
