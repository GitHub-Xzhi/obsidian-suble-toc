import { CachedMetadata, MarkdownView } from "obsidian";
import { HeadingItem, TaskItem } from "./types";
import { completeTask, getActiveHeadingIndex, getScroller, scrollToTarget } from "./dom";
import type SubtleTocPlugin from "./main";

type TocTab = "headings" | "tasks";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Extra hierarchy spread applied only to minimap widths above 100%. */
const MINIMAP_HIERARCHY_SPREAD = 0.5;

/** Leading list marker + checkbox of a task line, e.g. `- [ ] ` or `1. [ ] `. */
const TASK_MARKUP = /^\s*(?:[-*+]|\d+[.)])\s+\[.\]\s*/;

/** Strip the list/checkbox markup so only the task's text remains. */
function stripTaskMarkup(raw: string): string {
	return raw.replace(TASK_MARKUP, "").trim();
}

/** Strip markdown-escape backslashes (e.g. `1\.` → `1.`). */
const ESCAPE_RE = /\\([\s\S])/g;
function stripEscapeBackslashes(text: string): string {
	return text.replace(ESCAPE_RE, "$1");
}

/** Normalize a color value: ensure # prefix, expand 3-digit hex to 6-digit. */
function normalizeHexColor(raw: string): string {
	let c = raw.trim();
	if (!c) return "";
	if (!c.startsWith("#")) c = "#" + c;
	if (/^#[0-9a-fA-F]{3}$/.test(c)) {
		c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
	}
	return c;
}

/* ---- i18n ---------------------------------------------------------------- */

interface Locale {
	headingsTab: string;
	tasksTab: string;
	noHeadings: string;
	noTasks: string;
	untitled: string;
	emptyTask: string;
	openTasks: (n: number) => string;
	pinTooltip: string;
	unpinTooltip: string;
	searchTooltip: string;
	closeSearchTooltip: string;
	clearSearchTooltip: string;
	searchPlaceholder: string;
	noSearchResults: string;
	expandTooltip: string;
	collapseTooltip: string;
}

const LOCALE_EN: Locale = {
	headingsTab: "Headings",
	tasksTab: "Tasks",
	noHeadings: "No headings in this note.",
	noTasks: "No open tasks in this note.",
	untitled: "(untitled)",
	emptyTask: "(empty task)",
	openTasks: (n) => `${n} open task${n === 1 ? "" : "s"}`,
	pinTooltip: "Pin panel",
	unpinTooltip: "Unpin panel",
	searchTooltip: "Search headings",
	closeSearchTooltip: "Close heading search",
	clearSearchTooltip: "Clear search",
	searchPlaceholder: "Search headings...",
	noSearchResults: "No matching headings.",
	expandTooltip: "Expand all",
	collapseTooltip: "Collapse all",
};

const LOCALE_ZH: Locale = {
	headingsTab: "标题",
	tasksTab: "任务",
	noHeadings: "此笔记没有标题。",
	noTasks: "此笔记没有待办任务。",
	untitled: "（无标题）",
	emptyTask: "（空任务）",
	openTasks: (n) => `${n} 个待办任务`,
	pinTooltip: "固定面板",
	unpinTooltip: "取消固定",
	searchTooltip: "搜索标题",
	closeSearchTooltip: "关闭标题搜索",
	clearSearchTooltip: "清除搜索",
	searchPlaceholder: "搜索标题...",
	noSearchResults: "没有匹配的标题。",
	expandTooltip: "展开全部",
	collapseTooltip: "收起全部",
};

function getLocale(lang: string): Locale {
	return lang === "zh" ? LOCALE_ZH : LOCALE_EN;
}

/* ---- SVG helpers --------------------------------------------------------- */

type SvgChild = [tag: string, attrs: Record<string, string>];

/**
 * Append an inline Lucide-style icon. Drawn by hand rather than via `setIcon`
 * so it renders regardless of the host's icon-registry version.
 */
function createIcon(parent: HTMLElement, children: SvgChild[]): void {
	const svg = document.createElementNS(SVG_NS, "svg");
	const attrs: Record<string, string> = {
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "2",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
	};
	for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
	svg.classList.add("subtle-toc-icon");

	for (const [tag, childAttrs] of children) {
		const node = document.createElementNS(SVG_NS, tag);
		for (const [k, v] of Object.entries(childAttrs)) node.setAttribute(k, v);
		svg.appendChild(node);
	}

	parent.appendChild(svg);
}

/** Replace the children of an existing icon SVG element. */
function setIconChildren(svg: SVGSVGElement, children: SvgChild[]): void {
	while (svg.firstChild) svg.removeChild(svg.firstChild);
	for (const [tag, childAttrs] of children) {
		const node = document.createElementNS(SVG_NS, tag);
		for (const [k, v] of Object.entries(childAttrs)) node.setAttribute(k, v);
		svg.appendChild(node);
	}
}

