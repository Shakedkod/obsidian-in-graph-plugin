import { loadMathJax, MarkdownRenderChild, Plugin, TFile } from "obsidian";
import { SvgGraphEditor } from "./ui/SvgEditor";
import { GraphEdge, GraphGroup, GraphNode, GraphViewport } from "./models/graph";
import { GraphTheme, THEME_PRESETS } from "./models/theme";
import { InGraphPluginSettings } from "./models/settings";
import { DEFAULT_SETTINGS } from "./models/settings";
import { CircuitGate, CircuitWire } from "./models/circuits";
import { InGraphSettingTab } from "./ui/settings";

interface GraphRecord {
    nodes: GraphNode[];
    edges: GraphEdge[];
    gates: CircuitGate[];
    wires: CircuitWire[];
    groups: GraphGroup[];
    theme: GraphTheme | undefined;
    viewport: GraphViewport | undefined;
    lineStart: number;
    linePrefix: string;
    editor?: SvgGraphEditor;
}

export default class InGraphPlugin extends Plugin {
    settings: InGraphPluginSettings;

    private activeGraphs = new Map<string, GraphRecord>();
    private saveTimeout: NodeJS.Timeout | null = null;
    private lastMousePos = { x: 0, y: 0 };

    async onload(): Promise<void> {
        await this.loadSettings();
        await loadMathJax();

        this.addSettingTab(new InGraphSettingTab(this.app, this));

        window.addEventListener("mousemove", (e) => {
            this.lastMousePos = { x: e.clientX, y: e.clientY };
        });

        this.addCommand({
            id: "toggle-writing-mode",
            name: "Toggle Graph Writing Mode",
            callback: () => {
                const record = this.getClosestGraph();
                if (!record?.editor) return;

                record.editor.toggleWritingMode();
            },
            hotkeys: [
                {
                    modifiers: ["Mod", "Shift"],
                    key: "G"
                }
            ]
        });

        this.addCommand({
            id: "apply-writing-mode-dsl",
            name: "Apply Graph DSL (Nearest Graph)",
            callback: () => {
                const record = this.getClosestGraph();
                if (!record?.editor) return;

                record.editor.applyOpenDslText();
            },
            hotkeys: [
                {
                    modifiers: ["Mod", "Shift"],
                    key: "Enter"
                }
            ]
        });

        this.registerMarkdownCodeBlockProcessor("in-graph", async (source, el, ctx) => {
            const sectionInfo = ctx.getSectionInfo(el);
            const blockId = sectionInfo?.lineStart.toString() || Math.random().toString();

            let nodes = [];
            let edges = [];
            let theme = undefined;
            let viewport = undefined;

            let gates: CircuitGate[] = [];
            let wires: CircuitWire[] = [];
            let groups: GraphGroup[] = [];

            try {
                const data = JSON.parse(source);
                nodes = data.nodes || [];
                edges = data.edges || [];
                gates = data.gates || [];
                wires = data.wires || [];
                groups = data.groups || [];
                theme = data.theme;
                viewport = data.viewport;
            } catch (e) {
                nodes = [{ id: "q0", position: { x: 150, y: 250 }, label: "q0" }];
                edges = [];
            }

            // Find the true absolute line numbers by scanning the raw file.
            // getSectionInfo().lineStart is unreliable inside callouts (it's section-relative).
            // Instead we read the file, find every in-graph fence, and match by content.
            let linePrefix = "";
            let lineStart = -1;

            const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
            if (file instanceof TFile) {
                const rawContent = await this.app.vault.read(file);
                const rawLines = rawContent.split("\n");

                // Find all opening fences for in-graph blocks
                for (let i = 0; i < rawLines.length; i++) {
                    const stripped = rawLines[i].replace(/^((?:>\s*)*)/, "");
                    if (!/^```in-graph\s*$/.test(stripped)) continue;

                    // Found a fence — now collect all content lines until closing fence
                    const candidatePrefix = rawLines[i].match(/^((?:>\s*)*)/)?.[1] ?? "";
                    const contentLines: string[] = [];
                    let closeI = -1;
                    for (let j = i + 1; j < rawLines.length; j++) {
                        const strippedJ = rawLines[j].startsWith(candidatePrefix)
                            ? rawLines[j].slice(candidatePrefix.length)
                            : rawLines[j];
                        if (/^```\s*$/.test(strippedJ)) {
                            closeI = j;
                            break;
                        }
                        // Strip the callout prefix to get the raw content
                        contentLines.push(strippedJ);
                    }
                    if (closeI === -1) continue;

                    // Compare against the source Obsidian gave us (trim to be safe)
                    const candidate = contentLines.join("\n").trim();
                    if (candidate === source.trim()) {
                        lineStart = i;
                        linePrefix = candidatePrefix;
                        break;
                    }
                }
            }

            if (lineStart === -1) {
                // Fallback: shouldn't normally happen
                console.warn("[in-graph] Could not locate block in raw file, saving disabled for this block");
            }

            const resolvedTheme = this.getResolvedTheme(theme);

            const record: GraphRecord = { nodes, edges, gates, wires, groups, theme, viewport, lineStart, linePrefix };
            this.activeGraphs.set(blockId, record);

            const onSave = async (savedNodes: GraphNode[], savedEdges: GraphEdge[], _savedTheme?: GraphTheme,
                savedViewport?: GraphViewport, savedGates?: CircuitGate[], savedWires?: CircuitWire[],
                savedGroups?: GraphGroup[]) => {
                record.nodes = savedNodes;
                record.edges = savedEdges;
                record.gates = savedGates ?? record.gates;
                record.wires = savedWires ?? record.wires;
                record.groups = savedGroups ?? record.groups;
                record.viewport = savedViewport;
            };

            const editor = new SvgGraphEditor(
                el, nodes, edges, gates, wires,
                groups, viewport,
                resolvedTheme,
                onSave,
                () => this.batchSaveToFile(),
                this.settings.dslMode ?? "bottom",
                this.settings.clickBgOpensDsl ?? false,
                this.settings.straightWires ?? false
            );
            record.editor = editor;

            const listenerComponent = new MarkdownRenderChild(el);
            const handleKeyDown = (e: KeyboardEvent) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                    editor.forceSave();
                    this.batchSaveToFile();
                }
            };

