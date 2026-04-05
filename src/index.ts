import { loadMathJax, MarkdownRenderChild, Plugin, TFile } from "obsidian";
import { SvgGraphEditor } from "./ui/SvgEditor";
import { GraphEdge, GraphGroup, GraphNode, GraphViewport } from "./models/graph";
import { GraphTheme, THEME_PRESETS } from "./models/theme";
import { InGraphPluginSettings } from "./models/settings";
import { DEFAULT_SETTINGS } from "./models/settings";
import { CircuitGate, CircuitWire } from "./models/circuits";
import { InGraphSettingTab } from "./ui/settings";
import { initSnippets } from "./services/LatexSnippets";

interface GraphRecord {
    graphId: string;
    sourcePath: string;
    // Set for new blocks (no id in file yet). Used by spliceGraphIntoContent to
    // locate the block by content on the first save, then cleared immediately.
    pendingSource: string | undefined;
    nodes: GraphNode[];
    edges: GraphEdge[];
    gates: CircuitGate[];
    wires: CircuitWire[];
    groups: GraphGroup[];
    theme: GraphTheme | undefined;
    viewport: GraphViewport | undefined;
    editor?: SvgGraphEditor;
    // Per-graph debounce timer
    saveTimeout: ReturnType<typeof setTimeout> | null;
    // True while a vault.process call is in flight for this graph.
    // If new changes arrive during a save, dirtyWhileSaving is set so
    // saveRecordToFile re-runs immediately after the current save finishes.
    isSaving: boolean;
    dirtyWhileSaving: boolean;
}

export default class InGraphPlugin extends Plugin {
    settings!: InGraphPluginSettings;

    private activeGraphs = new Map<string, GraphRecord>();
    private lastMousePos = { x: 0, y: 0 };
    private statusBarItem!: HTMLElement;
    private statusBarClearTimeout: ReturnType<typeof setTimeout> | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();
        await loadMathJax();