/** Lucide "square-check". */
function createCheckboxIcon(parent: HTMLElement): void {
	createIcon(parent, [
		["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
		["path", { d: "m9 12 2 2 4-4" }],
	]);
}

/** Lucide "heading" (an "H"). */
function createHeadingIcon(parent: HTMLElement): void {
	createIcon(parent, [
		["path", { d: "M6 12h12" }],
		["path", { d: "M6 20V4" }],
		["path", { d: "M18 20V4" }],
	]);
}

/** Lucide "search". */
function createSearchIcon(parent: HTMLElement): void {
	createIcon(parent, [
		["circle", { cx: "11", cy: "11", r: "8" }],
		["path", { d: "m21 21-4.3-4.3" }],
	]);
}

/** Lucide "x". */
function createClearIcon(parent: HTMLElement): void {
	createIcon(parent, [
		["path", { d: "M18 6 6 18" }],
		["path", { d: "m6 6 12 12" }],
	]);
}

/** Lucide "pin". */
function pinIconChildren(): SvgChild[] {
	return [
		["line", { x1: "12", y1: "17", x2: "12", y2: "22" }],
		["path", { d: "M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" }],
	];
}

/** Lucide "pin-off". */
function pinOffIconChildren(): SvgChild[] {
	return [
		["line", { x1: "12", y1: "17", x2: "12", y2: "22" }],
		["path", { d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12" }],
		["path", { d: "M15 9.34V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0-1.33.51" }],
		["line", { x1: "2", y1: "2", x2: "22", y2: "22" }],
	];
}

/** Heading tree helpers: determine parent-child relationships from levels. */
function isParentHeading(headings: HeadingItem[], index: number): boolean {
	// A heading is a parent iff the very next heading in the list is deeper.
	// If the next heading is at the same or shallower level, this heading has
	// no direct children (any deeper headings further down belong to a
	// sibling, not to this heading).
	return index + 1 < headings.length && headings[index + 1].level > headings[index].level;
}

function getDescendants(headings: HeadingItem[], index: number): number[] {
	const result: number[] = [];
	const level = headings[index].level;
	for (let j = index + 1; j < headings.length; j++) {
		if (headings[j].level <= level) break;
		result.push(j);
	}
	return result;
}

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;

function normalizeSearchText(text: string): string {
	return text
		.normalize("NFKD")
		.replace(COMBINING_MARKS_RE, "")
		.toLocaleLowerCase()
		.replace(/\s+/g, "");
}

function getSearchTokens(query: string): string[] {
	return query
		.trim()
		.split(/\s+/)
		.map(normalizeSearchText)
		.filter(Boolean);
}

function isFuzzyMatch(haystack: string, needle: string): boolean {
	let from = 0;
	for (const char of needle) {
		const next = haystack.indexOf(char, from);
		if (next === -1) return false;
		from = next + char.length;
	}
	return true;
}

function headingMatchesSearch(heading: HeadingItem, tokens: string[]): boolean {
	if (tokens.length === 0) return true;
	const haystack = normalizeSearchText(heading.text);
	return tokens.every((token) => isFuzzyMatch(haystack, token));
}

/**
 * Owns all DOM and listeners for the floating TOC of a single MarkdownView.
 * The plugin creates one of these per active view and tears it down when the
 * active view changes.
 */
export class TocOverlay {
	private plugin: SubtleTocPlugin;
	readonly view: MarkdownView;

	private rootEl!: HTMLElement;
	private groupEl!: HTMLElement;
	private edgeEl!: HTMLElement;
	private minimapEl!: HTMLElement;
	private taskBadgeEl!: HTMLElement;
	private popoverEl!: HTMLElement;
	private tabsEl!: HTMLElement;
	private headingsTabEl!: HTMLElement;
	private tasksTabEl!: HTMLElement;
	private tasksCountEl!: HTMLElement;
	private listEl!: HTMLElement;
	private tasksListEl!: HTMLElement;
	private pinBtnIconEl!: SVGSVGElement;
	private searchBtnEl!: HTMLElement;
	private searchInputEl!: HTMLInputElement;
	private clearSearchBtnEl!: HTMLElement;
	private searchEmptyEl: HTMLElement | null = null;

	private headings: HeadingItem[] = [];
	private tasks: TaskItem[] = [];
	private dashEls: HTMLElement[] = [];
	private itemEls: HTMLElement[] = [];
	private taskEls: HTMLElement[] = [];
	/** Lines completed via the TOC this session — filtered out so a struck task
	 *  stays hidden on the next open even before the metadata cache catches up. */
	private completedLines = new Set<number>();
	private activeIndex = -1;
	/** Starts on the configured default tab, then follows the last-used one. */
	private activeTab: TocTab;
	private isOpen = false;
	private isPinned = false;
	private isSearchActive = false;
	private searchQuery = "";

	/** Tree-collapse state: which headings are parents, their descendants, and
	 *  which parent headings are currently expanded. Headings IN this set show
	 *  their children; headings NOT in this set hide their children. All parent
	 *  headings start in this set (expanded by default). */
	private parentIndices: boolean[] = [];
	private descendantIndices: number[][] = [];
	private expandedSet = new Set<number>();

	private scroller: HTMLElement | null = null;
	private closeTimer: number | null = null;
	private rafPending = false;
	private readonly onScroll = () => this.scheduleActiveUpdate();
	/** True during TOC-driven scrolling; suppresses the popover list's
	 *  active-item auto-scroll so it doesn't slide under the cursor. */
	private navigating = false;
	private navTimer: number | null = null;
	/** Scroll position to restore when hover preview ends without a click. */
	private hoverPreviewOrigin: { scroller: HTMLElement; scrollTop: number } | null = null;
	/** Deferred restore lets the pointer cross directly between heading rows. */
	private hoverPreviewRestoreFrame: number | null = null;

	constructor(plugin: SubtleTocPlugin, view: MarkdownView) {
		this.plugin = plugin;
		this.view = view;
		this.activeTab = plugin.settings.defaultTab;
	}

	private get settings() {
		return this.plugin.settings;
	}

	// ---- lifecycle ---------------------------------------------------------

	mount(): void {
		const host = this.view.contentEl;
		host.addClass("subtle-toc-host");

		this.rootEl = host.createDiv({ cls: "subtle-toc-root" });
		this.groupEl = this.rootEl.createDiv({ cls: "subtle-toc-group" });

		// The edge stacks the dashes minimap over the task badge (either can be
		// hidden). Kept out of the minimap's clipped/max-height box.
		this.edgeEl = this.groupEl.createDiv({ cls: "subtle-toc-edge" });
		this.minimapEl = this.edgeEl.createDiv({ cls: "subtle-toc-minimap" });
		this.taskBadgeEl = this.edgeEl.createDiv({ cls: "subtle-toc-task-badge is-hidden" });
		this.popoverEl = this.groupEl.createDiv({ cls: "subtle-toc-popover" });

		this.buildPopoverChrome();
		this.bindGroupEvents();
		this.applySide();
		this.applyMinimapSizing();
		this.applyPanelHeight();
	}

	/**
	 * Pin the dash height (and gap) to a whole number of *device* pixels so the
	 * 2px hairlines render as solid blocks instead of antialiasing to different
	 * apparent heights under fractional display scaling (e.g. Windows 125%).
	 */
	private applyMinimapSizing(): void {
		const dpr = window.devicePixelRatio || 1;
		const snap = (cssPx: number, minDevicePx: number) =>
			Math.max(minDevicePx, Math.round(cssPx * dpr)) / dpr;
		const widthScale = Math.min(2, Math.max(0.5, this.settings.minimapWidthScale / 100));
		const verticalScale = Math.min(
			2,
			Math.max(0.5, this.settings.minimapVerticalScale / 100),
		);
		const width = (cssPx: number, scale = widthScale) =>
			`${Number((cssPx * scale).toFixed(2))}px`;
		const levelWidths = [14, 12.4, 10.8, 9.2, 7.6, 6];
		const extraScale = Math.max(0, widthScale - 1);

		this.minimapEl.style.setProperty("--toc-dash-h", `${snap(2 * verticalScale, 1)}px`);
		this.minimapEl.style.setProperty("--toc-gap", `${snap(6 * verticalScale, 1)}px`);
		this.minimapEl.style.setProperty("--toc-dash-w", width(16));
		this.minimapEl.style.setProperty("--toc-dash-hover-w", width(22));
		this.minimapEl.style.setProperty("--toc-dash-active-w", width(14));
		levelWidths.forEach((base, index) => {
			// Above 100%, shallow headings receive progressively more growth. H1
			// gets the largest bonus and H6 keeps the selected base scale.
			const hierarchy = (levelWidths.length - 1 - index) / (levelWidths.length - 1);
			const levelScale =
				widthScale + extraScale * MINIMAP_HIERARCHY_SPREAD * hierarchy;
			this.minimapEl.style.setProperty(
				`--toc-level-${index + 1}-w`,
				width(base, levelScale),
			);
			this.minimapEl.style.setProperty(
				`--toc-active-level-${index + 1}-w`,
				width(14, levelScale),
			);
		});
	}

	unmount(): void {
		this.restoreHoverPreview(false);
		this.detachScroller();
		if (this.closeTimer !== null) window.clearTimeout(this.closeTimer);
		if (this.navTimer !== null) window.clearTimeout(this.navTimer);
		this.rootEl?.remove();
		this.view.contentEl.removeClass("subtle-toc-host");
	}

	// ---- DOM construction --------------------------------------------------

	private buildPopoverChrome(): void {
		const body = this.popoverEl.createDiv({ cls: "subtle-toc-body" });
		const t = getLocale(this.settings.language);

		// -- toolbar: expand/collapse-all + search + pin -------------------------
		const toolbar = body.createDiv({ cls: "subtle-toc-toolbar" });

		const expandBtn = toolbar.createDiv({ cls: "subtle-toc-toolbar-btn subtle-toc-expand-all-btn" });
		// Two separate SVGs — each has two well-spaced chevrons
		// 尖头相对 (∨ top + ∧ bottom, tips facing inward) = collapse all
		createIcon(expandBtn, [
			["path", { d: "M7 5 L12 10 L17 5", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
			["path", { d: "M7 19 L12 14 L17 19", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
		]);
		expandBtn.lastElementChild!.classList.add("collapse-icon");
		// 底部相对 (∧ top + ∨ bottom, bases facing inward) = expand all
		createIcon(expandBtn, [
			["path", { d: "M7 10 L12 5 L17 10", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
			["path", { d: "M7 14 L12 19 L17 14", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
		]);
		expandBtn.lastElementChild!.classList.add("expand-icon");
		expandBtn.setAttribute("aria-label", t.collapseTooltip);
		expandBtn.addEventListener("mousedown", (e) => e.preventDefault());
		expandBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleCollapse();
		});

		this.searchBtnEl = toolbar.createDiv({ cls: "subtle-toc-toolbar-btn subtle-toc-search-btn" });
		createSearchIcon(this.searchBtnEl);
		this.searchBtnEl.setAttribute("aria-label", t.searchTooltip);
		this.searchBtnEl.addEventListener("mousedown", (e) => e.preventDefault());
		this.searchBtnEl.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleSearch();
		});

		const pinBtn = toolbar.createDiv({ cls: "subtle-toc-toolbar-btn subtle-toc-pin-btn" });
		createIcon(pinBtn, pinIconChildren());
		this.pinBtnIconEl = pinBtn.querySelector("svg")!;
		pinBtn.setAttribute("aria-label", t.pinTooltip);
		pinBtn.addEventListener("mousedown", (e) => e.preventDefault());
		pinBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.togglePin();
		});

		const searchRow = body.createDiv({ cls: "subtle-toc-search-row" });
		this.searchInputEl = searchRow.createEl("input", {
			cls: "subtle-toc-search-input",
			attr: {
				type: "search",
				placeholder: t.searchPlaceholder,
				autocomplete: "off",
				spellcheck: "false",
			},
		});
		this.searchInputEl.addEventListener("mousedown", (e) => e.stopPropagation());
		this.searchInputEl.addEventListener("click", (e) => e.stopPropagation());
		this.searchInputEl.addEventListener("input", () => {
			this.searchQuery = this.searchInputEl.value;
			this.updateItemVisibility();
		});
		this.searchInputEl.addEventListener("keydown", (e) => this.handleSearchKeydown(e));
		this.clearSearchBtnEl = searchRow.createDiv({ cls: "subtle-toc-search-clear-btn is-hidden" });
		createClearIcon(this.clearSearchBtnEl);
		this.clearSearchBtnEl.setAttribute("aria-label", t.clearSearchTooltip);
		this.clearSearchBtnEl.addEventListener("mousedown", (e) => e.preventDefault());
		this.clearSearchBtnEl.addEventListener("click", (e) => {
			e.stopPropagation();
			this.clearSearch(true);
		});

		// -- tabs ------------------------------------------------------------
		this.tabsEl = body.createDiv({ cls: "subtle-toc-tabs" });
		// The default tab leads the tab bar (createTab appends in call order).
		if (this.settings.defaultTab === "tasks") {
			this.tasksTabEl = this.createTab("tasks", t.tasksTab, t);
			this.headingsTabEl = this.createTab("headings", t.headingsTab, t);
		} else {
			this.headingsTabEl = this.createTab("headings", t.headingsTab, t);
			this.tasksTabEl = this.createTab("tasks", t.tasksTab, t);
		}

		this.listEl = body.createDiv({ cls: "subtle-toc-list subtle-toc-headings" });
		this.tasksListEl = body.createDiv({ cls: "subtle-toc-list subtle-toc-tasks" });
	}

	private createTab(tab: TocTab, label: string, t: Locale): HTMLElement {
		const btn = this.tabsEl.createDiv({ cls: "subtle-toc-tab" });
		const icon = btn.createSpan({ cls: "subtle-toc-tab-icon" });
		if (tab === "tasks") createCheckboxIcon(icon);
		else createHeadingIcon(icon);
		btn.createSpan({ cls: "subtle-toc-tab-label", text: label });
		if (tab === "tasks") {
			this.tasksCountEl = btn.createSpan({ cls: "subtle-toc-tab-count" });
		}
		// Don't let the click pull focus off the editor (would swallow it) or bubble
		// up to the group's open/close handlers.
		btn.addEventListener("mousedown", (e) => e.preventDefault());
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.selectTab(tab);
		});
		return btn;
	}

	/** Switch the visible list; the tab bar itself only appears when both exist. */
	private selectTab(tab: TocTab): void {
		if (tab !== "headings") {
			this.restoreHoverPreview();
			if (this.isSearchActive) this.setSearchActive(false);
		}
		this.activeTab = tab;
		this.rootEl.toggleClass("is-tab-headings", tab === "headings");
		this.rootEl.toggleClass("is-tab-tasks", tab === "tasks");
		this.headingsTabEl?.toggleClass("is-active", tab === "headings");
		this.tasksTabEl?.toggleClass("is-active", tab === "tasks");
	}

	/** Re-apply the active tab (keeping the last-used one when it has content, or
	 *  falling back to the tab that does). Always calls selectTab so the tab's
	 *  visibility class is in sync — including the very first open. */
	private ensureValidTab(): void {
		const hasHeadings = this.headings.length > 0;
		const hasTasks = this.tasks.length > 0;
		let tab = this.activeTab;
		if (tab === "headings" && !hasHeadings && hasTasks) tab = "tasks";
		else if (tab === "tasks" && !hasTasks && hasHeadings) tab = "headings";
		this.selectTab(tab);
	}

	private bindGroupEvents(): void {
		const trigger = this.settings.openTrigger;

		// Both the dashes and the task badge just open the popover on whatever tab
		// was last active — the tab choice is preserved across opens.
		for (const el of [this.minimapEl, this.taskBadgeEl]) {
			el.addEventListener("mouseenter", () => {
				if (trigger === "hover") this.open();
			});
			el.addEventListener("click", (e) => {
				e.stopPropagation();
				if (trigger === "click") this.toggle();
			});
			el.addEventListener("mouseleave", () => this.scheduleClose());
		}

		this.popoverEl.addEventListener("mouseenter", () => this.cancelClose());
		this.popoverEl.addEventListener("mouseleave", (e) => this.onPopoverLeave(e));
	}

	/** Leaving sideways, back toward the note, reads as "done with it" — close at
	 *  once. Any other exit keeps the grace period, so the popover still survives
	 *  the cursor falling outside when a shorter tab shrinks it. */
	private onPopoverLeave(e: MouseEvent): void {
		if (this.isPinned) return;
		const rect = this.popoverEl.getBoundingClientRect();
		const towardNote =
			this.settings.side === "left" ? e.clientX > rect.right : e.clientX < rect.left;
		if (!towardNote) {
			this.scheduleClose();
			return;
		}
		this.cancelClose();
		this.close();
	}

	private applySide(): void {
		this.rootEl.toggleClass("is-left", this.settings.side === "left");
		this.rootEl.toggleClass("is-right", this.settings.side === "right");
	}

	private applyTextWrap(): void {
		this.rootEl.toggleClass("is-multiline", this.settings.multiLine);
	}

	private applyPopoverWidth(): void {
		const width = Math.min(480, Math.max(160, this.settings.popoverWidth));
		this.rootEl.style.setProperty("--toc-popover-width", `${width}px`);
	}

	private applyPanelHeight(): void {
		const h = this.settings.panelHeight;
		if (h > 0) {
			this.popoverEl.style.setProperty("--toc-panel-height", `${h}px`);
		} else {
			this.popoverEl.style.removeProperty("--toc-panel-height");
		}
	}

	private applyOpacity(): void {
		const bgOpacity = Math.min(100, Math.max(10, this.settings.panelBgOpacity));
		this.popoverEl.style.setProperty("--toc-panel-opacity", `${bgOpacity}%`);
		const textOpacity = Math.min(100, Math.max(10, this.settings.headingOpacity));
		this.popoverEl.style.setProperty("--toc-heading-opacity", String(textOpacity / 100));
	}

	private applyToolbarVisibility(): void {
		const toolbar = this.popoverEl.querySelector<HTMLElement>(".subtle-toc-toolbar");
		toolbar?.toggleClass("is-hidden", !this.settings.showToolbar);
	}

	private applyTabsVisibility(): void {
		const tabs = this.popoverEl.querySelector<HTMLElement>(".subtle-toc-tabs");
		tabs?.toggleClass("is-hidden", !this.settings.showTabs);
	}

	private applyPinned(): void {
		this.rootEl.toggleClass("is-pinned", this.isPinned);
		const t = getLocale(this.settings.language);
		if (this.pinBtnIconEl) {
			setIconChildren(
				this.pinBtnIconEl,
				this.isPinned ? pinOffIconChildren() : pinIconChildren(),
			);
			const btn = this.pinBtnIconEl.parentElement;
			if (btn) btn.setAttribute("aria-label", this.isPinned ? t.unpinTooltip : t.pinTooltip);
		}
	}

	private syncSearchChrome(): void {
		const t = getLocale(this.settings.language);
		this.rootEl.toggleClass("is-search-active", this.isSearchActive);
		this.searchBtnEl?.toggleClass("is-active", this.isSearchActive);
		this.searchBtnEl?.setAttribute(
			"aria-label",
			this.isSearchActive ? t.closeSearchTooltip : t.searchTooltip,
		);
		if (this.searchInputEl) {
			this.searchInputEl.placeholder = t.searchPlaceholder;
			if (this.searchInputEl.value !== this.searchQuery) {
				this.searchInputEl.value = this.searchQuery;
			}
		}
		this.clearSearchBtnEl?.setAttribute("aria-label", t.clearSearchTooltip);
		this.clearSearchBtnEl?.toggleClass("is-hidden", this.searchQuery.length === 0);
	}

	private syncSearchAvailability(): void {
		const hasHeadings = this.headings.length > 0;
		this.searchBtnEl?.toggleClass("is-hidden", !hasHeadings);
		if (!hasHeadings) {
			this.isSearchActive = false;
			this.searchQuery = "";
		}
		this.syncSearchChrome();
	}

	private toggleSearch(): void {
		this.setSearchActive(!this.isSearchActive, true);
	}

	private setSearchActive(active: boolean, focus = false): void {
		this.isSearchActive = active;
		if (!active) this.searchQuery = "";
		this.syncSearchChrome();
		if (active) {
			this.selectTab("headings");
			if (focus) {
				requestAnimationFrame(() => {
					this.searchInputEl?.focus();
					this.searchInputEl?.select();
				});
			}
		}
		this.updateItemVisibility();
	}

	private clearSearch(focus = false): void {
		this.searchQuery = "";
		this.syncSearchChrome();
		this.updateItemVisibility();
		if (focus) requestAnimationFrame(() => this.searchInputEl?.focus());
	}

	private handleSearchKeydown(e: KeyboardEvent): void {
		e.stopPropagation();
		if (e.key === "Escape") {
			e.preventDefault();
			if (this.searchQuery) {
				this.clearSearch(true);
			} else {
				this.setSearchActive(false);
			}
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			const index = this.itemEls.findIndex((el) => !el.hasClass("is-hidden"));
			if (index >= 0) this.navigate(index);
		}
	}

	private applyCollapsed(): void {
		this.updateItemVisibility();
		this.updateToolbarChevron();
	}

	/** Recompute which heading items are visible based on the per-heading
	 *  expanded state. A heading is hidden if any DIRECT ancestor (walking
	 *  up the tree level by level) is NOT in the expanded set. */
	private updateItemVisibility(): void {
		const searchTokens = this.isSearchActive ? getSearchTokens(this.searchQuery) : [];
		let visibleSearchMatches = 0;
		for (let i = 0; i < this.headings.length; i++) {
			let hiddenByCollapse = false;
			const matchesSearch = headingMatchesSearch(this.headings[i], searchTokens);
			if (matchesSearch) visibleSearchMatches++;
			if (searchTokens.length === 0) {
				let checkLevel = this.headings[i].level;
				for (let j = i - 1; j >= 0; j--) {
					if (this.headings[j].level < checkLevel) {
						// Found the direct parent at this level
						if (!this.expandedSet.has(j)) {
							hiddenByCollapse = true;
							break;
						}
						checkLevel = this.headings[j].level;
						if (checkLevel <= 1) break;
					}
				}
			}
			this.itemEls[i]?.toggleClass("is-hidden", hiddenByCollapse || !matchesSearch);
		}
		this.searchEmptyEl?.toggleClass(
			"is-hidden",
			searchTokens.length === 0 || visibleSearchMatches > 0,
		);
	}

	/** Update the toolbar expand-all button icon to reflect global state. */
	private updateToolbarChevron(): void {
		const baseLevel = this.headings.reduce((min, h) => Math.min(min, h.level), 6);
		const allTopCollapsed = this.parentIndices.length > 0 &&
			this.parentIndices.every(
				(isP, i) => !isP || this.headings[i].level > baseLevel || !this.expandedSet.has(i),
			);
		const btn = this.popoverEl.querySelector<HTMLElement>(".subtle-toc-expand-all-btn");
		btn?.toggleClass("is-all-collapsed", allTopCollapsed);
		const t = getLocale(this.settings.language);
		if (btn) btn.setAttribute("aria-label", allTopCollapsed ? t.expandTooltip : t.collapseTooltip);
	}

	/** Publish the custom active-tab color; removed when unset so the CSS falls
	 *  back to the theme's own value. */
	private applyColors(): void {
		const color = this.settings.activeTabBgColor;
		if (color) this.rootEl.style.setProperty("--toc-active-tab-bg", color);
		else this.rootEl.style.removeProperty("--toc-active-tab-bg");
	}

	// ---- pin / expand-collapse --------------------------------------------

	private togglePin(): void {
		if (this.isPinned) {
			// Unpin → close the popover
			this.isPinned = false;
			this.applyPinned();
			this.close();
		} else {
			// Pin → open if not already, then lock it
			this.isPinned = true;
			this.applyPinned();
			this.open();
		}
	}

	private toggleCollapse(): void {
		const baseLevel = this.headings.reduce((min, h) => Math.min(min, h.level), 6);
		const allTopExpanded = this.parentIndices.every(
			(isP, i) => !isP || this.headings[i].level > baseLevel || this.expandedSet.has(i),
		);
		console.log(`[SubtleTOC] toolbar toggleCollapse: baseLevel=${baseLevel}, allTopExpanded=${allTopExpanded}, expandedSet before:`, [...this.expandedSet]);
		if (allTopExpanded) {
			// Collapse all: clear the entire expanded set
			this.expandedSet.clear();
			console.log("[SubtleTOC]   → COLLAPSE ALL (cleared expandedSet)");
		} else {
			// Expand all: add ALL parents to the expanded set
			this.parentIndices.forEach((isP, i) => { if (isP) this.expandedSet.add(i); });
			console.log("[SubtleTOC]   → EXPAND ALL (added all parents)");
		}
		console.log("[SubtleTOC] expandedSet after toolbar:", [...this.expandedSet]);
		// Update all per-item toggle visuals to match the new expanded state
		this.parentIndices.forEach((isP, i) => {
			if (isP) {
				const toggle = this.itemEls[i]?.querySelector<HTMLElement>(".subtle-toc-toggle");
				toggle?.toggleClass("is-expanded", this.expandedSet.has(i));
			}
		});
		this.applyCollapsed();
	}

	// ---- data refresh ------------------------------------------------------

	/** Re-read headings from the metadata cache and rebuild everything. */
	refresh(): void {
		// Rebuilding the list removes its hover listeners, so finish any preview
		// before replacing the rows.
		this.restoreHoverPreview(false);
		this.applySide();
		this.applyColors();
		this.applyTextWrap();
		this.applyPopoverWidth();
		this.applyPanelHeight();
		this.applyOpacity();
		this.applyToolbarVisibility();
		this.applyTabsVisibility();
		this.applyMinimapSizing();
		this.rebindScroller();

		const file = this.view.file;
		const cache = file ? this.plugin.app.metadataCache.getFileCache(file) : null;

		const { minLevel, maxLevel, show, showMinimap } = this.settings;
		this.headings =
			show === "tasks"
				? []
				: (cache?.headings ?? [])
						.filter((h) => h.level >= minLevel && h.level <= maxLevel)
						.map((h) => ({
							level: h.level,
							text: stripEscapeBackslashes(h.heading),
							line: h.position.start.line,
						}));

		// Compute parent-child tree for per-item collapse toggles.
		this.parentIndices = this.headings.map((_, i) => isParentHeading(this.headings, i));
		this.descendantIndices = this.headings.map((_, i) => getDescendants(this.headings, i));
		// Ensure all current parents are in the expanded set (expanded by default).
		// Remove stale entries for headings that are no longer parents.
		for (const idx of this.expandedSet) {
			if (!this.parentIndices[idx]) this.expandedSet.delete(idx);
		}
		this.parentIndices.forEach((isP, i) => { if (isP) this.expandedSet.add(i); });
		console.log("[SubtleTOC] refresh:", this.headings.map((h, i) => `[${i}] L${h.level} "${h.text}" parent=${this.parentIndices[i]}`));
		console.log("[SubtleTOC] expandedSet after refresh:", [...this.expandedSet]);

		// While the popover is open, keep the current task snapshot so completing a
		// task strikes its row instead of yanking it out; it's rebuilt on the next
		// open(). Heading level range deliberately does not apply to tasks.
		if (!this.isOpen) this.refreshTasks(cache);

		const hasHeadings = this.headings.length > 0;
		const hasTasks = this.tasks.length > 0;

		this.rootEl.toggleClass("is-empty", !hasHeadings && !hasTasks);
		this.headingsTabEl.toggleClass("is-hidden", !hasHeadings);
		this.syncSearchAvailability();
		// Dashes honor the "show minimap" toggle; the badge's visibility is set in
		// refreshTasks().
		this.minimapEl.toggleClass("is-hidden", !showMinimap || !hasHeadings);

		// Preserve the last-used tab across opens; only correct it when the current
		// tab has no content in this note. Skipped while open so a background
		// refresh never yanks the popover to another tab.
		if (!this.isOpen) this.ensureValidTab();

		this.buildMinimap();
		this.buildList();
		this.updateItemVisibility();
		this.updateToolbarChevron();
		this.activeIndex = -1;
		this.updateActive();

		if (!hasHeadings && !hasTasks) this.close();
	}

	/** Recompute the open-task snapshot and rebuild its list + edge badge. */
	private refreshTasks(cache: CachedMetadata | null): void {
		const { show, showMinimap, showTasksInMinimap } = this.settings;
		this.tasks = show === "headings" ? [] : this.readOpenTasks(cache);

		const hasTasks = this.tasks.length > 0;
		this.tasksTabEl.toggleClass("is-hidden", !hasTasks);
		this.tasksCountEl?.setText(String(this.tasks.length));
		// With no headings the badge is the only way to open the popover, so the
		// toggle only suppresses it while the dashes can stand in as the trigger.
		const suppressed = !showTasksInMinimap && this.headings.length > 0;
		this.taskBadgeEl.toggleClass("is-hidden", !showMinimap || !hasTasks || suppressed);
		this.buildTaskBadge();
		this.buildTaskList();
	}

	/** Open tasks (unchecked checkboxes) of the active file, in document order. */
	private readOpenTasks(cache: CachedMetadata | null): TaskItem[] {
		const items = cache?.listItems ?? [];
		const openLines = items.filter((it) => it.task === " ").map((it) => it.position.start.line);

		// Reconcile the completed-bridge: a line stays hidden only while the cache
		// still reports it open (the lag between our edit and the reparse). Once
		// the cache catches up — done, removed, or re-opened — drop it, so a task
		// unchecked in the note reappears here.
		if (this.completedLines.size > 0) {
			const stillOpen = new Set(openLines);
			for (const line of this.completedLines) {
				if (!stillOpen.has(line)) this.completedLines.delete(line);
			}
		}

		const lines = this.view.getViewData().split("\n");
		return items
			.filter((it) => it.task === " " && !this.completedLines.has(it.position.start.line))
			.map((it) => {
				const line = it.position.start.line;
				return { text: stripTaskMarkup(lines[line] ?? ""), line };
			});
	}

	private buildMinimap(): void {
		this.minimapEl.empty();
		this.dashEls = this.headings.map((h, i) => {
			const dash = this.minimapEl.createDiv({
				cls: `subtle-toc-dash subtle-toc-level-${h.level}`,
			});
			dash.setAttribute("aria-label", h.text);
			dash.addEventListener("click", (e) => {
				e.stopPropagation();
				this.navigate(i);
			});
			dash.addEventListener("mouseenter", () => this.peek(i));
			return dash;
		});
	}

	/** The checkbox + open-task count shown on the edge (below the dashes). */
	private buildTaskBadge(): void {
		const t = getLocale(this.settings.language);
		const n = this.tasks.length;
		this.taskBadgeEl.empty();
		createCheckboxIcon(this.taskBadgeEl);
		this.taskBadgeEl.createSpan({ cls: "subtle-toc-task-badge-count", text: String(n) });
		this.taskBadgeEl.setAttribute("aria-label", t.openTasks(n));
	}

	private buildList(): void {
		const t = getLocale(this.settings.language);
		this.listEl.empty();
		this.searchEmptyEl = null;
		// Indent relative to the shallowest heading present, so the top level
		// (H1, or H2 in notes that skip H1) sits flush with no wasted indent.
		const baseLevel = this.headings.reduce((min, h) => Math.min(min, h.level), 6);
		this.itemEls = this.headings.map((h, i) => {
			const item = this.listEl.createDiv({
				cls: `subtle-toc-item subtle-toc-level-${h.level}`,
			});
			item.style.setProperty("--toc-indent", String(h.level - baseLevel));

			// Per-item expand/collapse toggle for parent headings
			if (this.parentIndices[i]) {
				const toggle = item.createDiv({ cls: "subtle-toc-toggle" });
				toggle.createSpan({ cls: "subtle-toc-toggle-arrow" });
				toggle.toggleClass("is-expanded", this.expandedSet.has(i));
				const onClick = (e: MouseEvent) => {
					e.stopPropagation();
					this.toggleCollapseAt(i);
				};
				toggle.addEventListener("mousedown", (e) => e.preventDefault());
				toggle.addEventListener("click", onClick);
			}

			const text = h.text || t.untitled;
			item.createSpan({ cls: "subtle-toc-item-text", text });

			// Level badge (H1-H6) on the right side
			if (this.settings.showLevelBadges) {
				const badge = item.createSpan({
					cls: "subtle-toc-level-badge",
					text: `H${h.level}`,
				});
				const rawColor = this.settings.headingColors[h.level - 1] || "";
				const color = normalizeHexColor(rawColor);
				if (color) badge.style.setProperty("--badge-color", color);
			}

			// Single-line rows cut long text, so the full version lives in a
			// tooltip; wrapped rows already show all of it.
			if (!this.settings.multiLine) item.setAttribute("aria-label", text);
			item.addEventListener("mouseenter", () => this.previewHeadingOnHover(i));
			item.addEventListener("mouseleave", () => this.scheduleHoverPreviewRestore());
			item.addEventListener("click", () => this.navigate(i));
			return item;
		});

		if (this.headings.length === 0) {
			this.listEl.createDiv({
				cls: "subtle-toc-empty-msg",
				text: t.noHeadings,
			});
		} else {
			this.searchEmptyEl = this.listEl.createDiv({
				cls: "subtle-toc-empty-msg subtle-toc-search-empty is-hidden",
				text: t.noSearchResults,
			});
		}
	}

	/** Toggle the collapsed state of a single parent heading. */
	private toggleCollapseAt(index: number): void {
		console.log(`[SubtleTOC] toggleCollapseAt(${index}) "${this.headings[index]?.text}" L${this.headings[index]?.level}, expandedSet before:`, [...this.expandedSet]);
		if (this.expandedSet.has(index)) {
			// Currently expanded → collapse: remove from set
			this.expandedSet.delete(index);
			console.log(`[SubtleTOC]   → was expanded, now COLLAPSED (removed ${index})`);
		} else {
			// Currently collapsed → expand: add to set, and ensure DIRECT
			// ancestors are also expanded so this heading becomes visible.
			this.expandedSet.add(index);
			console.log(`[SubtleTOC]   → was collapsed, now EXPANDED (added ${index})`);
			let checkLevel = this.headings[index].level;
			for (let j = index - 1; j >= 0; j--) {
				if (this.headings[j].level < checkLevel) {
					// Found a direct ancestor
					if (!this.expandedSet.has(j)) {
						this.expandedSet.add(j);
						const t = this.itemEls[j]?.querySelector<HTMLElement>(".subtle-toc-toggle");
						t?.toggleClass("is-expanded", true);
						console.log(`[SubtleTOC]   → also expanded ancestor [${j}] "${this.headings[j].text}"`);
					}
					checkLevel = this.headings[j].level;
					if (checkLevel <= 1) break;
				}
			}
		}
		// Update this item's toggle visual
		const item = this.itemEls[index];
		const toggle = item?.querySelector<HTMLElement>(".subtle-toc-toggle");
		toggle?.toggleClass("is-expanded", this.expandedSet.has(index));
		// Recompute visibility for all items
		this.updateItemVisibility();
		console.log(`[SubtleTOC] expandedSet after:`, [...this.expandedSet]);
		console.log(`[SubtleTOC] visibility:`, this.headings.map((h, i) => `[${i}] "${h.text}" hidden=${this.itemEls[i]?.hasClass("is-hidden")}`));
	}

	private buildTaskList(): void {
		const t = getLocale(this.settings.language);
		this.tasksListEl.empty();
		const withCheckboxes = this.settings.showTaskCheckboxes;
		this.taskEls = this.tasks.map((task, i) => {
			const item = this.tasksListEl.createDiv({
				cls: "subtle-toc-item subtle-toc-task-item",
			});
			if (withCheckboxes) {
				const box = item.createDiv({ cls: "subtle-toc-task-check" });
				box.setAttribute("role", "checkbox");
				box.setAttribute("aria-checked", "false");
				// The checkbox completes the task; keep that click from also
				// navigating or stealing the editor's focus.
				box.addEventListener("mousedown", (e) => e.preventDefault());
				box.addEventListener("click", (e) => {
					e.stopPropagation();
					this.completeTaskAt(i, item);
				});
			}
			const text = task.text || t.emptyTask;
			item.createSpan({ cls: "subtle-toc-item-text", text });
			if (!this.settings.multiLine) item.setAttribute("aria-label", text);
			// Keep focus on the editor so a single click navigates (no focus-steal
			// that would swallow the click on this floating overlay).
			item.addEventListener("mousedown", (e) => e.preventDefault());
			item.addEventListener("click", () => this.navigateTask(i));
			return item;
		});

		if (this.tasks.length === 0) {
			this.tasksListEl.createDiv({
				cls: "subtle-toc-empty-msg",
				text: t.noTasks,
			});
		}
	}

	/**
	 * Complete the task at `index`: flip it done in the note and strike its row.
	 * The row stays (struck) until the next open() so the list doesn't reflow
	 * under the cursor; `completedLines` keeps it hidden from then on.
	 */
	private completeTaskAt(index: number, itemEl: HTMLElement): void {
		const task = this.tasks[index];
		if (!task || itemEl.hasClass("is-done")) return;
		if (!completeTask(this.view, task.line)) return;
		this.completedLines.add(task.line);
		itemEl.addClass("is-done");
		itemEl
			.querySelector<HTMLElement>(".subtle-toc-task-check")
			?.setAttribute("aria-checked", "true");
		// Reflect the completion in the tab count right away (the struck row itself
		// stays until the next open).
		const remaining = this.taskEls.filter((el) => !el.hasClass("is-done")).length;
		this.tasksCountEl?.setText(String(remaining));
	}

	// ---- active heading tracking ------------------------------------------

	private rebindScroller(): void {
		const next = getScroller(this.view);
		if (next === this.scroller) return;
		this.detachScroller();
		this.scroller = next;
		this.scroller?.addEventListener("scroll", this.onScroll, { passive: true });
	}

	private detachScroller(): void {
		this.scroller?.removeEventListener("scroll", this.onScroll);
		this.scroller = null;
	}

	private scheduleActiveUpdate(): void {
		if (this.rafPending) return;
		this.rafPending = true;
		requestAnimationFrame(() => {
			this.rafPending = false;
			this.updateActive();
		});
	}

	private updateActive(): void {
		this.setActive(getActiveHeadingIndex(this.view, this.headings));
	}

	/** Move the active highlight to `next`, always clearing the previous one. */
	private setActive(next: number): void {
		if (next === this.activeIndex) return;

		if (this.activeIndex >= 0) {
			this.dashEls[this.activeIndex]?.removeClass("is-active");
			this.itemEls[this.activeIndex]?.removeClass("is-active");
		}
		this.activeIndex = next;
		if (next >= 0) {
			this.dashEls[next]?.addClass("is-active");
			const item = this.itemEls[next];
			if (item) {
				item.addClass("is-active");
				// Skip while the TOC is navigating: the active heading can sweep past
				// the intermediate ones as the note scrolls, and auto-scrolling the
				// list to each would slide it under the cursor.
				if (this.isOpen && !this.navigating) {
					item.scrollIntoView({ block: "nearest" });
				}
			}
		}
	}

	// ---- interactions ------------------------------------------------------

	/** Mark a TOC-driven scroll in progress so the popover list stays put while
	 *  the active heading sweeps through the ones between here and the target;
	 *  otherwise its auto-scroll (see setActive) slides it under the cursor. The
	 *  window covers the scroll animation plus its trailing scroll events. */
	private beginNavigation(): void {
		this.navigating = true;
		if (this.navTimer !== null) window.clearTimeout(this.navTimer);
		this.navTimer = window.setTimeout(() => {
			this.navigating = false;
			this.navTimer = null;
		}, 400);
	}

	private navigate(index: number): void {
		const heading = this.headings[index];
		if (!heading) return;
		this.commitHoverPreview();
		this.beginNavigation();
		scrollToTarget(this.view, heading, this.settings.smoothScroll);
		// optimistic highlight; the scroll listener will confirm/correct
		this.setActive(index);
	}

	/** Temporarily show a hovered heading without moving the editor cursor or
	 *  flashing it. Leaving the heading rows restores the original viewport. */
	private previewHeadingOnHover(index: number): void {
		if (!this.settings.scrollToHeadingOnHover) return;
		const heading = this.headings[index];
		if (!heading) return;
		this.cancelHoverPreviewRestore();
		if (!this.hoverPreviewOrigin && this.scroller) {
			this.hoverPreviewOrigin = {
				scroller: this.scroller,
				scrollTop: this.scroller.scrollTop,
			};
		}
		this.beginNavigation();
		scrollToTarget(this.view, heading, false, "heading", false);
		this.setActive(index);
	}

	/** Delay restoration by one frame so moving directly to another heading row
	 *  continues the same preview instead of briefly jumping back. */
	private scheduleHoverPreviewRestore(): void {
		if (!this.hoverPreviewOrigin) return;
		this.cancelHoverPreviewRestore();
		this.hoverPreviewRestoreFrame = requestAnimationFrame(() => {
			this.hoverPreviewRestoreFrame = null;
			this.restoreHoverPreview();
		});
	}

	private cancelHoverPreviewRestore(): void {
		if (this.hoverPreviewRestoreFrame !== null) {
			cancelAnimationFrame(this.hoverPreviewRestoreFrame);
			this.hoverPreviewRestoreFrame = null;
		}
	}

	/** A click commits the current navigation, so a later mouseleave must not
	 *  return to the pre-preview viewport. */
	private commitHoverPreview(): void {
		this.cancelHoverPreviewRestore();
		this.hoverPreviewOrigin = null;
	}

	private restoreHoverPreview(updateActive = true): void {
		this.cancelHoverPreviewRestore();
		const origin = this.hoverPreviewOrigin;
		this.hoverPreviewOrigin = null;
		if (!origin) return;

		const scroller = origin.scroller.isConnected ? origin.scroller : this.scroller;
		if (scroller) scroller.scrollTop = origin.scrollTop;
		if (updateActive) this.scheduleActiveUpdate();
	}

	private navigateTask(index: number): void {
		const task = this.tasks[index];
		if (!task) return;
		this.commitHoverPreview();
		this.beginNavigation();
		// Same scroll/flow as headings (incl. is-flashing); no active highlight.
		scrollToTarget(this.view, task, this.settings.smoothScroll, "task");
	}

	/** Briefly preview an item from the minimap without navigating. */
	private peek(index: number): void {
		if (this.settings.openTrigger === "hover") this.open();
		this.itemEls.forEach((el, i) => el.toggleClass("is-peek", i === index));
	}

	open(): void {
		this.cancelClose();
		if (this.isOpen) return;

		// Rebuild tasks fresh so this open reflects the note: completed tasks drop
		// out and any strikes from the previous open are cleared.
		this.refreshTasks(this.currentCache());
		if (this.headings.length === 0 && this.tasks.length === 0) return;

		// Preserve the last-used tab, correcting only if it has no content here.
		this.ensureValidTab();

		this.isOpen = true;
		this.rootEl.addClass("is-open");
		if (this.activeTab === "headings" && this.activeIndex >= 0) {
			this.itemEls[this.activeIndex]?.scrollIntoView({ block: "nearest" });
		}
	}

	close(): void {
		if (this.isPinned) return;
		if (!this.isOpen) return;
		this.restoreHoverPreview(false);
		this.setSearchActive(false);
		this.isOpen = false;
		this.rootEl.removeClass("is-open");
		this.itemEls.forEach((el) => el.removeClass("is-peek"));

		// Resync tasks now that we're closed: completed ones drop from the list and
		// the edge badge count updates.
		this.refreshTasks(this.currentCache());
		this.rootEl.toggleClass(
			"is-empty",
			this.headings.length === 0 && this.tasks.length === 0,
		);
	}

	private currentCache(): CachedMetadata | null {
		const file = this.view.file;
		return file ? this.plugin.app.metadataCache.getFileCache(file) : null;
	}

	toggle(): void {
		if (this.isOpen) this.close();
		else this.open();
	}

	private scheduleClose(): void {
		if (this.isPinned) return;
		this.cancelClose();
		this.closeTimer = window.setTimeout(() => this.close(), this.settings.closeDelay);
	}

	private cancelClose(): void {
		if (this.closeTimer !== null) {
			window.clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}
	}
}
