import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import InGraphPlugin from "../index";
import { GraphTheme, THEME_PRESETS } from "../models/theme";

export class InGraphSettingTab extends PluginSettingTab {
    plugin: InGraphPlugin;
    private customColorRows: HTMLElement[] = [];

    constructor(app: App, plugin: InGraphPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.addClass("automaton-settings-root");

        // Main Header
        const header = containerEl.createDiv({ cls: "automaton-settings-header" });
        header.createEl("h2", { text: "In-Graph Settings" });
        header.createEl("p", {
            text: "Tune visuals, editing behavior, and keyboard flow for your graphs and circuits.",
            cls: "automaton-settings-intro"
        });

        // Helper to create collapsible sections with Icons
        const createSection = (title: string, icon: string, desc?: string, isOpen = true) => {
            const section = containerEl.createEl("details", { cls: "automaton-settings-section" });
            if (isOpen) section.setAttr("open", "");

            const summary = section.createEl("summary", { cls: "automaton-settings-section-summary" });
            
            const titleWrap = summary.createDiv({ cls: "automaton-settings-title-wrap" });
            const iconEl = titleWrap.createSpan({ cls: "automaton-settings-icon" });
            setIcon(iconEl, icon);
            titleWrap.createEl("h3", { text: title, cls: "automaton-settings-section-title" });

            const content = section.createDiv({ cls: "automaton-settings-section-content" });
            if (desc) content.createEl("p", { text: desc, cls: "automaton-settings-section-desc" });

            return content;
        };

        // ─── SECTION: Appearance ─────────────────────────────────────────────────
        const appearanceSection = createSection("Appearance", "palette", "Choose a preset theme or customize every color token.", true);

        new Setting(appearanceSection)
            .setName("Active Theme")
            .setDesc("Visual style for all graphs. Individual graphs can still override this via DSL.")
            .addDropdown(drop => {
                THEME_PRESETS.forEach(p => drop.addOption(p.name, p.name));
                drop.addOption("Custom", "Custom…");
                drop.setValue(this.plugin.settings.activeTheme);
                drop.onChange(async (val) => {
                    this.plugin.settings.activeTheme = val;
                    await this.plugin.saveSettings();
                    this.toggleCustomRows(val === "Custom");
                    this.renderPreview(previewEl, val);
                });
            });

        // Live preview
        const previewWrap = appearanceSection.createDiv({ cls: "automaton-settings-preview-wrap" });
        previewWrap.createEl("div", { text: "Live Preview", cls: "automaton-settings-preview-label" });
        const previewEl = previewWrap.createDiv({ cls: "automaton-settings-preview" });
        this.renderPreview(previewEl, this.plugin.settings.activeTheme);

        // Custom theme color pickers (Categorized!)
        const customSection = appearanceSection.createDiv({ cls: "automaton-custom-theme-section" });
        this.customColorRows = [];

        const addColorGroup = (title: string, fields: { key: keyof GraphTheme; label: string; desc: string }[]) => {
            const header = new Setting(customSection).setHeading().setName(title);
            this.customColorRows.push(header.settingEl);

            fields.forEach(({ key, label, desc }) => {
                const row = new Setting(customSection)
                    .setName(label)
                    .setDesc(desc)
                    .addColorPicker(cp => {
                        const current = this.plugin.settings.customTheme[key];
                        if (current) cp.setValue(current);
                        cp.onChange(async (val) => {
                            this.plugin.settings.customTheme[key] = val;
                            await this.plugin.saveSettings();
                            this.renderPreview(previewEl, "Custom");
                        });
                    });
                this.customColorRows.push(row.settingEl);
            });
        };

        addColorGroup("Canvas & Text", [
            { key: "background", label: "Background", desc: "Canvas background color" },
            { key: "text", label: "Text color", desc: "Labels on nodes, edges, and gates" },
        ]);

        addColorGroup("Automata (Nodes & Edges)", [
            { key: "nodeFill", label: "Node fill", desc: "Inside of state circles" },
            { key: "nodeStroke", label: "Node border", desc: "Outline of state circles" },
            { key: "acceptCircle", label: "Accept ring", desc: "Inner ring of accepting states" },
            { key: "edgeStroke", label: "Edge color", desc: "Transition arrows and lines" },
            { key: "startArrow", label: "Start arrow", desc: "Arrow indicating the start state" },
        ]);

        addColorGroup("Logic Circuits", [
            { key: "gateFill", label: "Gate fill", desc: "Inside of logic gates" },
            { key: "gateStroke", label: "Gate border", desc: "Outline of logic gates" },
            { key: "wireActive", label: "Active wire", desc: "Color of live circuit wires (High signal)" },
        ]);

        addColorGroup("Frames", [
            { key: "groupFill", label: "Frame fill", desc: "Background tint of group frames" },
            { key: "groupStroke", label: "Frame border", desc: "Outline and text of group frames" },
        ]);

        this.toggleCustomRows(this.plugin.settings.activeTheme === "Custom");


        // ─── SECTION: DSL editor ─────────────────────────────────────────────────
        const dslSection = createSection("DSL Editor & Routing", "code", "Configure the text editor behavior and automatic wire routing.", false);

        new Setting(dslSection)
            .setName("Panel position")
            .setDesc("Where the DSL text editor appears when opened.")
            .addDropdown(drop => {
                drop.addOption("bottom", "Bottom bar");
                drop.addOption("sidebar", "Side panel (right)");
                drop.setValue(this.plugin.settings.dslMode ?? "bottom");
                drop.onChange(async (val: string) => {
                    this.plugin.settings.dslMode = val as "bottom" | "sidebar";
                    await this.plugin.saveSettings();
                });
            });

        new Setting(dslSection)
            .setName("Click canvas to open DSL editor")
            .setDesc("Clicking empty space on the graph automatically opens the DSL panel.")
            .addToggle(tog => {
                tog.setValue(this.plugin.settings.clickBgOpensDsl ?? false);
                tog.onChange(async (val) => {
                    this.plugin.settings.clickBgOpensDsl = val;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(dslSection)
            .setName("Orthogonal wire routing")
            .setDesc("Route circuit wires using 90° Manhattan lines instead of sweeping curves.")
            .addToggle(tog => {
                tog.setValue(this.plugin.settings.straightWires ?? false);
                tog.onChange(async (val) => {
                    this.plugin.settings.straightWires = val;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(dslSection)
            .setName("Enable custom snippets")
            .setDesc("Load a custom array of regex snippets for rapid MathJax typing.")
            .addToggle(tog => {
                tog.setValue(this.plugin.settings.customSnippetsEnabled ?? false);
                tog.onChange(async (val) => {
                    this.plugin.settings.customSnippetsEnabled = val;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(dslSection)
            .setName("Custom snippets file path")
            .setDesc("Path to your snippets file in the vault (e.g., 'snippets.js'). Leave empty to use defaults.")
            .addText(text => text
                .setPlaceholder("snippets.js")
                .setValue(this.plugin.settings.snippetsPath)
                .onChange(async (value) => {
                    this.plugin.settings.snippetsPath = value;
                    await this.plugin.saveSettings();
                    await this.plugin.loadCustomSnippets();
                }));


        // ─── SECTION: Behaviour ──────────────────────────────────────────────────
        const behaviorSection = createSection("Behaviour & Limits", "settings", "Set defaults for undo depth and graph sizing.", false);

        new Setting(behaviorSection)
            .setName("Undo history size")
            .setDesc("Maximum undo steps stored per graph (10–200). Higher values use more memory.")
            .addSlider(sl => {
                sl.setLimits(10, 200, 10);
                sl.setValue(this.plugin.settings.maxHistory ?? 50);
                sl.setDynamicTooltip();
                sl.onChange(async (val) => {
                    this.plugin.settings.maxHistory = val;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(behaviorSection)
            .setName("Default graph height")
            .setDesc("Height in pixels for new graphs that have no saved viewport yet.")
            .addSlider(sl => {
                sl.setLimits(150, 800, 50);
                sl.setValue(this.plugin.settings.defaultHeight ?? 300);
                sl.setDynamicTooltip();
                sl.onChange(async (val) => {
                    this.plugin.settings.defaultHeight = val;
                    await this.plugin.saveSettings();
                });
            });


        // ─── SECTION: Keyboard shortcuts reference ────────────────────────────────
        const shortcutsSection = createSection("Keyboard Shortcuts", "keyboard", "Commands can be remapped in Obsidian's standard Hotkeys menu.", false);

        const shortcuts: { keys: string; action: string }[] = [
            { keys: "Ctrl+Shift+G", action: "Toggle DSL editor (nearest graph)" },
            { keys: "Ctrl+Shift+Enter", action: "Apply DSL text (nearest graph)" },
            { keys: "Ctrl+S", action: "Save graph to file" },
            { keys: "Ctrl+Z", action: "Undo last change" },
            { keys: "Double-click node", action: "Edit label inline" },
            { keys: "Double-click waypoint", action: "Clear all waypoints on edge" },
            { keys: "Right-click", action: "Context menu" },
            { keys: "Scroll", action: "Zoom in / out" },
            { keys: "Alt+drag / Middle-click", action: "Pan canvas" },
            { keys: "Shift+click", action: "Add node/gate to selection" },
        ];

        const table = shortcutsSection.createEl("table", { cls: "automaton-shortcuts-table" });
        shortcuts.forEach(({ keys, action }) => {
            const tr = table.createEl("tr", { cls: "automaton-shortcuts-row" });
            tr.createEl("td", { text: keys, cls: "automaton-shortcuts-keys" });
            tr.createEl("td", { text: action, cls: "automaton-shortcuts-action" });
        });
    }

    private toggleCustomRows(show: boolean) {
        this.customColorRows.forEach(el => {
            el.style.display = show ? "" : "none";
        });
    }

    private renderPreview(container: HTMLElement, themeName: string) {
        // ... (Keep your exact renderPreview implementation here!) ...
        container.empty();

        let theme: GraphTheme;
        if (themeName === "Custom") {
            theme = this.plugin.settings.customTheme;
        } else {
            theme = THEME_PRESETS.find(p => p.name === themeName)?.theme ?? {};
        }

        const bg = theme.background || "var(--background-primary)";
        const fill = theme.nodeFill || "var(--background-secondary)";
        const stroke = theme.nodeStroke || "var(--text-normal)";
        const txt = theme.text || "var(--text-normal)";
        const edge = theme.edgeStroke || "var(--text-muted)";
        const accept = theme.acceptCircle || stroke;
        const start = theme.startArrow || stroke;

        container.style.setProperty("--automaton-preview-bg", bg);

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 260 100");
        svg.addClass("automaton-settings-preview-svg");

        // Start arrow
        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrow.setAttribute("d", "M 28 50 L 48 50 M 43 45 L 48 50 L 43 55");
        arrow.setAttribute("stroke", start);
        arrow.setAttribute("stroke-width", "2");
        arrow.setAttribute("fill", "none");
        svg.appendChild(arrow);

        // q0
        const c0 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c0.setAttribute("cx", "70"); c0.setAttribute("cy", "50"); c0.setAttribute("r", "20");
        c0.setAttribute("fill", fill); c0.setAttribute("stroke", stroke); c0.setAttribute("stroke-width", "2");
        svg.appendChild(c0);
        const t0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t0.setAttribute("x", "70"); t0.setAttribute("y", "54");
        t0.setAttribute("text-anchor", "middle"); t0.setAttribute("font-size", "11");
        t0.setAttribute("fill", txt); t0.textContent = "q0";
        svg.appendChild(t0);

        // Edge q0→q1
        const edgePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        edgePath.setAttribute("d", "M 90 50 L 165 50");
        edgePath.setAttribute("stroke", edge); edgePath.setAttribute("stroke-width", "1.5");
        edgePath.setAttribute("fill", "none");
        edgePath.setAttribute("marker-end", "url(#prev-arrow)");
        svg.appendChild(edgePath);
        const edgeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        edgeLabel.setAttribute("x", "127"); edgeLabel.setAttribute("y", "44");
        edgeLabel.setAttribute("text-anchor", "middle"); edgeLabel.setAttribute("font-size", "10");
        edgeLabel.setAttribute("fill", txt); edgeLabel.textContent = "0,1";
        svg.appendChild(edgeLabel);

        // q1 (accepting)
        const c1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c1.setAttribute("cx", "190"); c1.setAttribute("cy", "50"); c1.setAttribute("r", "20");
        c1.setAttribute("fill", fill); c1.setAttribute("stroke", stroke); c1.setAttribute("stroke-width", "2");
        svg.appendChild(c1);
        const c1i = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c1i.setAttribute("cx", "190"); c1i.setAttribute("cy", "50"); c1i.setAttribute("r", "15");
        c1i.setAttribute("fill", "none"); c1i.setAttribute("stroke", accept); c1i.setAttribute("stroke-width", "1.5");
        svg.appendChild(c1i);
        const t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t1.setAttribute("x", "190"); t1.setAttribute("y", "54");
        t1.setAttribute("text-anchor", "middle"); t1.setAttribute("font-size", "11");
        t1.setAttribute("fill", txt); t1.textContent = "q1";
        svg.appendChild(t1);

        // Arrow marker
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", "prev-arrow");
        marker.setAttribute("viewBox", "0 0 10 10"); marker.setAttribute("refX", "10"); marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "5"); marker.setAttribute("markerHeight", "5");
        marker.setAttribute("orient", "auto");
        const mp = document.createElementNS("http://www.w3.org/2000/svg", "path");
        mp.setAttribute("d", "M 0 0 L 10 5 L 0 10 z"); mp.setAttribute("fill", edge);
        marker.appendChild(mp); defs.appendChild(marker); svg.appendChild(defs);

        container.appendChild(svg);
    }
}