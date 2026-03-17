import { loadMathJax, MarkdownRenderChild, Plugin, TFile } from "obsidian";
import { SvgGraphEditor } from "./ui/SvgEditor";
import { GraphEdge, GraphNode, GraphViewport } from "./models/graph";
import { GraphTheme, THEME_PRESETS } from "./models/theme";
import { InGraphPluginSettings } from "./models/settings";
import { DEFAULT_SETTINGS } from "./models/settings";
import { InGraphSettingTab } from "./ui/settings";

interface GraphRecord
{
    nodes: GraphNode[];
    edges: GraphEdge[];
    theme?: GraphTheme;
    viewport?: GraphViewport;
    lineStart: number;
    linePrefix: string;
}

export default class InGraphPlugin extends Plugin
{
    settings: InGraphPluginSettings;

    private activeGraphs = new Map<string, GraphRecord>();
    private saveTimeout: NodeJS.Timeout | null = null;

    async onload(): Promise<void>
    {
        await this.loadSettings();
        await loadMathJax();

        this.addSettingTab(new InGraphSettingTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor("in-graph", async (source, el, ctx) =>
        {
            const sectionInfo = ctx.getSectionInfo(el);
            const blockId = sectionInfo?.lineStart.toString() || Math.random().toString();

            let nodes = [];
            let edges = [];
            let theme = undefined;
            let viewport = undefined;

            try
            {
                const data = JSON.parse(source);
                nodes = data.nodes || [];
                edges = data.edges || [];
                theme = data.theme;
                viewport = data.viewport;
            } catch (e)
            {
                nodes = [{ id: "q0", position: { x: 150, y: 250 }, label: "q0" }];
                edges = [];
            }

            // Find the true absolute line numbers by scanning the raw file.
            // getSectionInfo().lineStart is unreliable inside callouts (it's section-relative).
            // Instead we read the file, find every in-graph fence, and match by content.
            let linePrefix = "";
            let lineStart = -1;

            const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
            if (file instanceof TFile)
            {
                const rawContent = await this.app.vault.read(file);
                const rawLines = rawContent.split("\n");

                // Find all opening fences for in-graph blocks
                for (let i = 0; i < rawLines.length; i++)
                {
                    const stripped = rawLines[i].replace(/^((?:>\s*)*)/, "");
                    if (!/^```in-graph\s*$/.test(stripped)) continue;

                    // Found a fence — now collect all content lines until closing fence
                    const candidatePrefix = rawLines[i].match(/^((?:>\s*)*)/)?.[1] ?? "";
                    const contentLines: string[] = [];
                    let closeI = -1;
                    for (let j = i + 1; j < rawLines.length; j++)
                    {
                        const strippedJ = rawLines[j].startsWith(candidatePrefix)
                            ? rawLines[j].slice(candidatePrefix.length)
                            : rawLines[j];
                        if (/^```\s*$/.test(strippedJ))
                        {
                            closeI = j;
                            break;
                        }
                        // Strip the callout prefix to get the raw content
                        contentLines.push(strippedJ);
                    }
                    if (closeI === -1) continue;

                    // Compare against the source Obsidian gave us (trim to be safe)
                    const candidate = contentLines.join("\n").trim();
                    if (candidate === source.trim())
                    {
                        lineStart = i;
                        linePrefix = candidatePrefix;
                        break;
                    }
                }
            }

            if (lineStart === -1)
            {
                // Fallback: shouldn't normally happen
                console.warn("[in-graph] Could not locate block in raw file, saving disabled for this block");
            }

            const resolvedTheme = this.getResolvedTheme(theme);

            const record: GraphRecord = { nodes, edges, theme, viewport, lineStart, linePrefix };
            this.activeGraphs.set(blockId, record);

            const onSave = async (savedNodes: GraphNode[], savedEdges: GraphEdge[], savedTheme?: GraphTheme,
                                  savedViewport?: GraphViewport) =>
            {
                record.nodes = savedNodes;
                record.edges = savedEdges;
                record.theme = savedTheme;
                record.viewport = savedViewport;
            };

            const editor = new SvgGraphEditor(
                el, nodes, edges,
                viewport,
                resolvedTheme,
                onSave,
                () => this.batchSaveToFile()
            );

            const listenerComponent = new MarkdownRenderChild(el);
            const handleKeyDown = (e: KeyboardEvent) =>
            {
                if ((e.ctrlKey || e.metaKey) && e.key === "s")
                {
                    editor.forceSave();
                    this.batchSaveToFile();
                }
            };

            window.addEventListener("keydown", handleKeyDown, { capture: true });
            listenerComponent.unload = () =>
            {
                window.removeEventListener("keydown", handleKeyDown, { capture: true });
                editor.destroy();
                this.activeGraphs.delete(blockId);
            };
            ctx.addChild(listenerComponent);
        });
    }

    getResolvedTheme(blockThemeOverride?: GraphTheme): GraphTheme
    {
        if (this.settings.activeTheme === "Custom")
        {
            return { ...this.settings.customTheme, ...blockThemeOverride };
        }
        const preset = THEME_PRESETS.find(p => p.name === this.settings.activeTheme);
        return { ...(preset?.theme ?? {}), ...blockThemeOverride };
    }

    private batchSaveToFile()
    {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);

        this.saveTimeout = setTimeout(async () =>
        {
            const file = this.app.workspace.getActiveFile();
            if (!file || this.activeGraphs.size === 0) return;

            await this.app.vault.process(file, (data) =>
            {
                const lines = data.split("\n");

                // Sort records top-to-bottom so line offsets are applied in order
                const records = [...this.activeGraphs.values()]
                    .filter(r => r.lineStart >= 0)
                    .sort((a, b) => a.lineStart - b.lineStart);

                let lineOffset = 0; // accumulate shifts from earlier splices

                for (const record of records)
                {
                    const absOpen = record.lineStart + lineOffset;
                    const p = record.linePrefix;

                    // Sanity check: the line must still be our opening fence
                    const openLine = lines[absOpen] ?? "";
                    const openStripped = openLine.startsWith(p) ? openLine.slice(p.length) : openLine;
                    if (!/^```in-graph\s*$/.test(openStripped))
                    {
                        console.warn(`[in-graph] Fence not found at line ${absOpen} (got: "${openLine}"), skipping`);
                        continue;
                    }

                    // Find the closing fence — must have exactly the same prefix
                    let closeIdx = -1;
                    for (let i = absOpen + 1; i < lines.length; i++)
                    {
                        const s = lines[i].startsWith(p) ? lines[i].slice(p.length) : lines[i];
                        if (/^```\s*$/.test(s))
                        {
                            closeIdx = i;
                            break;
                        }
                        // Stop if we hit another opening fence (malformed doc guard)
                        if (/^```\w/.test(s)) break;
                    }

                    if (closeIdx === -1)
                    {
                        console.warn(`[in-graph] No closing fence for block at line ${absOpen}`);
                        continue;
                    }

                    const newJson = JSON.stringify({
                        nodes: record.nodes,
                        edges: record.edges,
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

    async loadSettings()
    {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings()
    {
        await this.saveData(this.settings);
    }
}