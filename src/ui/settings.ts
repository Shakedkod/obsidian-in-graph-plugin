import { App, PluginSettingTab, Setting } from "obsidian";
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

        containerEl.createEl("h2", { text: "Automaton graph settings" });

        // --- THEME PRESET PICKER ---
        new Setting(containerEl)
            .setName("Theme")
            .setDesc("Visual style for all graphs. Individual graphs can still override this.")
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

        // --- LIVE PREVIEW ---
        const previewWrap = containerEl.createDiv({ cls: "automaton-settings-preview-wrap" });
        previewWrap.createEl("p", { text: "Preview", cls: "automaton-settings-preview-label" });
        const previewEl = previewWrap.createDiv({ cls: "automaton-settings-preview" });
        this.renderPreview(previewEl, this.plugin.settings.activeTheme);

        // --- CUSTOM THEME FIELDS ---
        const customSection = containerEl.createDiv({ cls: "automaton-custom-theme-section" });
        this.customColorRows = [];

        const colorFields: { key: keyof GraphTheme, label: string, desc: string }[] = [
            { key: "background",   label: "Background",    desc: "Canvas background color" },
            { key: "nodeFill",     label: "Node fill",     desc: "Inside of state circles" },
            { key: "nodeStroke",   label: "Node border",   desc: "Outline of state circles" },
            { key: "text",         label: "Text",          desc: "Labels on nodes and edges" },
            { key: "edgeStroke",   label: "Edge color",    desc: "Transition arrows/lines" },
            { key: "startArrow",   label: "Start arrow",   desc: "Arrow indicating start state" },
            { key: "acceptCircle", label: "Accept ring",   desc: "Inner ring of accepting states" },
            { key: "gateStroke",  label: "Gate border",    desc: "Outline of logic gates" },
            { key: "gateFill",    label: "Gate fill",       desc: "Inside of logic gates" },
            { key: "wireActive",  label: "Active wire",     desc: "Color of live circuit wires" },
            { key: "groupFill",   label: "Group fill",      desc: "Background of group boxes" },
            { key: "groupStroke", label: "Group border",    desc: "Outline of group boxes" },
        ];

        colorFields.forEach(({ key, label, desc }) => {
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

        this.toggleCustomRows(this.plugin.settings.activeTheme === "Custom");
    }

    private toggleCustomRows(show: boolean) {
        this.customColorRows.forEach(el => {
            el.style.display = show ? "" : "none";
        });
    }

    private renderPreview(container: HTMLElement, themeName: string) {
        container.empty();

        let theme: GraphTheme;
        if (themeName === "Custom") {
            theme = this.plugin.settings.customTheme;
        } else {
            theme = THEME_PRESETS.find(p => p.name === themeName)?.theme ?? {};
        }

        const bg      = theme.background   || "var(--background-primary)";
        const fill    = theme.nodeFill     || "var(--background-secondary)";
        const stroke  = theme.nodeStroke   || "var(--text-normal)";
        const txt     = theme.text         || "var(--text-normal)";
        const edge    = theme.edgeStroke   || "var(--text-muted)";
        const accept  = theme.acceptCircle || stroke;
        const start   = theme.startArrow   || stroke;

        container.style.background = bg;

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 260 100");
        svg.style.width = "100%";
        svg.style.height = "100px";

        // Start arrow
        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrow.setAttribute("d", "M 28 50 L 48 50 M 43 45 L 48 50 L 43 55");
        arrow.setAttribute("stroke", start);
        arrow.setAttribute("stroke-width", "2");
        arrow.setAttribute("fill", "none");
        svg.appendChild(arrow);

        // q0 node
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

        // q1 accepting node
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

        // Arrow marker defs
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