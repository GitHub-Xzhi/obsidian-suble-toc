import { App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, TocDefaultTab, TocLanguage, TocShow } from "./types";
import type SubtleTocPlugin from "./main";

/** Only where the picker starts while the color is unset — a neutral gray, since
 *  the theme's own value can be a translucent rgba() the picker can't show. */
const FALLBACK_ACTIVE_TAB_BG = "#7a7a7a";

/* ---- i18n for settings tab ----------------------------------------------- */

interface SettingsLocale {
	language: [string, string];
	show: [string, string];
	showOpts: { both: string; headings: string; tasks: string };
	defaultTab: [string, string];
	defaultTabOpts: { headings: string; tasks: string };
	showTaskCheckboxes: [string, string];
	multiLine: [string, string];
	activeTabColor: [string, string];
	activeTabColorReset: string;
	showMinimap: [string, string];
	minimapWidth: [string, string];
	minimapVertical: [string, string];
	showTasksMinimap: [string, string];
	side: [string, string];
	sideOpts: { right: string; left: string };
	openTrigger: [string, string];
	openTriggerOpts: { hover: string; click: string };
	autoHideOnBlur: [string, string];
	closeDelay: [string, string];
	popoverWidth: [string, string];
	panelHeight: [string, string];
	panelBgOpacity: [string, string];
	headingOpacity: [string, string];
	showToolbar: [string, string];
	showTabs: [string, string];
	smoothScroll: [string, string];
	scrollOnHover: [string, string];
	minLevel: [string, string];
	maxLevel: [string, string];
	showLevelBadges: [string, string];
	headingColorLabel: string;
	headings: string;
	tasks: string;
	reset: string;
}

const EN: SettingsLocale = {
	language: ["Language", "UI language for the TOC panel and settings."],
	show: ["Show", "Which content to surface: headings, open tasks, or both."],
	showOpts: { both: "Both", headings: "Headings", tasks: "Tasks" },
	defaultTab: ["Default tab", "Tab shown first in the popover. After that the last-used tab is kept; it always falls back to the tab that has content."],
	defaultTabOpts: { headings: "Headings", tasks: "Tasks" },
	showTaskCheckboxes: ["Show task checkboxes", "Add a checkbox to each task in the popover; clicking it completes the task in the note."],
	multiLine: ["Show multiple lines", "Wrap long headings and tasks over as many lines as they need. When off, each row is cut to a single line and hovering it shows the full text."],
	activeTabColor: ["Active tab color", "Background of the selected tab in the popover. Reset to follow the theme."],
	activeTabColorReset: "Use the theme's color",
	showMinimap: ["Show minimap", "Show the dashed markers along the edge of the note."],
	minimapWidth: ["Minimap marker width", "Scale the dashed markers (100% is the default)."],
	minimapVertical: ["Minimap vertical scale", "Scale marker thickness and spacing to make the minimap shorter or taller (100% is the default size)."],
	showTasksMinimap: ["Show tasks in minimap", "Show the open-task count on the edge of the note, next to the dashed markers. Notes with tasks but no headings always show it, so the TOC stays reachable."],
	side: ["Side", "Which edge of the note to dock the TOC on."],
	sideOpts: { right: "Right", left: "Left" },
	openTrigger: ["Open the popover on", "Hover over the minimap, or require a click to open."],
	openTriggerOpts: { hover: "Hover", click: "Click" },
	autoHideOnBlur: ["Auto-hide outside note", "Hide the TOC when focus moves away from the Markdown note, such as clicking a sidebar."],
	closeDelay: ["Close delay", "How long the popover waits before closing after the mouse leaves it, in milliseconds. Raise it if it closes on you while switching tabs."],
	popoverWidth: ["Popover width", "Set the width of the TOC popover in pixels (264 is the default)."],
	panelHeight: ["Panel height", "Custom max height of the TOC popover in pixels. Set to 0 to use the default (50vh)."],
	panelBgOpacity: ["Panel background opacity", "Transparency of the TOC panel background (10-100%). Lower values make the background more transparent."],
	headingOpacity: ["Heading text opacity", "Transparency of the heading and task text in the TOC panel (10-100%). Lower values make the text more transparent."],
	showToolbar: ["Show toolbar", "Show the expand/collapse-all button at the top of the TOC panel."],
	showTabs: ["Show tab bar", "Show the Headings/Tasks tab bar in the TOC panel."],
	smoothScroll: ["Smooth scroll", "Animate the scroll when navigating to a heading."],
	scrollOnHover: ["Scroll to heading on hover", "Temporarily scroll to a heading while its TOC row is hovered, then return when the pointer leaves. Click the row to navigate normally and stay there."],
	minLevel: ["Minimum heading level", "Lowest heading level to show (1 = H1)."],
	maxLevel: ["Maximum heading level", "Highest heading level to show (6 = H6)."],
	showLevelBadges: ["Show level badges", "Show H1-H6 level badges on the right side of each heading."],
	headingColorLabel: "H{n} badge color",
	headings: "Headings",
	tasks: "Tasks",
	reset: "Reset to default",
};

