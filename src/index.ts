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
            let currentSource = source;

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
                const file = this.app.workspace.getActiveFile();
                if (!file) return;

                // Generate the new formatted JSON
                const newJson = JSON.stringify({ nodes, edges, theme, viewport }, null, 2);

                // Get standard Obsidian block info (Works everywhere EXCEPT callouts)
                const info = ctx.getSectionInfo(el);

                this.app.vault.process(file, (data) => {
                    const lines = data.split('\n');

                    // --- STRATEGY 1: NATIVE OBSIDIAN TRACKER (Normal Graphs) ---
                    if (info) {
                        const startLine = lines[info.lineStart];
                        const prefixMatch = startLine.match(/^([>\s]*)/);
                        const prefix = prefixMatch ? prefixMatch[1] : "";

                        const newLines = newJson.split('\n').map(l => prefix + l);
                        lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...newLines);

                        currentSource = newJson; // Update memory
                        return lines.join('\n');
                    }

                    // --- STRATEGY 2: CALLOUT HUNTER (When getSectionInfo is broken) ---
                    let blockStart = -1;
                    let blockEnd = -1;
                    let currentBlockContent = [];
                    let blockPrefix = "";
                    let insideBlock = false;

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];

                        if (!insideBlock) {
                            const matchStart = line.match(/^([>\s]*)```in-graph/);
                            if (matchStart) {
                                insideBlock = true;
                                blockStart = i;
                                blockPrefix = matchStart[1]; // Capture the "> " callout arrows
                                currentBlockContent = [];
                            }
                        } else {
                            const matchEnd = line.match(/^[>\s]*```/);
                            if (matchEnd) {
                                insideBlock = false;
                                blockEnd = i;

                                const reconstructedSource = currentBlockContent.join('\n');

                                // EXACT MATCH CHECK: Ensure we only update THIS specific graph!
                                // (We strip hidden carriage returns \r just to be safe on Windows)
                                if (reconstructedSource.replace(/\r/g, '').trim() === currentSource.replace(/\r/g, '').trim()) {

                                    const newLines = newJson.split('\n').map(l => blockPrefix + l);
                                    lines.splice(blockStart + 1, blockEnd - blockStart - 1, ...newLines);

                                    currentSource = newJson; // Update memory for the next drag!
                                    return lines.join('\n');
                                }
                            } else {
                                // Safely strip the callout arrows to read the raw JSON
                                let cleanLine = line;
                                if (blockPrefix && line.startsWith(blockPrefix)) {
                                    cleanLine = line.slice(blockPrefix.length);
                                } else {
                                    cleanLine = line.replace(/^[>\s]*/, '');
                                }
                                currentBlockContent.push(cleanLine);
                            }
                        }
                    }

                    // Failsafe: if we somehow don't find a match, return the file completely untouched
                    return data;
                });
            };

            const editor = new SvgGraphEditor(el, nodes, edges, theme, viewport, onSave);

            const listenerComponent = new MarkdownRenderChild(el);
            const handleKeyDown = (e: KeyboardEvent) => {
                // Check for Ctrl+S or Cmd+S
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    editor.forceSave();
                }
            };

            window.addEventListener('keydown', handleKeyDown, { capture: true });
            listenerComponent.unload = () => {
                window.removeEventListener('keydown', handleKeyDown, { capture: true });
            };
            ctx.addChild(listenerComponent);
        });
    }
}