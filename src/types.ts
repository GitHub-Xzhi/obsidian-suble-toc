export interface HeadingItem {
	/** Heading level, 1-6. */
	level: number;
	/** Plain-text content of the heading. */
	text: string;
	/** 0-based line number in the document. */
	line: number;
}

export interface TaskItem {
	/** Displayed text of the task (list/checkbox markup stripped). */
	text: string;
	/** 0-based line number in the document. */
	line: number;
}

/** A navigable target: enough for scrollToTarget to scroll/flash it. */
export type NavTarget = { text: string; line: number };

export type TocSide = "right" | "left";
export type TocTrigger = "hover" | "click";
export type TocShow = "headings" | "tasks" | "both";
export type TocDefaultTab = "headings" | "tasks";
export type TocLanguage = "en" | "zh";

export interface SubtleTocSettings {
	/** UI language: English or Chinese. */
	language: TocLanguage;
	/** Which content to surface: headings, open tasks, or both. */
	show: TocShow;
	/** Tab that leads the tab bar and is selected on the first open. */
	defaultTab: TocDefaultTab;
	/** Show the dashed minimap on the edge of the note. */
	showMinimap: boolean;
	/** Horizontal scale of the dashed minimap markers, as a percentage. */
	minimapWidthScale: number;
	/** Vertical scale of marker thickness and spacing, as a percentage. */
	minimapVerticalScale: number;
	/** Show the open-task badge on the edge, next to the dashed minimap. */
	showTasksInMinimap: boolean;
	/** Which edge of the note to dock the minimap / popover on. */
	side: TocSide;
	/** Open the popover on hover or only on click. */
	openTrigger: TocTrigger;
	/** Grace period, in ms, before the popover closes once the mouse leaves it. */
	closeDelay: number;
	/** Width of the TOC popover in CSS pixels. */
	popoverWidth: number;
	/** Max height of the TOC popover in CSS pixels (0 = auto/default). */
	panelHeight: number;
	/** Opacity of the TOC popover (0-100, 100 = fully opaque). */
	panelOpacity: number;
	/** Show the expand/collapse-all toolbar button in the popover. */
	showToolbar: boolean;
	/** Show the tab bar (Headings/Tasks) in the popover. */
	showTabs: boolean;
	/** Lowest heading level to include (1 = H1). */
	minLevel: number;
	/** Highest heading level to include (6 = H6). */
	maxLevel: number;
	/** Smoothly animate the scroll when navigating to a heading. */
	smoothScroll: boolean;
	/** Temporarily preview a hovered heading, restoring the viewport on leave. */
	scrollToHeadingOnHover: boolean;
	/** Show a clickable checkbox on each task row (clicking completes the task). */
	showTaskCheckboxes: boolean;
	/** Background of the selected tab as a hex color; empty follows the theme. */
	activeTabBgColor: string;
	/** Wrap long headings/tasks over several lines instead of cutting them. */
	multiLine: boolean;
}

export const DEFAULT_SETTINGS: SubtleTocSettings = {
	language: "en",
	show: "both",
	defaultTab: "headings",
	showMinimap: true,
	minimapWidthScale: 100,
	minimapVerticalScale: 100,
	showTasksInMinimap: true,
	side: "right",
	openTrigger: "hover",
	closeDelay: 160,
	popoverWidth: 264,
	panelHeight: 0,
	panelOpacity: 100,
	showToolbar: true,
	showTabs: true,
	minLevel: 1,
	maxLevel: 6,
	smoothScroll: true,
	scrollToHeadingOnHover: false,
	showTaskCheckboxes: false,
	activeTabBgColor: "",
	multiLine: true,
};