const ZH: SettingsLocale = {
	language: ["语言", "TOC 面板和设置页面的界面语言。"],
	show: ["显示内容", "选择显示标题、待办任务或两者都显示。"],
	showOpts: { both: "两者", headings: "标题", tasks: "任务" },
	defaultTab: ["默认标签页", "弹出面板首先显示的标签页。之后保留上次使用的标签页；始终回退到有内容的标签页。"],
	defaultTabOpts: { headings: "标题", tasks: "任务" },
	showTaskCheckboxes: ["显示任务复选框", "为弹出面板中的每个任务添加复选框；点击即可在笔记中完成该任务。"],
	multiLine: ["显示多行", "长标题和任务按需要自动换行。关闭时，每行截断为单行，悬停时显示完整文本。"],
	activeTabColor: ["活动标签颜色", "弹出面板中选中标签页的背景色。重置以跟随主题。"],
	activeTabColorReset: "使用主题颜色",
	showMinimap: ["显示缩略图", "在笔记边缘显示虚线标记。"],
	minimapWidth: ["缩略图宽度", "缩放虚线标记宽度（100% 为默认）。"],
	minimapVertical: ["缩略图高度", "缩放标记厚度和间距，使缩略图更短或更高（100% 为默认大小）。"],
	showTasksMinimap: ["在缩略图中显示任务", "在笔记边缘显示待办任务数量，位于虚线标记旁边。只有任务没有标题的笔记始终显示，以便 TOC 始终可访问。"],
	side: ["位置", "TOC 停靠在笔记的哪一侧。"],
	sideOpts: { right: "右侧", left: "左侧" },
	openTrigger: ["打开方式", "悬停在缩略图上打开，或需要点击打开。"],
	openTriggerOpts: { hover: "悬停", click: "点击" },
	autoHideOnBlur: ["失焦时自动隐藏", "当焦点离开 Markdown 笔记（例如点击侧边栏）时隐藏 TOC 面板。"],
	closeDelay: ["关闭延迟", "鼠标离开弹出面板后等待关闭的时间（毫秒）。如果在切换标签时面板关闭太快，请增大此值。"],
	popoverWidth: ["面板宽度", "设置 TOC 弹出面板的宽度（像素），默认 264。"],
	panelHeight: ["面板高度", "自定义 TOC 弹出面板的最大高度（像素）。设为 0 使用默认值（50vh）。"],
	panelBgOpacity: ["面板背景透明度", "TOC 面板背景的透明度（10-100%）。数值越低越透明。"],
	headingOpacity: ["标题文字透明度", "TOC 面板中标题和任务文字的透明度（10-100%）。数值越低越透明。"],
	showToolbar: ["显示工具栏", "在 TOC 面板顶部显示展开/收起全部按钮。"],
	showTabs: ["显示标签栏", "在 TOC 面板中显示标题/任务标签栏。"],
	smoothScroll: ["平滑滚动", "导航到标题时使用动画滚动。"],
	scrollOnHover: ["悬停时滚动到标题", "当 TOC 行被悬停时临时滚动到对应标题，指针离开后返回。点击该行正常导航并停留在那里。"],
	minLevel: ["最小标题级别", "显示的最低标题级别（1 = H1）。"],
	maxLevel: ["最大标题级别", "显示的最高标题级别（6 = H6）。"],
	showLevelBadges: ["显示级别徽标", "在每个标题右侧显示 H1-H6 级别徽标。"],
	headingColorLabel: "H{n} 徽标颜色",
	headings: "标题",
	tasks: "任务",
	reset: "恢复默认值",
};

function getSettingsLocale(lang: string): SettingsLocale {
	return lang === "zh" ? ZH : EN;
}

export class SubtleTocSettingTab extends PluginSettingTab {
	plugin: SubtleTocPlugin;

