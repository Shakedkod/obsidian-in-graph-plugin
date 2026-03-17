import { loadMathJax, MarkdownRenderChild, Plugin } from "obsidian";
import { GraphEdge, GraphNode, SvgGraphEditor, GraphTheme, GraphViewport } from "./ui/SvgEditor";

export default class ReactStarterPlugin extends Plugin {
    private activeGraphs = new Map<string, { nodes: any[], edges: any[], theme: any, viewport: any, source: string }>();
    private saveTimeout: NodeJS.Timeout | null = null;

    async onload(): Promise<void> {
        await loadMathJax();
        this.registerMarkdownCodeBlockProcessor("in-graph", (source, el, ctx) => {
            const blockId = ctx.getSectionInfo(el)?.lineStart.toString() || Math.random().toString();

            let nodes = [];
            let edges = [];
            let theme = undefined; // Default to undefined so Obsidian classes take over
            let viewport = undefined;

            try {
                const data = JSON.parse(source);
                nodes = data.nodes || [];
                edges = data.edges || [];
                theme = data.theme; // Grab the theme if it exists
                viewport = data.viewport; // Grab the viewport if it exists
            } catch (e) {
                nodes = [{ id: "q0", position: { x: 150, y: 250 }, label: "q0" }];
                edges = [];
            }

            const onSave = async (nodes: GraphNode[], edges: GraphEdge[], theme?: GraphTheme, viewport?: GraphViewport) => {
                this.activeGraphs.set(blockId, { nodes, edges, theme, viewport, source });
            };

            const editor = new SvgGraphEditor(el, nodes, edges, viewport, theme, onSave, () => this.batchSaveToFile());

            const listenerComponent = new MarkdownRenderChild(el);
            const handleKeyDown = (e: KeyboardEvent) => {
                // Check for Ctrl+S or Cmd+S
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    editor.forceSave();
                    this.batchSaveToFile();
                }
            };

            window.addEventListener('keydown', handleKeyDown, { capture: true });
            listenerComponent.unload = () => {
                window.removeEventListener('keydown', handleKeyDown, { capture: true });
                editor.destroy();
                this.activeGraphs.delete(blockId);
            };
            ctx.addChild(listenerComponent);
        });
    }

    private batchSaveToFile() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);

        this.saveTimeout = setTimeout(async () => {
            const file = this.app.workspace.getActiveFile();
            if (!file || this.activeGraphs.size === 0) return;

            await this.app.vault.process(file, (data) => {
                let newData = data;

                for (const [, graphData] of this.activeGraphs) {
                    const newJson = JSON.stringify({
                        nodes: graphData.nodes,
                        edges: graphData.edges,
                        theme: graphData.theme,
                        viewport: graphData.viewport
                    }, null, 2);

                    // Try direct match first (normal code block)
                    if (newData.includes(graphData.source)) {
                        newData = newData.replace(graphData.source, newJson);
                        graphData.source = newJson;
                        continue;
                    }

                    // Callout match: source lines are prefixed with "> " in raw file
                    const calloutSource = graphData.source
                        .split('\n')
                        .map(line => `> ${line}`)
                        .join('\n');

                    if (newData.includes(calloutSource)) {
                        const calloutNewJson = newJson
                            .split('\n')
                            .map(line => `> ${line}`)
                            .join('\n');
                        newData = newData.replace(calloutSource, calloutNewJson);
                        // Store the clean version (Obsidian strips prefixes next time)
                        graphData.source = newJson;
                    }
                }
                return newData;
            });
        }, 50);
    }
}