import { css, type Component } from "dreamland/core";
import ShortcutEditor from "../components/ShortcutEditor";
import {
  LOGO_URL,
  SEARCH_ENGINES,
  addShortcut,
  demoSettingsStore,
  getSearchEngine,
  monogram,
  removeShortcut,
  resolveNavigationInput,
  shortcutIconCandidates,
  shortcutTileColor,
  shortcutsStore,
  updateShortcut,
  type Shortcut,
} from "../store";

const NewTab: Component<
  {
    onNavigate: (url: string) => void;
  },
  {},
  {
    searchEl: HTMLInputElement;
    editorTarget: string;
  }
> = function (cx) {
  this.editorTarget ??= "";

  const pickEngine = (id: (typeof SEARCH_ENGINES)[number]["id"]) => {
    demoSettingsStore.searchEngine = id;
    this.searchEl?.focus();
  };

  /**
   * Walk the icon candidate list before giving up and showing the monogram, so
   * a shortcut always has a face even when a site ships no favicon.
   */
  const onIconError = (event: Event) => {
    const img = event.currentTarget as HTMLImageElement | null;
    if (!img) return;
    const chain = (img.dataset.chain ?? "").split("|").filter(Boolean);
    const step = Number(img.dataset.step ?? "0") + 1;
    if (step < chain.length) {
      img.dataset.step = String(step);
      img.src = chain[step];
      return;
    }
    img.classList.add("failed");
  };

  const submitSearch = () => {
    const raw = this.searchEl?.value ?? "";
    const target = resolveNavigationInput(raw, demoSettingsStore.searchEngine);
    if (!target) {
      this.searchEl?.focus();
      return;
    }
    this.onNavigate?.(target);
  };

  const openEditor = (target: string) => {
    this.editorTarget = target;
  };

  const editorFor = (target: string) => {
    if (!target) return null;
    const existing: Shortcut | null =
      target === "new"
        ? null
        : (shortcutsStore.items.find((item) => item.id === target) ?? null);
    if (target !== "new" && !existing) return null;

    return (
      <ShortcutEditor
        shortcut={existing}
        onSubmit={(name: string, url: string) => {
          if (existing) updateShortcut(existing.id, name, url);
          else addShortcut(name, url);
          return null;
        }}
        onDelete={
          existing
            ? () => {
                removeShortcut(existing.id);
                this.editorTarget = "";
              }
            : null
        }
        onClose={() => {
          this.editorTarget = "";
        }}
      />
    );
  };

  const engineLabel = use(demoSettingsStore.searchEngine).map(
    (id) => getSearchEngine(id).label,
  );

  return (
    <div class="newtab">
      <div class="newtab-inner">
        <div class="hero">
          <img class="hero-logo" src={LOGO_URL} alt="" width="58" height="58" />
          <h1 class="hero-title">
            <span class="hero-title-main">Where to?</span>
            <span class="hero-title-sub">
              Search or type a URL — every request is tunnelled through Wisp
            </span>
          </h1>
        </div>

        <form
          class="search-form"
          on:submit={(e: SubmitEvent) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <span
            class={use(demoSettingsStore.searchEngine).map(
              (id) => `engine-badge search-glyph engine-${id}`,
            )}
            title={engineLabel.map((label) => `Searching with ${label}`)}
          >
            {use(demoSettingsStore.searchEngine).map(
              (id) => getSearchEngine(id).glyph,
            )}
          </span>

          <input
            class="search-input"
            type="text"
            spellcheck={false}
            autocomplete="off"
            this={use(this.searchEl)}
            placeholder={use(demoSettingsStore.searchEngine).map(
              (id) => `Search with ${getSearchEngine(id).label} or type a URL`,
            )}
          />

          <button class="search-submit" type="submit" title="Search">
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </form>

        <div class="engine-row" role="group" aria-label="Search engine">
          {SEARCH_ENGINES.map((engine) => (
            <button
              type="button"
              class={use(demoSettingsStore.searchEngine).map((id) =>
                id === engine.id ? "engine-btn active" : "engine-btn",
              )}
              title={`Search with ${engine.label}`}
              on:click={(e: MouseEvent) => {
                e.preventDefault();
                pickEngine(engine.id);
              }}
            >
              <span class={`engine-badge small engine-${engine.id}`}>
                {engine.glyph}
              </span>
              <span class="engine-btn-label">{engine.label}</span>
            </button>
          ))}
        </div>

        <div class="shortcuts-head">
          <span class="shortcuts-title">Shortcuts</span>
          <button
            type="button"
            class="shortcuts-add"
            on:click={() => openEditor("new")}
          >
            <span class="material-symbols-outlined">add</span>
            Add shortcut
          </button>
        </div>

        <div class="shortcut-grid">
          {use(shortcutsStore.items).map((items) =>
            items.map((item) => (
              <div
                class="tile"
                title={item.url}
                on:click={() => this.onNavigate?.(item.url)}
              >
                <div class="tile-art">
                  {(() => {
                    const icons = shortcutIconCandidates(item.url);
                    if (!icons.length) {
                      return (
                        <span
                          class="tile-fallback shown"
                          style={{ background: shortcutTileColor(item.id) }}
                        >
                          {monogram(item.name)}
                        </span>
                      );
                    }
                    return [
                      <img
                        class="tile-icon"
                        src={icons[0]}
                        data-chain={icons.join("|")}
                        data-step="0"
                        alt=""
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        on:error={onIconError}
                      />,
                      <span
                        class="tile-fallback"
                        style={{ background: shortcutTileColor(item.id) }}
                      >
                        {monogram(item.name)}
                      </span>,
                    ];
                  })()}
                </div>
                <div class="tile-name">{item.name}</div>
                <button
                  type="button"
                  class="tile-action edit"
                  title={`Edit ${item.name}`}
                  on:click={(e: MouseEvent) => {
                    e.stopPropagation();
                    openEditor(item.id);
                  }}
                >
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button
                  type="button"
                  class="tile-action remove"
                  title={`Remove ${item.name}`}
                  on:click={(e: MouseEvent) => {
                    e.stopPropagation();
                    removeShortcut(item.id);
                  }}
                >
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
            )),
          )}

          <button
            type="button"
            class="tile tile-add"
            on:click={() => openEditor("new")}
          >
            <div class="tile-art add-art">
              <span class="material-symbols-outlined">add</span>
            </div>
            <div class="tile-name">Add</div>
          </button>
        </div>

        <div class="newtab-foot">
          <span>
            <strong>Scramjet</strong> keeps every request rewritten and
            tunnelled through Wisp
          </span>
        </div>
      </div>

      {use(this.editorTarget).map((target) => editorFor(target))}
    </div>
  );
};

NewTab.style = css`
  :scope {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: transparent;
    color: #e9ebf5;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
    box-sizing: border-box;
    z-index: 6;
    animation: nt-in 0.18s ease-out;
  }
  @keyframes nt-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  :scope * {
    box-sizing: border-box;
  }
  .newtab-aurora {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(
      520px 260px at 50% 0%,
      rgba(124, 92, 255, 0.16),
      transparent 70%
    );
  }
  .newtab-inner {
    position: relative;
    width: min(760px, calc(100% - 40px));
    margin: 0 auto;
    padding: clamp(104px, 15vh, 168px) 0 44px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    margin-bottom: 6px;
    text-align: center;
  }
  .hero-logo {
    width: 58px;
    height: 58px;
    border-radius: 18px;
    filter: drop-shadow(0 14px 30px rgba(96, 92, 255, 0.4));
  }
  .hero-title {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
  }
  .hero-title-main {
    font-size: clamp(1.6rem, 4vw, 2.1rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    background: linear-gradient(100deg, #ffffff, #b9c0ff 70%, #8de9ff);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero-title-sub {
    font-size: 0.82rem;
    font-weight: 450;
    color: #8d95ad;
  }

  .search-form {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 7px 7px 8px;
    border-radius: 18px;
    background: rgba(20, 23, 38, 0.86);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow:
      0 20px 50px rgba(0, 0, 0, 0.45),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(14px);
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }
  .search-form:focus-within {
    border-color: rgba(124, 92, 255, 0.6);
    box-shadow:
      0 20px 50px rgba(0, 0, 0, 0.45),
      0 0 0 4px rgba(124, 92, 255, 0.15);
  }
  .search-glyph {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    font-size: 0.72rem;
    flex: none;
  }
  .search-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: #f2f4fb;
    font: inherit;
    font-size: 0.95rem;
    padding: 8px 4px;
    outline: none;
  }
  .search-input::placeholder {
    color: #767f96;
  }
  .search-submit {
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 13px;
    border: 0;
    cursor: pointer;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #7c5cff, #4f8bff);
    box-shadow: 0 10px 24px rgba(96, 92, 255, 0.36);
    transition: transform 0.12s ease;
  }
  .search-submit:hover {
    transform: translateY(-1px);
  }
  .search-submit:active {
    transform: translateY(0);
  }
  .search-submit .material-symbols-outlined {
    font-size: 18px;
    color: #fff;
  }

  .engine-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .engine-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 10px;
    border-radius: 13px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: #a9b1c6;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 560;
    cursor: pointer;
    transition:
      background 0.14s ease,
      color 0.14s ease,
      border-color 0.14s ease,
      transform 0.14s ease;
  }
  .engine-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #e6e9f5;
    transform: translateY(-1px);
  }
  .engine-btn.active {
    color: #fff;
    background: rgba(124, 92, 255, 0.18);
    border-color: rgba(124, 92, 255, 0.5);
    box-shadow: 0 8px 22px rgba(96, 92, 255, 0.22);
  }
  .engine-btn-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .shortcuts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding: 0 2px;
  }
  .shortcuts-title {
    font-size: 0.7rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #767f96;
    font-weight: 650;
  }
  .shortcuts-add {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    background: transparent;
    color: #9c8dff;
    font: inherit;
    font-size: 0.76rem;
    font-weight: 580;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 8px;
  }
  .shortcuts-add:hover {
    background: rgba(124, 92, 255, 0.12);
    color: #c2b8ff;
  }
  .shortcuts-add .material-symbols-outlined {
    font-size: 15px;
  }

  .shortcut-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(94px, 1fr));
    gap: 10px;
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 8px 10px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.035);
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition:
      transform 0.14s ease,
      background 0.14s ease,
      border-color 0.14s ease;
  }
  .tile:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.075);
    border-color: rgba(255, 255, 255, 0.14);
  }
  .tile-art {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
  }
  .tile-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    object-fit: contain;
    padding: 3px;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
    transition: transform 0.14s ease;
  }
  .tile:hover .tile-icon {
    transform: scale(1.06);
  }
  .tile-icon.failed {
    display: none;
  }
  .tile-fallback {
    position: absolute;
    inset: 2px;
    border-radius: 13px;
    display: none;
    place-items: center;
    font-size: 1rem;
    font-weight: 750;
    color: #fff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }
  .tile-fallback.shown,
  .tile-icon.failed + .tile-fallback {
    display: grid;
  }
  .tile-name {
    font-size: 0.74rem;
    font-weight: 540;
    color: #d5daea;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile-action {
    position: absolute;
    top: 5px;
    width: 20px;
    height: 20px;
    border-radius: 7px;
    border: 0;
    padding: 0;
    display: grid;
    place-items: center;
    background: rgba(10, 12, 20, 0.72);
    color: #b9c0d4;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.12s ease,
      background 0.12s ease;
  }
  .tile-action .material-symbols-outlined {
    font-size: 12px;
  }
  .tile-action.edit {
    right: 27px;
  }
  .tile-action.remove {
    right: 5px;
  }
  .tile:hover .tile-action {
    opacity: 1;
  }
  .tile-action:hover {
    background: rgba(124, 92, 255, 0.5);
    color: #fff;
  }
  .tile-action.remove:hover {
    background: rgba(255, 90, 90, 0.6);
  }
  .tile-add {
    border-style: dashed;
    background: transparent;
    color: #8b93a9;
  }
  .add-art {
    background: rgba(255, 255, 255, 0.05);
    color: #9aa2b8;
    box-shadow: none;
  }
  .tile-add:hover {
    background: rgba(124, 92, 255, 0.1);
    border-color: rgba(124, 92, 255, 0.4);
  }
  .tile-add:hover .add-art {
    color: #c2b8ff;
  }

  .newtab-foot {
    margin-top: 18px;
    text-align: center;
    font-size: 0.7rem;
    color: #626a7f;
  }
  .newtab-foot strong {
    color: #8b93a9;
    font-weight: 600;
  }

  @media (max-width: 560px) {
    .engine-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .newtab-inner {
      width: calc(100% - 24px);
    }
  }
`;

export default NewTab;