	constructor(app: App, plugin: SubtleTocPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Add a reset-to-default button to a setting. */
	private addResetBtn(
		setting: Setting,
		key: keyof typeof DEFAULT_SETTINGS,
	): Setting {
		return setting.addExtraButton((b) =>
			b
				.setIcon("rotate-ccw")
				.setTooltip(this.currentLocale.reset)
				.onClick(async () => {
					const def = DEFAULT_SETTINGS[key];
					(this.plugin.settings as unknown as Record<string, unknown>)[key] =
						Array.isArray(def) ? [...def] : def;
					await this.plugin.saveAndRefresh();
					this.displayPreservingScroll();
				}),
		);
	}

	private displayPreservingScroll(): void {
		const scrollEl = this.getScrollContainer();
		const scrollTop = scrollEl.scrollTop;
		this.display();
		requestAnimationFrame(() => {
			scrollEl.scrollTop = scrollTop;
		});
	}

	private getScrollContainer(): HTMLElement {
		let el: HTMLElement | null = this.containerEl;
		while (el) {
			const style = getComputedStyle(el);
			if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(style.overflowY)) {
				return el;
			}
			el = el.parentElement;
		}
		return this.containerEl;
	}

	private currentLocale!: SettingsLocale;

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const t = getSettingsLocale(this.plugin.settings.language);
		this.currentLocale = t;

		// -- Language (always re-renders on change) ----------------------------
		const langSetting = new Setting(containerEl)
			.setName("Language / 语言")
			.setDesc("界面语言 / UI language for the TOC panel and settings.")
			.addDropdown((d) =>
				d
					.addOption("en", "English")
					.addOption("zh", "中文")
					.setValue(this.plugin.settings.language)
					.onChange(async (v) => {
						this.plugin.settings.language = v as TocLanguage;
						await this.plugin.saveAndRefresh();
						this.display();
					}),
			);
		this.addResetBtn(langSetting, "language");