        this.addSettingTab(new InGraphSettingTab(this.app, this));
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.setText("");

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
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "G" }]
        });

        this.addCommand({
            id: "apply-writing-mode-dsl",
            name: "Apply Graph DSL (Nearest Graph)",
            callback: () => {
                const record = this.getClosestGraph();
                if (!record?.editor) return;
                record.editor.applyOpenDslText();
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "Enter" }]
        });

        this.registerMarkdownCodeBlockProcessor("in-graph", async (source, el, ctx) => {
            const sectionInfo = ctx.getSectionInfo(el);
            const blockId = sectionInfo?.lineStart.toString() ?? Math.random().toString();

            let id = `graph-${Math.random().toString(36).substr(2, 9)}`;
            let nodes: GraphNode[] = [];
            let edges: GraphEdge[] = [];
            let theme: GraphTheme | undefined = undefined;
            let viewport: GraphViewport | undefined = undefined;
            let gates: CircuitGate[] = [];
            let wires: CircuitWire[] = [];
            let groups: GraphGroup[] = [];

            let isNewBlock = false;
            try {
                const data = JSON.parse(source);
                if (data.id) {
                    id = data.id;
                } else {
                    isNewBlock = true;
                }
                nodes = data.nodes || [];
                edges = data.edges || [];
                gates = data.gates || [];
                wires = data.wires || [];
                groups = data.groups || [];
                theme = data.theme;
                viewport = data.viewport;
            } catch {
                // Empty or invalid JSON — new block
                isNewBlock = true;
                nodes = [{ id: "q0", position: { x: 150, y: 250 }, label: "q0" }];
                edges = [];
            }

            const resolvedTheme = this.getResolvedTheme(theme);

            const record: GraphRecord = {
                graphId: id,
                sourcePath: ctx.sourcePath,
                // For new blocks we store the raw source so spliceGraphIntoContent
                // can find the block by content on the FIRST save, then clear it.
                pendingSource: isNewBlock ? source : undefined,
                nodes,
                edges,
                gates,
                wires,
                groups,
                theme,
                viewport,
                saveTimeout: null,
                isSaving: false,
                dirtyWhileSaving: false,
            };
            this.activeGraphs.set(blockId, record);

            // Called by the editor whenever state changes — must be synchronous
            // because SvgEditor calls it without await.
            const onSave = (
                savedNodes: GraphNode[],
                savedEdges: GraphEdge[],
                savedId: string,
                _savedTheme?: GraphTheme,
                savedViewport?: GraphViewport,
                savedGates?: CircuitGate[],
                savedWires?: CircuitWire[],
                savedGroups?: GraphGroup[]
            ) => {
                record.graphId = savedId;
                record.nodes = savedNodes;
                record.edges = savedEdges;
                record.gates = savedGates ?? record.gates;
                record.wires = savedWires ?? record.wires;
                record.groups = savedGroups ?? record.groups;
                record.viewport = savedViewport;
            };

            const triggerSave = () => this.scheduleSaveForRecord(record);

            const editor = new SvgGraphEditor(
                el, id, nodes, edges, gates, wires,
                groups, viewport,
                resolvedTheme,
                onSave,
                triggerSave,
                this.settings.dslMode ?? "bottom",
                this.settings.clickBgOpensDsl ?? false,
                this.settings.straightWires ?? false
            );
            record.editor = editor;

            const listenerComponent = new MarkdownRenderChild(el);

            const handleKeyDown = (e: KeyboardEvent) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                    editor.forceSave();
                    if (record.saveTimeout) {
                        clearTimeout(record.saveTimeout);
                        record.saveTimeout = null;
                    }
                    this.saveRecordToFile(record);
                }
            };

            // Save when focus leaves the graph entirely.
            // focusout bubbles (unlike blur), so it fires when any child loses focus.
            // We check relatedTarget to ensure focus moved outside the container,
            // not just between two elements inside it (e.g. clicking a toolbar button).
            const handleFocusOut = (e: FocusEvent) => {
                const relatedTarget = e.relatedTarget as Node | null;
                if (!el.contains(relatedTarget)) {
                    editor.forceSave();
                    this.scheduleSaveForRecord(record);
                }
            };

            el.addEventListener("focusout", handleFocusOut);
            window.addEventListener("keydown", handleKeyDown, { capture: true });

            listenerComponent.unload = () => {
                el.removeEventListener("focusout", handleFocusOut);
                window.removeEventListener("keydown", handleKeyDown, { capture: true });
                if (record.saveTimeout) clearTimeout(record.saveTimeout);
                editor.destroy();
                this.activeGraphs.delete(blockId);
            };
            ctx.addChild(listenerComponent);
        });
    }

    /**
     * Schedules a debounced save for a single graph record.
     * Each graph has its own timer so they never interfere with each other.
     */
    private scheduleSaveForRecord(record: GraphRecord, delayMs = 500) {
        if (record.saveTimeout) clearTimeout(record.saveTimeout);
        record.saveTimeout = setTimeout(() => {
            record.saveTimeout = null;
            this.saveRecordToFile(record);
        }, delayMs);
    }

    /**
     * Saves a single graph back into its source file.
     *
     * Strategy: locate the block by scanning for the graphId inside each in-graph
     * fence at save-time. This means we never rely on stale line numbers — the
     * block is always found correctly even after edits above it or inside callouts.
     */
    private async saveRecordToFile(record: GraphRecord): Promise<void> {
        if (record.isSaving) {
            record.dirtyWhileSaving = true;
            return;
        }
        record.isSaving = true;
        record.dirtyWhileSaving = false;

        try {
            const file = this.app.vault.getAbstractFileByPath(record.sourcePath);
            if (!(file instanceof TFile)) return;

            const newJson = JSON.stringify({
                id: record.graphId,
                nodes: record.nodes,
                edges: record.edges,
                gates: record.gates?.length ? record.gates : undefined,
                wires: record.wires?.length ? record.wires : undefined,
                groups: record.groups?.length ? record.groups : undefined,
                theme: record.theme,
                viewport: record.viewport,
            }, null, 2);

            await this.app.vault.process(file, (data) => {
                return this.spliceGraphIntoContent(data, record.graphId, newJson, record.pendingSource);
            });

            record.pendingSource = undefined;
            this.showSaveStatus();
        } catch (err) {
            console.error(`[in-graph] Failed to save graph "${record.graphId}"`, err);
        } finally {
            record.isSaving = false;
            if (record.dirtyWhileSaving) {
                record.dirtyWhileSaving = false;
                this.saveRecordToFile(record);
            }
        }
    }

    private spliceGraphIntoContent(data: string, graphId: string, newJson: string, pendingSource?: string): string {
        const lines = data.split("\n");
        const trimmedPending = pendingSource?.trim();

        for (let i = 0; i < lines.length; i++) {
            const fenceMatch = lines[i].match(/^((?:>\s*)*)```in-graph\s*$/);
            if (!fenceMatch) continue;

            const prefix = fenceMatch[1];
            const contentLines: string[] = [];
            let closeIdx = -1;

            for (let j = i + 1; j < lines.length; j++) {
                const stripped = lines[j].startsWith(prefix)
                    ? lines[j].slice(prefix.length)
                    : lines[j];

                if (/^```\s*$/.test(stripped)) { closeIdx = j; break; }
                if (/^```\w/.test(stripped)) break;
                contentLines.push(stripped);
            }

            if (closeIdx === -1) continue;

            const blockSource = contentLines.join("\n").trim();

            let blockId: string | undefined;
            try { blockId = JSON.parse(blockSource)?.id; } catch { /* skip */ }

            const isIdMatch = blockId === graphId;
            const isNewBlockMatch = !isIdMatch
                && trimmedPending !== undefined
                && blockSource === trimmedPending
                && !blockId;

            if (!isIdMatch && !isNewBlockMatch) continue;

            const newContentLines = newJson.split("\n").map(l => `${prefix}${l}`);
            lines.splice(i + 1, closeIdx - i - 1, ...newContentLines);
            break;
        }

        return lines.join("\n");
    }

    /**
     * Updates the status bar with a save confirmation that auto-clears after 2s.
     * Multiple rapid saves collapse into one message rather than spamming the console.
     */
    private showSaveStatus() {
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        this.statusBarItem.setText(`✓ in-graph saved · ${time}`);

        if (this.statusBarClearTimeout) clearTimeout(this.statusBarClearTimeout);
        this.statusBarClearTimeout = setTimeout(() => {
            this.statusBarItem.setText("");
            this.statusBarClearTimeout = null;
        }, 2000);
    }

    private getClosestGraph(): GraphRecord | null {
        let closest: GraphRecord | null = null;
        let minDist = Infinity;

        for (const record of this.activeGraphs.values()) {
            if (!record.editor) continue;

            const rect = record.editor.container.getBoundingClientRect();
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

    async loadCustomSnippets() {
        const path = this.settings.snippetsPath;
        if (!path) {
            initSnippets();
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            try {
                const content = await this.app.vault.read(file);
                const parsed = new Function(`return ${content};`)();
                if (Array.isArray(parsed)) {
                    initSnippets(parsed);
                    console.log(`Loaded ${parsed.length} custom snippets from ${path}`);
                } else {
                    console.error("Snippets file must evaluate to an array.");
                    initSnippets();
                }
            } catch (e) {
                console.error("Failed to load custom snippets", e);
                initSnippets();
            }
        } else {
            console.error(`Snippets file not found: ${path}`);
            initSnippets();
        }
    }
}