            window.addEventListener("keydown", handleKeyDown, { capture: true });
            listenerComponent.unload = () => {
                window.removeEventListener("keydown", handleKeyDown, { capture: true });
                editor.destroy();
                this.activeGraphs.delete(blockId);
            };
            ctx.addChild(listenerComponent);
        });
    }

    private getClosestGraph(): GraphRecord | null {
        let closest: GraphRecord | null = null;
        let minDist = Infinity;

        for (const record of this.activeGraphs.values()) {
            if (!record.editor) continue;

            const rect = record.editor.container.getBoundingClientRect();

            // Distance from mouse to rectangle (0 if inside)
            const dx = Math.max(rect.left - this.lastMousePos.x, 0, this.lastMousePos.x - rect.right);
            const dy = Math.max(rect.top - this.lastMousePos.y, 0, this.lastMousePos.y - rect.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist) {
                minDist = dist;
                closest = record;
            }
        }

        return closest;
    }

    getResolvedTheme(blockThemeOverride?: GraphTheme): GraphTheme {
        if (this.settings.activeTheme === "Custom") {
            return { ...this.settings.customTheme, ...blockThemeOverride };
        }
        const preset = THEME_PRESETS.find(p => p.name === this.settings.activeTheme);
        return { ...(preset?.theme ?? {}), ...blockThemeOverride };
    }

    private batchSaveToFile() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);

        this.saveTimeout = setTimeout(async () => {
            const file = this.app.workspace.getActiveFile();
            if (!file || this.activeGraphs.size === 0) return;

            await this.app.vault.process(file, (data) => {
                const lines = data.split("\n");

                // Sort records top-to-bottom so line offsets are applied in order
                const records = [...this.activeGraphs.values()]
                    .filter(r => r.lineStart >= 0)
                    .sort((a, b) => a.lineStart - b.lineStart);

                let lineOffset = 0; // accumulate shifts from earlier splices

                for (const record of records) {
                    const absOpen = record.lineStart + lineOffset;
                    const p = record.linePrefix;

                    // Sanity check: the line must still be our opening fence
                    const openLine = lines[absOpen] ?? "";
                    const openStripped = openLine.startsWith(p) ? openLine.slice(p.length) : openLine;
                    if (!/^```in-graph\s*$/.test(openStripped)) {
                        console.warn(`[in-graph] Fence not found at line ${absOpen} (got: "${openLine}"), skipping`);
                        continue;
                    }

                    // Find the closing fence — must have exactly the same prefix
                    let closeIdx = -1;
                    for (let i = absOpen + 1; i < lines.length; i++) {
                        const s = lines[i].startsWith(p) ? lines[i].slice(p.length) : lines[i];
                        if (/^```\s*$/.test(s)) {
                            closeIdx = i;
                            break;
                        }
                        // Stop if we hit another opening fence (malformed doc guard)
                        if (/^```\w/.test(s)) break;
                    }

                    if (closeIdx === -1) {
                        console.warn(`[in-graph] No closing fence for block at line ${absOpen}`);
                        continue;
                    }

                    const newJson = JSON.stringify({
                        nodes: record.nodes,
                        edges: record.edges,
                        gates: record.gates?.length ? record.gates : undefined,
                        wires: record.wires?.length ? record.wires : undefined,
                        groups: record.groups?.length ? record.groups : undefined,
                        theme: record.theme,
                        viewport: record.viewport
                    }, null, 2);

                    const newContentLines = newJson.split("\n").map(l => `${p}${l}`);
                    const oldCount = closeIdx - absOpen - 1;
                    const newCount = newContentLines.length;

                    lines.splice(absOpen + 1, oldCount, ...newContentLines);

                    lineOffset += newCount - oldCount;
                }

                return lines.join("\n");
            });

            console.log(`Saved ${this.activeGraphs.size} graphs.`);
        }, 50);
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.refreshAllGraphThemes();
    }

    private refreshAllGraphThemes() {
        for (const [, record] of this.activeGraphs) {
            if (!record.editor) continue;
            const newTheme = this.getResolvedTheme(record.theme);
            record.editor.applyTheme(newTheme);
        }
    }
}