		// -- Show --------------------------------------------------------------
		const showSetting = new Setting(containerEl)
			.setName(t.show[0])
			.setDesc(t.show[1])
			.addDropdown((d) =>
				d
					.addOption("both", t.showOpts.both)
					.addOption("headings", t.showOpts.headings)
					.addOption("tasks", t.showOpts.tasks)
					.setValue(this.plugin.settings.show)
					.onChange(async (v) => {
						this.plugin.settings.show = v as TocShow;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(showSetting, "show");

		// -- Default tab -------------------------------------------------------
		const tabSetting = new Setting(containerEl)
			.setName(t.defaultTab[0])
			.setDesc(t.defaultTab[1])
			.addDropdown((d) =>
				d
					.addOption("headings", t.defaultTabOpts.headings)
					.addOption("tasks", t.defaultTabOpts.tasks)
					.setValue(this.plugin.settings.defaultTab)
					.onChange(async (v) => {
						this.plugin.settings.defaultTab = v as TocDefaultTab;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(tabSetting, "defaultTab");

		// -- Show task checkboxes -----------------------------------------------
		const taskCbSetting = new Setting(containerEl)
			.setName(t.showTaskCheckboxes[0])
			.setDesc(t.showTaskCheckboxes[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showTaskCheckboxes).onChange(async (v) => {
					this.plugin.settings.showTaskCheckboxes = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(taskCbSetting, "showTaskCheckboxes");

		// -- Show multiple lines -----------------------------------------------
		const multiLineSetting = new Setting(containerEl)
			.setName(t.multiLine[0])
			.setDesc(t.multiLine[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.multiLine).onChange(async (v) => {
					this.plugin.settings.multiLine = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(multiLineSetting, "multiLine");

		// -- Active tab color (already has its own reset button) ---------------
		new Setting(containerEl)
			.setName(t.activeTabColor[0])
			.setDesc(t.activeTabColor[1])
			.addColorPicker((c) =>
				c
					.setValue(this.plugin.settings.activeTabBgColor || FALLBACK_ACTIVE_TAB_BG)
					.onChange(async (v) => {
						this.plugin.settings.activeTabBgColor = v;
						await this.plugin.saveAndRefresh();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip(t.activeTabColorReset)
					.onClick(async () => {
						this.plugin.settings.activeTabBgColor = "";
						await this.plugin.saveAndRefresh();
						this.displayPreservingScroll();
					}),
			);

		// -- Show minimap ------------------------------------------------------
		const minimapSetting = new Setting(containerEl)
			.setName(t.showMinimap[0])
			.setDesc(t.showMinimap[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showMinimap).onChange(async (v) => {
					this.plugin.settings.showMinimap = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(minimapSetting, "showMinimap");

		// -- Minimap marker width ----------------------------------------------
		const mmWidthSetting = new Setting(containerEl)
			.setName(t.minimapWidth[0])
			.setDesc(t.minimapWidth[1])
			.addSlider((s) =>
				s
					.setLimits(50, 200, 10)
					.setValue(this.plugin.settings.minimapWidthScale)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.minimapWidthScale = v;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(mmWidthSetting, "minimapWidthScale");

		// -- Minimap vertical scale --------------------------------------------
		const mmVertSetting = new Setting(containerEl)
			.setName(t.minimapVertical[0])
			.setDesc(t.minimapVertical[1])
			.addSlider((s) =>
				s
					.setLimits(50, 200, 10)
					.setValue(this.plugin.settings.minimapVerticalScale)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.minimapVerticalScale = v;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(mmVertSetting, "minimapVerticalScale");

		// -- Show tasks in minimap ---------------------------------------------
		const tasksMmSetting = new Setting(containerEl)
			.setName(t.showTasksMinimap[0])
			.setDesc(t.showTasksMinimap[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showTasksInMinimap).onChange(async (v) => {
					this.plugin.settings.showTasksInMinimap = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(tasksMmSetting, "showTasksInMinimap");

		// -- Side --------------------------------------------------------------
		const sideSetting = new Setting(containerEl)
			.setName(t.side[0])
			.setDesc(t.side[1])
			.addDropdown((d) =>
				d
					.addOption("right", t.sideOpts.right)
					.addOption("left", t.sideOpts.left)
					.setValue(this.plugin.settings.side)
					.onChange(async (v) => {
						this.plugin.settings.side = v as "right" | "left";
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(sideSetting, "side");

		// -- Open trigger ------------------------------------------------------
		const triggerSetting = new Setting(containerEl)
			.setName(t.openTrigger[0])
			.setDesc(t.openTrigger[1])
			.addDropdown((d) =>
				d
					.addOption("hover", t.openTriggerOpts.hover)
					.addOption("click", t.openTriggerOpts.click)
					.setValue(this.plugin.settings.openTrigger)
					.onChange(async (v) => {
						this.plugin.settings.openTrigger = v as "hover" | "click";
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(triggerSetting, "openTrigger");

		// -- Auto-hide outside note ---------------------------------------------
		const autoHideSetting = new Setting(containerEl)
			.setName(t.autoHideOnBlur[0])
			.setDesc(t.autoHideOnBlur[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoHideOnBlur).onChange(async (v) => {
					this.plugin.settings.autoHideOnBlur = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(autoHideSetting, "autoHideOnBlur");

		// -- Close delay -------------------------------------------------------
		const closeSetting = new Setting(containerEl)
			.setName(t.closeDelay[0])
			.setDesc(t.closeDelay[1])
			.addSlider((s) =>
				s
					.setLimits(0, 1000, 20)
					.setValue(this.plugin.settings.closeDelay)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.closeDelay = v;
						await this.plugin.saveSettings();
					}),
			);
		this.addResetBtn(closeSetting, "closeDelay");

		// -- Popover width -----------------------------------------------------
		const widthSetting = new Setting(containerEl)
			.setName(t.popoverWidth[0])
			.setDesc(t.popoverWidth[1])
			.addSlider((s) =>
				s
					.setLimits(160, 480, 8)
					.setValue(this.plugin.settings.popoverWidth)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.popoverWidth = v;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(widthSetting, "popoverWidth");

		// -- Panel height ------------------------------------------------------
		const heightSetting = new Setting(containerEl)
			.setName(t.panelHeight[0])
			.setDesc(t.panelHeight[1])
			.addSlider((s) =>
				s
					.setLimits(0, 2000, 10)
					.setValue(this.plugin.settings.panelHeight)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.panelHeight = v;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(heightSetting, "panelHeight");

		// -- Panel background opacity ------------------------------------------
		const bgOpSetting = new Setting(containerEl)
			.setName(t.panelBgOpacity[0])
			.setDesc(t.panelBgOpacity[1])
			.addSlider((s) =>
				s
					.setLimits(10, 100, 5)
					.setValue(this.plugin.settings.panelBgOpacity)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.panelBgOpacity = v;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(bgOpSetting, "panelBgOpacity");

		// -- Heading text opacity ----------------------------------------------
		const hdOpSetting = new Setting(containerEl)
			.setName(t.headingOpacity[0])
			.setDesc(t.headingOpacity[1])
			.addSlider((s) =>
				s
					.setLimits(10, 100, 5)
					.setValue(this.plugin.settings.headingOpacity)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.headingOpacity = v;
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(hdOpSetting, "headingOpacity");

		// -- Show toolbar ------------------------------------------------------
		const toolbarSetting = new Setting(containerEl)
			.setName(t.showToolbar[0])
			.setDesc(t.showToolbar[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showToolbar).onChange(async (v) => {
					this.plugin.settings.showToolbar = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(toolbarSetting, "showToolbar");

		// -- Show tabs ---------------------------------------------------------
		const tabsSetting = new Setting(containerEl)
			.setName(t.showTabs[0])
			.setDesc(t.showTabs[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showTabs).onChange(async (v) => {
					this.plugin.settings.showTabs = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(tabsSetting, "showTabs");

		// -- Smooth scroll -----------------------------------------------------
		const scrollSetting = new Setting(containerEl)
			.setName(t.smoothScroll[0])
			.setDesc(t.smoothScroll[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.smoothScroll).onChange(async (v) => {
					this.plugin.settings.smoothScroll = v;
					await this.plugin.saveSettings();
				}),
			);
		this.addResetBtn(scrollSetting, "smoothScroll");

		// -- Scroll to heading on hover ----------------------------------------
		const hoverSetting = new Setting(containerEl)
			.setName(t.scrollOnHover[0])
			.setDesc(t.scrollOnHover[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.scrollToHeadingOnHover).onChange(async (v) => {
					this.plugin.settings.scrollToHeadingOnHover = v;
					await this.plugin.saveSettings();
				}),
			);
		this.addResetBtn(hoverSetting, "scrollToHeadingOnHover");

		// -- Minimum heading level ---------------------------------------------
		const minSetting = new Setting(containerEl)
			.setName(t.minLevel[0])
			.setDesc(t.minLevel[1])
			.addSlider((s) =>
				s
					.setLimits(1, 6, 1)
					.setValue(this.plugin.settings.minLevel)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.minLevel = v;
						if (v > this.plugin.settings.maxLevel) {
							this.plugin.settings.maxLevel = v;
						}
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(minSetting, "minLevel");

		// -- Maximum heading level ---------------------------------------------
		const maxSetting = new Setting(containerEl)
			.setName(t.maxLevel[0])
			.setDesc(t.maxLevel[1])
			.addSlider((s) =>
				s
					.setLimits(1, 6, 1)
					.setValue(this.plugin.settings.maxLevel)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.maxLevel = v;
						if (v < this.plugin.settings.minLevel) {
							this.plugin.settings.minLevel = v;
						}
						await this.plugin.saveAndRefresh();
					}),
			);
		this.addResetBtn(maxSetting, "maxLevel");

		// -- Show level badges -------------------------------------------------
		const badgeSetting = new Setting(containerEl)
			.setName(t.showLevelBadges[0])
			.setDesc(t.showLevelBadges[1])
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showLevelBadges).onChange(async (v) => {
					this.plugin.settings.showLevelBadges = v;
					await this.plugin.saveAndRefresh();
				}),
			);
		this.addResetBtn(badgeSetting, "showLevelBadges");

		// -- Heading level colors (H1-H6) -------------------------------------
		for (let level = 1; level <= 6; level++) {
			const idx = level - 1;
			const rawVal = this.plugin.settings.headingColors[idx] || "#888888";
			// Normalize: ensure # prefix and 6-digit hex
			let displayVal = rawVal.trim();
			if (!displayVal.startsWith("#")) displayVal = "#" + displayVal;
			if (/^#[0-9a-fA-F]{3}$/.test(displayVal)) {
				displayVal = "#" + displayVal[1] + displayVal[1] + displayVal[2] + displayVal[2] + displayVal[3] + displayVal[3];
			}
			const colorSetting = new Setting(containerEl)
				.setName(t.headingColorLabel.replace("{n}", String(level)))
				.addColorPicker((c) =>
					c
						.setValue(displayVal)
						.onChange(async (v) => {
							this.plugin.settings.headingColors[idx] = v;
							await this.plugin.saveAndRefresh();
						}),
				);
			colorSetting.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip(t.reset)
					.onClick(async () => {
						this.plugin.settings.headingColors[idx] = DEFAULT_SETTINGS.headingColors[idx];
						await this.plugin.saveAndRefresh();
						this.displayPreservingScroll();
					}),
			);
		}
	}
}
