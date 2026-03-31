import { finishRenderMath, renderMath } from "obsidian";
import { GraphEdge, GraphGroup, GraphNode, GraphViewport, Position } from "../models/graph";
import { DEFAULT_THEME, GraphTheme } from "../models/theme";
import { CircuitGate, CircuitWire, GATE_SIZE, GateType } from "../models/circuits";
import { CircuitSimulator, getPortPositions } from "../services/circuitSimulator";
import { ParserOutput } from "src/models/parser";
import parseDSL, { serializeToDSL } from "src/services/DslParser";

export class SvgGraphEditor {
    static persistedMode = "none";

    container: HTMLElement;
    svg: SVGSVGElement;

    private contextMenu: HTMLDivElement;
    private unsavedDot: HTMLDivElement;
    private svgWrapper: HTMLDivElement;
    private contentArea: HTMLDivElement;

    private viewBox = { x: 0, y: 0, w: 800, h: 500 };
    private isPanning = false;
    private panStart: Position = { x: 0, y: 0 };
    private panStartViewBox: Position = { x: 0, y: 0 };
    private panScale = { x: 1, y: 1 };
    private dragStartPos: Position = { x: 0, y: 0 };
    private hasMovedEnough = false;
    private cachedCTM: DOMMatrix | null = null;

    nodes: GraphNode[];
    edges: GraphEdge[];
    groups: GraphGroup[] = [];
    theme: GraphTheme;

    // ── Circuit fields ──
    gates: CircuitGate[] = [];
    wires: CircuitWire[] = [];
    private simulator: CircuitSimulator = new CircuitSimulator([], []);
    private gateElements: Map<string, SVGGElement> = new Map();
    private wireElements: Map<string, SVGPathElement> = new Map();
    private draggedWireWaypoint: { wire: CircuitWire; wpId: string } | null = null;
    private draggedGate: CircuitGate | null = null;
    private wiringFrom: { gateId: string; port: string; pos: { x: number; y: number } } | null = null;
    private wiringPreviewLine: SVGLineElement | null = null;

    // Group fields
    private groupElements: Map<string, SVGGElement> = new Map();
    private draggedGroup: GraphGroup | null = null;
    private draggedGroupResize: GraphGroup | null = null;
    private resizeStartSize: { w: number; h: number } | null = null;
    private resizeStartMouse: Position | null = null;

    private nodeElements: Map<string, SVGGElement> = new Map();
    private edgeElements: Map<string, {
        hitbox: SVGPathElement,
        path: SVGPathElement,
        label: SVGForeignObjectElement,
        handleGroup: SVGGElement
    }> = new Map();

    private draggedNode: GraphNode | null = null;
    private draggedWaypoint: { edge: GraphEdge, wpId: string } | null = null;
    private dragOffset: Position = { x: 0, y: 0 };

    // Multi-select
    private selectedIds: Set<string> = new Set();
    private toolbar: HTMLDivElement | null = null;

    // Undo history
    private history: { nodes: any[]; edges: any[]; gates: any[]; wires: any[]; groups: any[] }[] = [];
    private readonly MAX_HISTORY = 50;
    private undoBtn: HTMLButtonElement | null = null;

    // Linking state
    private isLinkingMode = false;
    private linkSourceNode: string | null = null;

    // Hover link button overlay
    private linkButton: SVGGElement | null = null;
    private hoveredNodeId: string | null = null;

    // Writing Mode
    private writingPanel: HTMLDivElement | null = null;
    private writingTextarea: HTMLTextAreaElement | null = null;
    private dslMode: "bottom" | "sidebar" = "bottom";
    private clickBgOpensDsl = false;
    private straightWires = false;

    private onSave: (nodes: GraphNode[], edges: GraphEdge[], theme?: GraphTheme, viewport?: GraphViewport) => void;
    private onManualSave: () => void;

    constructor(
        container: HTMLElement,
        initialNodes: GraphNode[],
        initialEdges: GraphEdge[],
        initialGates: CircuitGate[] = [],
        initialWires: CircuitWire[] = [],
        initialGroups: GraphGroup[] = [],
        initialViewport: GraphViewport | undefined,
        userTheme: GraphTheme | undefined,
        onSave: (nodes: GraphNode[], edges: GraphEdge[], theme?: GraphTheme, viewport?: GraphViewport) => void,
        onManualSave: () => void,
        dslMode: "bottom" | "sidebar" = "bottom",
        clickBgOpensDsl = false,
        straightWires = false
    ) {
        this.container = container;
        this.container.addClass("automaton-graph-container");

        const initHeight = initialViewport?.height ? Math.max(100, initialViewport.height) : 300;
        this.container.style.height = `${initHeight}px`;

        this.nodes = initialNodes;
        this.edges = initialEdges;
        this.gates = initialGates;
        this.wires = initialWires;
        this.groups = initialGroups;
        this.simulator = new CircuitSimulator(this.gates, this.wires);
        this.simulator.propagate();
        this.onSave = onSave;
        this.onManualSave = onManualSave;
        this.dslMode = dslMode;
        this.clickBgOpensDsl = clickBgOpensDsl;
        this.straightWires = straightWires;
        this.theme = { ...DEFAULT_THEME, ...userTheme };

        // container is always flex-col: toolbar on top, contentArea below
        this.container.style.display = "flex";
        this.container.style.flexDirection = "column";

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.classList.add("automaton-svg-canvas");
        this.svgWrapper = document.createElement("div");
        this.svgWrapper.style.flex = "1";
        this.svgWrapper.style.minWidth = "0";
        this.svgWrapper.style.minHeight = "0";
        this.svgWrapper.style.position = "relative";

        // contentArea holds svgWrapper + writing panel; switches flex direction for sidebar
        this.contentArea = document.createElement("div");
        this.contentArea.style.display = "flex";
        this.contentArea.style.flexDirection = "column";
        this.contentArea.style.flex = "1";
        this.contentArea.style.minHeight = "0";
        this.contentArea.style.overflow = "hidden";

        this.svgWrapper.appendChild(this.svg);
        this.contentArea.appendChild(this.svgWrapper);
        this.container.appendChild(this.contentArea);

        if (initialViewport?.viewBox) {
            this.viewBox = { ...initialViewport.viewBox };
            if (this.viewBox.h > 10000 || this.viewBox.w > 10000 || this.viewBox.h < 10) {
                this.viewBox = { x: 0, y: 0, w: 800, h: initHeight };
            }
        } else {
            this.viewBox = { x: 0, y: 0, w: 800, h: initHeight };
        }
        this.updateViewBox();

        this.buildDOM();
        this.buildUnsavedDot();
        this.buildContextMenu();
        this.buildToolbar();
        this.buildResizer();
        this.initEvents();
        this.updatePositions();
        if (!initialViewport?.viewBox) this.fitViewToContent();
    }

    // ─── SAVE ───────────────────────────────────────────────────────────────────

    private getContentViewBox(pad = 50): { x: number; y: number; w: number; h: number } {
        const xs: number[] = [];
        const ys: number[] = [];

        this.nodes.forEach(n => {
            xs.push(n.position.x - 35, n.position.x + 35);
            ys.push(n.position.y - 35, n.position.y + 35);
        });
        this.gates.forEach(g => {
            xs.push(g.position.x - 35, g.position.x + 35);
            ys.push(g.position.y - 30, g.position.y + 40);
        });
        this.groups.forEach(g => {
            xs.push(g.x, g.x + g.w);
            ys.push(g.y - 14, g.y + g.h);
        });

        if (xs.length === 0) return { ...this.viewBox };

        const minX = Math.min(...xs) - pad;
        const minY = Math.min(...ys) - pad;
        const maxX = Math.max(...xs) + pad;
        const maxY = Math.max(...ys) + pad;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    // Expand viewBox to ensure it contains all content (no clipping), preserving center + zoom
    private clampViewBoxToContent(vb: { x: number; y: number; w: number; h: number }): {
        x: number;
        y: number;
        w: number;
        h: number
    } {
        const content = this.getContentViewBox(20);
        return {
            x: Math.min(vb.x, content.x),
            y: Math.min(vb.y, content.y),
            w: Math.max(vb.x + vb.w, content.x + content.w) - Math.min(vb.x, content.x),
            h: Math.max(vb.y + vb.h, content.y + content.h) - Math.min(vb.y, content.y)
        };
    }

    private triggerSave(forceFileWrite = false) {
        // Snapshot current state before applying the change
        this.pushHistory();

        const h = Math.max(100, this.container.clientHeight || parseInt(this.container.style.height) || 300);
        // Save the user's current view, but expanded to never clip content
        const savedViewBox = this.clampViewBoxToContent({ ...this.viewBox });
        const currentViewport: GraphViewport = { height: h, viewBox: savedViewBox };

        if (forceFileWrite) {
            (this.onSave as (n: GraphNode[], e: GraphEdge[], t?: GraphTheme, v?: GraphViewport, g?: CircuitGate[],
                w?: CircuitWire[], grp?: GraphGroup[]) => void)(
                    this.nodes, this.edges, this.theme, currentViewport, this.gates, this.wires, this.groups
                );
            this.unsavedDot.style.opacity = "0";
        } else {
            this.unsavedDot.style.opacity = "1";
        }

        this.onGraphChanged();
    }

    public forceSave(): void {
        this.triggerSave(true);
    }

    // ─── VIEWPORT ───────────────────────────────────────────────────────────────

    private updateViewBox() {
        this.svg.setAttribute("viewBox", `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
    }

    public fitViewToContent() {
        const fitted = this.getContentViewBox(60);
        this.viewBox = fitted;
        this.updateViewBox();
    }

    // ─── HISTORY ────────────────────────────────────────────────────────────────

    private pushHistory() {
        this.history.push({
            nodes:  JSON.parse(JSON.stringify(this.nodes)),
            edges:  JSON.parse(JSON.stringify(this.edges)),
            gates:  JSON.parse(JSON.stringify(this.gates)),
            wires:  JSON.parse(JSON.stringify(this.wires)),
            groups: JSON.parse(JSON.stringify(this.groups)),
        });
        if (this.history.length > this.MAX_HISTORY)
            this.history.shift();
        this.updateUndoButton();
    }

    public undo() {
        if (this.history.length === 0) return;
        const snap = this.history.pop()!;
        this.nodes  = snap.nodes;
        this.edges  = snap.edges;
        this.gates  = snap.gates;
        this.wires  = snap.wires;
        this.groups = snap.groups;
        this.simulator.rebuild(this.gates, this.wires);
        this.simulator.propagate();
        this.buildDOM();
        this.updatePositions();
        this.updateUndoButton();
        this.onGraphChanged();
        // Mark as unsaved without pushing another snapshot
        this.unsavedDot.style.opacity = "1";
    }

    private updateUndoButton() {
        if (!this.undoBtn) return;
        const canUndo = this.history.length > 0;
        this.undoBtn.disabled = !canUndo;
        this.undoBtn.style.opacity = canUndo ? "1" : "0.35";
        this.undoBtn.style.cursor  = canUndo ? "pointer" : "default";
    }

    // ─── TOOLBAR ────────────────────────────────────────────────────────────────

    private buildToolbar() {
        if (this.toolbar) this.toolbar.remove();

        const bar = document.createElement("div");
        bar.className = "automaton-toolbar";

        const sep = () => {
            const d = document.createElement("div");
            d.style.cssText = "width:1px;height:16px;background:var(--background-modifier-border);margin:0 3px";
            bar.appendChild(d);
        };

        const btn = (title: string, svg: string, onClick: () => void) => {
            const b = document.createElement("button");
            b.title = title;
            b.innerHTML = svg;
            b.className = "automaton-toolbar-button";
            b.onmouseenter = () => { b.style.background = "var(--background-modifier-hover)"; b.style.color = "var(--text-normal)"; };
            b.onmouseleave = () => { b.style.background = "transparent"; b.style.color = "var(--text-muted)"; };
            b.onclick = (e) => { e.stopPropagation(); onClick(); };
            bar.appendChild(b);
            return b;
        };

        const I = (d: string, vb = "0 0 16 16") => `<svg width="14" height="14" viewBox="${vb}" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${d}</svg>`;

        // ── Undo ──
        this.undoBtn = btn("Undo (Ctrl+Z)", I('<path d="M4 4 C4 2 6 1 8 1 C11.3 1 14 3.7 14 7 C14 10.3 11.3 13 8 13 L8 11 C10.2 11 12 9.2 12 7 C12 4.8 10.2 3 8 3 C6.8 3 5.8 3.6 5.2 4.5 L7 4.5 L7 6 L2 6 L2 1 L3.5 1 L3.5 3 C4.2 2.1 5.5 1 8 1"/>'), () => this.undo());
        this.updateUndoButton();
        sep();
        // ── Align ──
        btn("Align left edges",         I('<rect x="1" y="2" width="2" height="12"/><rect x="3" y="4" width="8" height="3" rx="1"/><rect x="3" y="9" width="11" height="3" rx="1"/>'), () => this.alignSelection("left"));
        btn("Align centers horizontally",I('<rect x="7" y="1" width="2" height="14"/><rect x="3" y="4" width="10" height="3" rx="1"/><rect x="4" y="9" width="8" height="3" rx="1"/>'), () => this.alignSelection("centerH"));
        btn("Align right edges",         I('<rect x="13" y="2" width="2" height="12"/><rect x="5" y="4" width="8" height="3" rx="1"/><rect x="2" y="9" width="11" height="3" rx="1"/>'), () => this.alignSelection("right"));
        sep();
        btn("Align top edges",           I('<rect x="2" y="1" width="12" height="2"/><rect x="4" y="3" width="3" height="8" rx="1"/><rect x="9" y="3" width="3" height="11" rx="1"/>'), () => this.alignSelection("top"));
        btn("Align middles vertically",  I('<rect x="1" y="7" width="14" height="2"/><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="4" width="3" height="8" rx="1"/>'), () => this.alignSelection("centerV"));
        btn("Align bottom edges",        I('<rect x="2" y="13" width="12" height="2"/><rect x="4" y="5" width="3" height="8" rx="1"/><rect x="9" y="2" width="3" height="11" rx="1"/>'), () => this.alignSelection("bottom"));
        sep();
        // ── Distribute ──
        btn("Distribute horizontally",   I('<rect x="1" y="2" width="2" height="12"/><rect x="13" y="2" width="2" height="12"/><rect x="5" y="5" width="6" height="6" rx="1"/>'), () => this.distributeSelection("horizontal"));
        btn("Distribute vertically",     I('<rect x="2" y="1" width="12" height="2"/><rect x="2" y="13" width="12" height="2"/><rect x="5" y="5" width="6" height="6" rx="1"/>'), () => this.distributeSelection("vertical"));
        sep();
        // ── View ──
        btn("Fit view to content",       I('<path d="M1 1h5v2H3v3H1V1zm9 0h5v5h-2V3h-3V1zM1 10h2v3h3v2H1v-5zm12 3h-3v2h5v-5h-2v3z"/>'), () => { this.fitViewToContent(); });
        btn("Select all",                I('<rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>'), () => this.selectAll());
        sep();
        // ── DSL editor toggle ──
        btn("Toggle DSL editor (Ctrl+Shift+G)", I('<rect x="1" y="2" width="14" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="3" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.3"/><line x1="3" y1="9" x2="8" y2="9" stroke="currentColor" stroke-width="1.3"/>'), () => this.toggleWritingMode());

        // Insert toolbar before contentArea so it's always at the top
        this.container.insertBefore(bar, this.contentArea);
        this.toolbar = bar;
    }

    private getSelectableItems(): { id: string; position: Position }[] {
        return [
            ...this.nodes.map(n => ({ id: n.id, position: n.position })),
            ...this.gates.map(g => ({ id: g.id, position: g.position })),
        ];
    }

    private selectAll() {
        const all = this.getSelectableItems();
        this.selectedIds = new Set(all.map(i => i.id));
        this.refreshSelectionVisuals();
    }

    private clearSelection() {
        this.selectedIds.clear();
        this.refreshSelectionVisuals();
    }

    private toggleSelection(id: string, additive: boolean) {
        if (additive) {
            if (this.selectedIds.has(id)) this.selectedIds.delete(id);
            else this.selectedIds.add(id);
        } else {
            const wasOnly = this.selectedIds.size === 1 && this.selectedIds.has(id);
            this.selectedIds.clear();
            if (!wasOnly) this.selectedIds.add(id);
        }
        this.refreshSelectionVisuals();
    }

    private refreshSelectionVisuals() {
        for (const [id, el] of this.nodeElements) {
            const circle = el.querySelector("circle");
            if (circle) {
                const node = this.nodes.find(n => n.id === id);
                const baseStroke = node?.color || this.theme.nodeStroke || "var(--text-normal)";
                if (this.selectedIds.has(id)) {
                    circle.setAttribute("stroke", "var(--interactive-accent)");
                    circle.setAttribute("stroke-width", "3");
                } else {
                    circle.setAttribute("stroke", node?.isAccepting ? (this.theme.acceptCircle || baseStroke) : baseStroke);
                    circle.setAttribute("stroke-width", "2");
                }
            }
        }
        for (const [id, el] of this.gateElements) {
            const body = el.querySelector("path");
            if (body) {
                if (this.selectedIds.has(id)) {
                    body.setAttribute("filter", "drop-shadow(0 0 3px var(--interactive-accent))");
                } else {
                    body.removeAttribute("filter");
                }
            }
        }
    }

    private alignSelection(axis: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") {
        const ids = this.selectedIds.size >= 2
            ? this.selectedIds
            : new Set(this.getSelectableItems().map(i => i.id));
        if (ids.size < 2) return;

        const items = this.getSelectableItems().filter(i => ids.has(i.id));
        const xs = items.map(i => i.position.x);
        const ys = items.map(i => i.position.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        for (const item of items) {
            const node = this.nodes.find(n => n.id === item.id);
            const gate = this.gates.find(g => g.id === item.id);
            const target = node || gate;
            if (!target) continue;
            switch (axis) {
                case "left":     target.position = { ...target.position, x: minX }; break;
                case "centerH":  target.position = { ...target.position, x: (minX + maxX) / 2 }; break;
                case "right":    target.position = { ...target.position, x: maxX }; break;
                case "top":      target.position = { ...target.position, y: minY }; break;
                case "centerV":  target.position = { ...target.position, y: (minY + maxY) / 2 }; break;
                case "bottom":   target.position = { ...target.position, y: maxY }; break;
            }
        }
        this.updatePositions();
        this.triggerSave();
    }

    private distributeSelection(dir: "horizontal" | "vertical") {
        const ids = this.selectedIds.size >= 3
            ? this.selectedIds
            : new Set(this.getSelectableItems().map(i => i.id));
        if (ids.size < 3) return;

        const items = this.getSelectableItems()
            .filter(i => ids.has(i.id))
            .sort((a, b) => dir === "horizontal"
                ? a.position.x - b.position.x
                : a.position.y - b.position.y);

        const first = items[0].position;
        const last = items[items.length - 1].position;
        const totalSpan = dir === "horizontal" ? last.x - first.x : last.y - first.y;
        const step = totalSpan / (items.length - 1);

        items.forEach((item, i) => {
            const node = this.nodes.find(n => n.id === item.id);
            const gate = this.gates.find(g => g.id === item.id);
            const target = node || gate;
            if (!target) return;
            if (dir === "horizontal") {
                target.position = { ...target.position, x: Math.round(first.x + i * step) };
            } else {
                target.position = { ...target.position, y: Math.round(first.y + i * step) };
            }
        });
        this.updatePositions();
        this.triggerSave();
    }
    // ─── RESIZER ────────────────────────────────────────────────────────────────

    private buildResizer() {
        const resizer = document.createElement("div");
        resizer.className = "obsidian-automaton-resizer";
        resizer.onmouseenter = () => resizer.style.backgroundColor = "var(--interactive-accent)";
        resizer.onmouseleave = () => resizer.style.backgroundColor = "transparent";
        this.contentArea.appendChild(resizer);

        let isResizing = false, startY = 0, startHeight = 0, startViewBoxH = 0, scaleY = 1;

        resizer.addEventListener("mousedown", (e) => {
            e.preventDefault();
            isResizing = true;
            startY = e.clientY;
            startHeight = this.container.clientHeight || 300;
            startViewBoxH = this.viewBox.h;
            scaleY = startViewBoxH / startHeight;
            document.body.style.cursor = "ns-resize";
        });

        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const dy = e.clientY - startY;
            this.container.style.height = `${Math.max(100, startHeight + dy)}px`;
            this.viewBox.h = startViewBoxH + dy * scaleY;
            this.updateViewBox();
        });

        document.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
            }
        });
    }

    // ─── UNSAVED DOT ────────────────────────────────────────────────────────────

    private buildUnsavedDot() {
        this.unsavedDot = document.createElement("div");
        this.unsavedDot.className = "automaton-unsaved-dot";
        this.unsavedDot.style.opacity = "0";
        this.unsavedDot.title = "Unsaved changes — press Ctrl+S to save";
        this.container.appendChild(this.unsavedDot);
    }

    // ─── LINK BUTTON (hover overlay on nodes) ───────────────────────────────────

    private buildLinkButton() {
        if (this.linkButton) this.linkButton.remove();
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add("automaton-link-btn");
        g.style.cursor = "crosshair";
        g.style.display = "none";

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", "10");
        circle.setAttribute("fill", "var(--interactive-accent)");
        circle.setAttribute("stroke", "var(--background-primary)");
        circle.setAttribute("stroke-width", "2");

        const plus = document.createElementNS("http://www.w3.org/2000/svg", "text");
        plus.setAttribute("text-anchor", "middle");
        plus.setAttribute("dominant-baseline", "central");
        plus.setAttribute("font-size", "14");
        plus.setAttribute("font-weight", "bold");
        plus.setAttribute("fill", "white");
        plus.textContent = "+";

        g.appendChild(circle);
        g.appendChild(plus);
        this.svg.appendChild(g);
        this.linkButton = g;

        g.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.hoveredNodeId) return;
            this.startLinking(this.hoveredNodeId);
        });
    }

    private showLinkButton(node: GraphNode) {
        if (!this.linkButton) return;
        // Position at top-right of node circle
        const bx = node.position.x + 20;
        const by = node.position.y - 20;
        this.linkButton.setAttribute("transform", `translate(${bx}, ${by})`);
        this.linkButton.style.display = "block";
    }

    private hideLinkButton() {
        if (this.linkButton) this.linkButton.style.display = "none";
    }

    private startLinking(sourceId: string) {
        this.isLinkingMode = true;
        this.linkSourceNode = sourceId;
        this.svg.style.cursor = "crosshair";
        this.hideLinkButton();

        // Highlight source node
        const group = this.nodeElements.get(sourceId);
        group?.querySelector("circle")?.setAttribute("stroke", "var(--interactive-accent)");
    }

    // ─── DOT IMPORT ─────────────────────────────────────────────────────────────

    private showDotImportModal() {
        const overlay = document.createElement("div");
        overlay.addClass("automaton-modal-overlay");

        const modal = document.createElement("div");
        modal.addClass("automaton-modal-box");

        modal.createEl("h3", { text: "Import Graphviz (DOT)", cls: "automaton-modal-title" });

        const textarea = document.createElement("textarea");
        textarea.rows = 8;
        textarea.placeholder = "digraph G {\n  start -> q0;\n  q0 -> q1 [label=\"0, 1\"];\n  q1 [shape=doublecircle];\n}";
        textarea.addClass("automaton-modal-textarea");
        modal.appendChild(textarea);

        const buttonRow = modal.createDiv({ cls: "automaton-modal-button-row" });

        const cancelBtn = buttonRow.createEl("button", { text: "Cancel", cls: "automaton-modal-button" });
        cancelBtn.onclick = () => overlay.remove();

        const convertBtn = buttonRow.createEl("button", {
            text: "Convert",
            cls: "automaton-modal-button automaton-modal-button-primary"
        });
        convertBtn.onclick = () => {
            if (textarea.value.trim()) this.importFromDot(textarea.value);
            overlay.remove();
        };

        overlay.appendChild(modal);
        this.container.appendChild(overlay);
        textarea.focus();
    }

    // ─── LABEL RENDERING ────────────────────────────────────────────────────────

    private createLabelContent(text: string, color: string): HTMLElement {
        const container = document.createElement("div");
        container.addClass("automaton-label-container");

        const pill = document.createElement("div");
        pill.addClass("automaton-label-pill");
        pill.style.color = color;

        text.split(/(\$.*?\$)/g).forEach(part => {
            if (part.startsWith("$") && part.endsWith("$")) {
                try {
                    const mathEl = renderMath(part.slice(1, -1), false);
                    mathEl.style.margin = "0";
                    pill.appendChild(mathEl);
                } catch {
                    pill.appendChild(document.createTextNode(part));
                }
            } else if (part.length > 0) {
                const span = document.createElement("span");
                span.innerText = part;
                span.addClass("automaton-label-pill-text");
                pill.appendChild(span);
            }
        });

        container.appendChild(pill);
        return container;
    }

    // ─── EDGE PATH MATH ─────────────────────────────────────────────────────────

    private getEdgePathData(edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode): {
        path: string,
        lx: number,
        ly: number,
        hx: number,
        hy: number
    } {
        const sx = sourceNode.position.x, sy = sourceNode.position.y;
        const tx = targetNode.position.x, ty = targetNode.position.y;
        // Use per-node radius if set (dynamic sizing), else default
        const srcR = sourceNode.radius ?? 25;
        const tgtR = targetNode.radius ?? 25;
        const radius = srcR; // used for start-side; tgtR used for end-side below

        const getNormal = (dx: number, dy: number) => {
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            return { nx: dy / dist, ny: -dx / dist };
        };

        // 1. SELF-LOOPS
        if (sourceNode.id === targetNode.id && (!edge.waypoints || edge.waypoints.length <= 1)) {
            let loopAngle = -Math.PI / 2;
            let pushOut = 90, curvePeak = pushOut * 0.75;

            if (edge.waypoints?.length === 1) {
                const wp = edge.waypoints[0];
                loopAngle = Math.atan2(wp.y - sy, wp.x - sx);
                curvePeak = Math.max(30, Math.sqrt((wp.x - sx) ** 2 + (wp.y - sy) ** 2));
                pushOut = curvePeak / 0.75;
            } else {
                let sumX = 0, sumY = 0, count = 0;
                this.edges.forEach(e => {
                    const otherId = (e.source === sourceNode.id && e.target !== sourceNode.id) ? e.target :
                        (e.target === sourceNode.id && e.source !== sourceNode.id) ? e.source : null;
                    if (otherId) {
                        const other = this.nodes.find(n => n.id === otherId);
                        if (other) {
                            const dx = other.position.x - sx, dy = other.position.y - sy;
                            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                            sumX += dx / dist;
                            sumY += dy / dist;
                            count++;
                        }
                    }
                });
                if (count > 0 && (sumX !== 0 || sumY !== 0)) loopAngle = Math.atan2(sumY, sumX) + Math.PI;
                curvePeak = pushOut * 0.75;
            }

            const spread = 0.4, ctrlSpread = 0.5;
            return {
                path: `M ${sx + Math.cos(loopAngle - spread) * radius} ${sy + Math.sin(loopAngle - spread) * radius} C ${sx + Math.cos(loopAngle - ctrlSpread) * pushOut} ${sy + Math.sin(loopAngle - ctrlSpread) * pushOut}, ${sx + Math.cos(loopAngle + ctrlSpread) * pushOut} ${sy + Math.sin(loopAngle + ctrlSpread) * pushOut}, ${sx + Math.cos(loopAngle + spread) * radius} ${sy + Math.sin(loopAngle + spread) * radius}`,
                lx: sx + Math.cos(loopAngle) * curvePeak + Math.cos(loopAngle) * 12,
                ly: sy + Math.sin(loopAngle) * curvePeak + Math.sin(loopAngle) * 12,
                hx: 0, hy: 0
            };
        }

        // 2. MULTI-POINT PATH
        if (edge.waypoints?.length) {
            const wps = edge.waypoints;
            const firstWp = wps[0], lastWp = wps[wps.length - 1];

            const startAngle = Math.atan2(firstWp.y - sy, firstWp.x - sx);
            const startX = sx + Math.cos(startAngle) * radius;
            const startY = sy + Math.sin(startAngle) * radius;

            const dx = tx - lastWp.x, dy = ty - lastWp.y;
            const angle = Math.atan2(dy, dx);
            const endX = tx - Math.cos(angle) * (radius + 2);
            const endY = ty - Math.sin(angle) * (radius + 2);

            let path = `M ${startX} ${startY}`;
            for (let i = 0; i < wps.length; i++) {
                const wp = wps[i];
                if (wp.type === "linear") {
                    path += ` L ${wp.x} ${wp.y}`;
                } else {
                    if (wps.length === 1) {
                        const ctrlX = 2 * wp.x - 0.5 * startX - 0.5 * endX;
                        const ctrlY = 2 * wp.y - 0.5 * startY - 0.5 * endY;
                        path += ` Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
                    } else {
                        let targetX, targetY;
                        if (i + 1 < wps.length) {
                            const next = wps[i + 1];
                            targetX = next.type === "bezier" ? (wp.x + next.x) / 2 : next.x;
                            targetY = next.type === "bezier" ? (wp.y + next.y) / 2 : next.y;
                        } else {
                            targetX = endX;
                            targetY = endY;
                        }
                        path += ` Q ${wp.x} ${wp.y} ${targetX} ${targetY}`;
                    }
                }
            }
            if (lastWp.type !== "bezier") path += ` L ${endX} ${endY}`;

            const allPoints = [{ x: startX, y: startY }, ...wps, { x: endX, y: endY }];
            let totalDist = 0;
            const distances: number[] = [];
            for (let i = 0; i < allPoints.length - 1; i++) {
                const d = Math.sqrt((allPoints[i + 1].x - allPoints[i].x) ** 2 + (allPoints[i + 1].y - allPoints[i].y) ** 2);
                distances.push(d);
                totalDist += d;
            }

            const halfDist = totalDist / 2;
            let runningDist = 0, lx = 0, ly = 0;
            for (let i = 0; i < allPoints.length - 1; i++) {
                if (runningDist + distances[i] >= halfDist || i === allPoints.length - 2) {
                    const ratio = distances[i] === 0 ? 0 : (halfDist - runningDist) / distances[i];
                    const midX = allPoints[i].x + (allPoints[i + 1].x - allPoints[i].x) * ratio;
                    const midY = allPoints[i].y + (allPoints[i + 1].y - allPoints[i].y) * ratio;
                    const segDx = allPoints[i + 1].x - allPoints[i].x;
                    const segDy = allPoints[i + 1].y - allPoints[i].y;
                    const dist = distances[i] || 1;
                    lx = midX + (segDy / dist) * 12;
                    ly = midY + (-segDx / dist) * 12;
                    break;
                }
                runningDist += distances[i];
            }

            return { path, lx, ly, hx: 0, hy: 0 };
        }

        const dx = tx - sx, dy = ty - sy;
        const angle = Math.atan2(dy, dx);
        const hasReverse = this.edges.some(e => e.source === targetNode.id && e.target === sourceNode.id);

        // 3. TWO-WAY CURVE
        if (hasReverse) {
            const startX = sx + Math.cos(angle + 0.35) * radius;
            const startY = sy + Math.sin(angle + 0.35) * radius;
            const endX = tx + Math.cos(angle + Math.PI - 0.35) * tgtR;
            const endY = ty + Math.sin(angle + Math.PI - 0.35) * tgtR;
            const midX = (sx + tx) / 2, midY = (sy + ty) / 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const { nx, ny } = getNormal(dx, dy);
            const ctrlX = midX + nx * (dist * 0.2), ctrlY = midY + ny * (dist * 0.2);
            const hx = (midX + ctrlX) / 2, hy = (midY + ctrlY) / 2;
            return {
                path: `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`,
                lx: hx + nx * 12, ly: hy + ny * 12, hx, hy
            };
        }

        // 4. STRAIGHT LINE
        const startX = sx + Math.cos(angle) * radius, startY = sy + Math.sin(angle) * radius;
        const endX = tx - Math.cos(angle) * tgtR, endY = ty - Math.sin(angle) * tgtR;
        const { nx, ny } = getNormal(dx, dy);
        const hx = (startX + endX) / 2, hy = (startY + endY) / 2;
        return {
            path: `M ${startX} ${startY} L ${endX} ${endY}`,
            lx: hx + nx * 12, ly: hy + ny * 12, hx, hy
        };
    }

    // ─── DOM BUILD ──────────────────────────────────────────────────────────────

    private buildDOM() {
        const markerId = `arrow-${Math.random().toString(36).substring(2, 9)}`;
        this.svg.innerHTML = "";
        this.nodeElements.clear();
        this.edgeElements.clear();
        this.linkButton = null;

        this.groupElements.clear();

        // Draw groups first (behind everything)
        this.groups.forEach(group => {
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.dataset.groupId = group.id;

            // Main frame rect — drag target
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("rx", "8");
            rect.setAttribute("fill", group.color ? group.color + "18" : (this.theme.groupFill || "rgba(120,120,180,0.06)"));
            rect.setAttribute("stroke", group.color || this.theme.groupStroke || "var(--text-muted)");
            rect.setAttribute("stroke-width", "1.5");
            rect.setAttribute("stroke-dasharray", "6 4");
            rect.style.cursor = "move";
            rect.dataset.groupDragId = group.id;
            g.appendChild(rect);

            // Label pill background
            const labelBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            labelBg.setAttribute("rx", "4");
            labelBg.setAttribute("height", "20");
            labelBg.setAttribute("fill", group.color || this.theme.groupStroke || "var(--text-muted)");
            labelBg.setAttribute("opacity", "0.18");
            labelBg.setAttribute("pointer-events", "none");
            g.appendChild(labelBg);

            // Label text
            const labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            labelEl.setAttribute("font-size", "11");
            labelEl.setAttribute("font-weight", "600");
            labelEl.setAttribute("font-family", "var(--font-sans, sans-serif)");
            labelEl.setAttribute("fill", group.color || this.theme.text || "var(--text-normal)");
            labelEl.setAttribute("dominant-baseline", "central");
            labelEl.setAttribute("pointer-events", "none");
            labelEl.textContent = group.label || "Group";
            g.appendChild(labelEl);

            // Resize grip — 3 diagonal lines at bottom-right
            const grip = document.createElementNS("http://www.w3.org/2000/svg", "g");
            grip.dataset.groupResizeId = group.id;
            grip.style.cursor = "nwse-resize";
            for (let i = 0; i < 3; i++) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("stroke", group.color || this.theme.groupStroke || "var(--text-muted)");
                line.setAttribute("stroke-width", "1.5");
                line.setAttribute("stroke-linecap", "round");
                line.setAttribute("opacity", "0.5");
                line.dataset.groupResizeId = group.id;
                grip.appendChild(line);
            }
            g.appendChild(grip);

            this.svg.appendChild(g);
            this.groupElements.set(group.id, g);
        });

        // Arrow marker
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", markerId);
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "10");
        marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "5");
        marker.setAttribute("markerHeight", "5");
        marker.setAttribute("orient", "auto");
        const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        arrowPath.setAttribute("fill", this.theme.edgeStroke || "var(--text-muted)");
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        this.svg.appendChild(defs);

        // Edges
        this.edges.forEach(edge => {
            const edgeColor = edge.color || this.theme.edgeStroke || "var(--text-normal)";
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.dataset.edgeId = edge.id;
            group.style.cursor = "pointer";

            const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "path");
            hitbox.setAttribute("stroke", "rgba(0,0,0,0.01)");
            hitbox.setAttribute("stroke-width", "30");
            hitbox.setAttribute("fill", "none");
            hitbox.style.pointerEvents = "stroke";
            hitbox.style.cursor = "grab";

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("stroke", edgeColor);
            path.setAttribute("stroke-width", "2");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke-linecap", "butt");
            if (edge.type === "arrow") path.setAttribute("marker-end", `url(#${markerId})`);

            const foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            foreignObj.setAttribute("width", "1");
            foreignObj.setAttribute("height", "1");
            foreignObj.style.overflow = "visible";
            foreignObj.appendChild(this.createLabelContent(edge.label || "", this.theme.text!));

            const handleGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            handleGroup.setAttribute("opacity", edge.isBendable ? "0.4" : "0");
            handleGroup.style.transition = "opacity 0.2s";
            handleGroup.className.baseVal = "automaton-ui-element";

            edge.waypoints?.forEach(wp => {
                const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                handle.dataset.wpId = wp.id;
                handle.setAttribute("r", "8");
                handle.setAttribute("fill", wp.type === "bezier" ? "var(--interactive-accent)" : "#d97706");
                handle.style.cursor = "grab";
                handleGroup.appendChild(handle);
            });

            group.addEventListener("mouseenter", () => {
                if (edge.isBendable) {
                    handleGroup.setAttribute("opacity", "1");
                    hitbox.style.cursor = "crosshair";
                }
            });
            group.addEventListener("mouseleave", () => {
                handleGroup.setAttribute("opacity", edge.isBendable ? "0.4" : "0");
                hitbox.style.cursor = "pointer";
            });

            group.appendChild(hitbox);
            group.appendChild(path);
            group.appendChild(foreignObj);
            group.appendChild(handleGroup);
            this.svg.appendChild(group);
            this.edgeElements.set(edge.id, { hitbox, path, label: foreignObj, handleGroup });
        });

        // Nodes
        this.nodes.forEach(node => {
            const nodeColor = node.color || this.theme.nodeStroke || "var(--text-normal)";
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.style.cursor = "pointer";
            group.dataset.nodeId = node.id;
            const r = node.radius ?? 25;
            const innerR = Math.max(r - 5, r * 0.8);
            const arrowTip = -r;
            const arrowBase = -(r + 20);

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", "0");
            circle.setAttribute("cy", "0");
            circle.setAttribute("r", String(r));
            circle.setAttribute("stroke", node.isAccepting ? (this.theme.acceptCircle || nodeColor) : nodeColor);
            circle.setAttribute("fill", this.theme.nodeFill || "var(--background-primary)");
            circle.setAttribute("stroke-width", "2");
            group.appendChild(circle);

            if (node.isAccepting) {
                const inner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                inner.setAttribute("r", String(Math.round(innerR)));
                inner.setAttribute("fill", "none");
                inner.setAttribute("stroke", this.theme.acceptCircle || nodeColor);
                inner.setAttribute("stroke-width", "2");
                group.appendChild(inner);
            }

            if (node.isStart) {
                const startArrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
                startArrow.setAttribute("d", `M ${arrowBase} 0 L ${arrowTip} 0 M ${arrowTip - 5} -5 L ${arrowTip} 0 L ${arrowTip - 5} 5`);
                startArrow.setAttribute("fill", "none");
                startArrow.setAttribute("stroke", this.theme.startArrow || nodeColor);
                startArrow.setAttribute("stroke-width", "2");
                group.appendChild(startArrow);
            }

            const foreignObjNode = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            foreignObjNode.setAttribute("x", "0");
            foreignObjNode.setAttribute("y", "0");
            foreignObjNode.setAttribute("width", "1");
            foreignObjNode.setAttribute("height", "1");
            foreignObjNode.style.overflow = "visible";
            foreignObjNode.appendChild(this.createLabelContent(node.label, this.theme.text!));
            group.appendChild(foreignObjNode);

            // Hover → show link button
            group.addEventListener("mouseenter", () => {
                if (this.isLinkingMode || this.draggedNode) return;
                this.hoveredNodeId = node.id;
                this.showLinkButton(node);
            });
            group.addEventListener("mouseleave", (e) => {
                // Don't hide if the mouse moved to the link button itself
                const related = e.relatedTarget as Element;
                if (this.linkButton?.contains(related)) return;
                this.hoveredNodeId = null;
                this.hideLinkButton();
            });

            this.svg.appendChild(group);
            this.nodeElements.set(node.id, group);
        });

        // Link button lives on top of everything
        this.buildLinkButton();
        finishRenderMath();
        this.buildGateDOM();
    }

    // ─── POSITIONS ──────────────────────────────────────────────────────────────


    private updateGroupPositions() {
        this.groups.forEach(group => {
            const g = this.groupElements.get(group.id);
            if (!g) return;

            const rect = g.querySelector("rect[data-group-drag-id]") as SVGRectElement;
            const labelBg = g.querySelectorAll("rect")[1] as SVGRectElement;
            const labelEl = g.querySelector("text") as SVGTextElement;
            const grip = g.querySelector("g[data-group-resize-id]") as SVGGElement;

            if (rect) {
                rect.setAttribute("x", group.x.toString());
                rect.setAttribute("y", group.y.toString());
                rect.setAttribute("width", group.w.toString());
                rect.setAttribute("height", group.h.toString());
            }

            const textWidth = Math.max(60, (group.label || "Group").length * 7 + 16);
            if (labelBg) {
                labelBg.setAttribute("x", (group.x + 10).toString());
                labelBg.setAttribute("y", (group.y - 10).toString());
                labelBg.setAttribute("width", textWidth.toString());
            }
            if (labelEl) {
                labelEl.setAttribute("x", (group.x + 18).toString());
                labelEl.setAttribute("y", (group.y).toString());
            }

            // Resize grip: 3 diagonal lines at bottom-right corner
            if (grip) {
                const gx = group.x + group.w;
                const gy = group.y + group.h;
                const lines = grip.querySelectorAll("line");
                [6, 10, 14].forEach((o, i) => {
                    lines[i]?.setAttribute("x1", (gx - o).toString());
                    lines[i]?.setAttribute("y1", gy.toString());
                    lines[i]?.setAttribute("x2", gx.toString());
                    lines[i]?.setAttribute("y2", (gy - o).toString());
                });
            }
        });
    }

    private updatePositions() {
        this.nodes.forEach(node => {
            const group = this.nodeElements.get(node.id);
            if (group) group.setAttribute("transform", `translate(${node.position.x}, ${node.position.y})`);
        });

        this.edges.forEach(edge => {
            const src = this.nodes.find(n => n.id === edge.source);
            const tgt = this.nodes.find(n => n.id === edge.target);
            const els = this.edgeElements.get(edge.id);
            if (src && tgt && els) {
                const { path, lx, ly } = this.getEdgePathData(edge, src, tgt);
                els.path.setAttribute("d", path);
                els.hitbox.setAttribute("d", path);
                els.label.setAttribute("x", lx.toString());
                els.label.setAttribute("y", ly.toString());

                edge.waypoints?.forEach((wp, i) => {
                    const circles = els.handleGroup.querySelectorAll("circle");
                    if (circles[i]) {
                        circles[i].setAttribute("cx", wp.x.toString());
                        circles[i].setAttribute("cy", wp.y.toString());
                    }
                });
            }
        });
        this.updateGroupPositions();
    }

    // ─── MOUSE HELPERS ──────────────────────────────────────────────────────────

    private getMousePosition(evt: MouseEvent): Position {
        const CTM = this.cachedCTM || this.svg.getScreenCTM();
        if (!CTM) return { x: evt.clientX, y: evt.clientY };
        return { x: (evt.clientX - CTM.e) / CTM.a, y: (evt.clientY - CTM.f) / CTM.d };
    }

    // ─── CONTEXT MENU ───────────────────────────────────────────────────────────

    private buildContextMenu() {
        this.contextMenu = document.createElement("div");
        this.contextMenu.addClass("automaton-context-menu");
        document.body.appendChild(this.contextMenu);

        document.addEventListener("mousedown", (e) => {
            if (!this.contextMenu.contains(e.target as HTMLElement)) {
                this.contextMenu.style.display = "none";
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.cancelLinking();
                this.contextMenu.style.display = "none";
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
        });
    }

    private cancelLinking() {
        if (this.isLinkingMode) {
            this.isLinkingMode = false;
            this.linkSourceNode = null;
            this.svg.style.cursor = "grab";
            this.buildDOM();
            this.updatePositions();
        }
    }

    private showContextMenu(x: number, y: number) {
        this.contextMenu.style.display = "flex";
        this.contextMenu.style.visibility = "hidden";

        const menuRect = this.contextMenu.getBoundingClientRect();
        const nx = x + menuRect.width > window.innerWidth ? x - menuRect.width : x;
        const ny = y + menuRect.height > window.innerHeight ? y - menuRect.height : y;

        this.contextMenu.style.left = `${nx}px`;
        this.contextMenu.style.top = `${ny}px`;
        this.contextMenu.style.visibility = "visible";
    }

    private addMenuItem(text: string, onClick: () => void, variant: "normal" | "danger" | "accent" = "normal") {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.addClass("automaton-context-menu-item");
        if (variant === "danger") btn.addClass("automaton-context-menu-item-error");
        if (variant === "accent") btn.addClass("automaton-context-menu-accent");
        btn.onclick = (e) => {
            e.stopPropagation();
            this.contextMenu.style.display = "none";
            onClick();
        };
        this.contextMenu.appendChild(btn);
    }

    private addDivider() {
        const d = document.createElement("div");
        d.addClass("automaton-context-menu-divider");
        this.contextMenu.appendChild(d);
    }

    private addColorPicker(label: string, current: string | undefined, onChange: (c: string) => void) {
        const wrapper = document.createElement("div");
        wrapper.addClass("automaton-color-picker-wrapper");
        const span = document.createElement("span");
        span.textContent = label;
        const input = document.createElement("input");
        input.type = "color";
        input.addClass("automaton-color-picker-input");
        input.value = current || (document.body.classList.contains("theme-dark") ? "#ffffff" : "#000000");
        input.oninput = (e) => onChange((e.target as HTMLInputElement).value);
        wrapper.appendChild(span);
        wrapper.appendChild(input);
        this.contextMenu.appendChild(wrapper);
    }

    private addSubMenu(label: string, builder: (sub: HTMLElement) => void) {
        const wrapper = document.createElement("div");
        wrapper.addClass("automaton-context-submenu-wrapper");

        const btn = document.createElement("button");
        btn.textContent = label + " ›";
        btn.addClass("automaton-context-menu-item", "automaton-context-submenu-trigger");

        const sub = document.createElement("div");
        sub.addClass("automaton-context-submenu");
        builder(sub);

        wrapper.appendChild(btn);
        wrapper.appendChild(sub);
        this.contextMenu.appendChild(wrapper);
    }

    private addSubMenuItem(container: HTMLElement, text: string, onClick: () => void,
        variant: "normal" | "danger" | "accent" = "normal") {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.addClass("automaton-context-menu-item");
        if (variant === "danger") btn.addClass("automaton-context-menu-item-error");
        if (variant === "accent") btn.addClass("automaton-context-menu-accent");
        btn.onclick = (e) => {
            e.stopPropagation();
            this.contextMenu.style.display = "none";
            onClick();
        };
        container.appendChild(btn);
    }

    // ─── EVENTS ─────────────────────────────────────────────────────────────────

    private initEvents() {
        this.container.addEventListener("click", (e) => e.stopPropagation());
        this.container.addEventListener("pointerdown", (e) => e.stopPropagation());

        // ── CONTEXT MENU ──
        this.svg.addEventListener("contextmenu", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            this.contextMenu.innerHTML = "";

            const target = evt.target as SVGElement;
            const nodeGroup = target.closest("g[data-node-id]") as SVGGElement;
            const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;
            const wpHandle = target.closest("circle[data-wp-id]") as SVGCircleElement;
            const gateGroupCtx = target.closest("g[data-gate-id]") as SVGGElement;

            // NODE SECTION
            if (nodeGroup?.dataset.nodeId) {
                const node = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId);
                if (node) {
                    this.addMenuItem(node.isStart ? "Remove start" : "Set as start", () => {
                        node.isStart = !node.isStart;
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addMenuItem(node.isAccepting ? "Remove accepting" : "Set as accepting", () => {
                        node.isAccepting = !node.isAccepting;
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addColorPicker("Node color", node.color, (c) => {
                        node.color = c;
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addDivider();
                    this.addMenuItem("Delete state", () => {
                        this.nodes = this.nodes.filter(n => n.id !== node.id);
                        this.edges = this.edges.filter(e => e.source !== node.id && e.target !== node.id);
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    }, "danger");
                }
            }

            // EDGE SECTION
            else if (edgeGroup?.dataset.edgeId) {
                const edge = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                if (edge) {
                    if (wpHandle) {
                        // Waypoint sub-menu
                        const wpId = wpHandle.dataset.wpId;
                        const wpIdx = (edge.waypoints ?? []).findIndex(w => w.id === wpId);
                        const wp = edge.waypoints?.[wpIdx];
                        if (!wp) return;
                        this.addMenuItem(wp?.type === "bezier" ? "Change to linear" : "Change to bezier", () => {
                            if (!wp) return;
                            wp.type = wp.type === "bezier" ? "linear" : "bezier";
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        this.addDivider();
                        this.addMenuItem("Delete point", () => {
                            edge.waypoints?.splice(wpIdx, 1);
                            if (!edge.waypoints?.length) delete edge.waypoints;
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        }, "danger");
                    } else {
                        // Edge sub-menu
                        this.addMenuItem(edge.isBendable ? "Lock path" : "Unlock path", () => {
                            edge.isBendable = !edge.isBendable;
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        if (edge.isBendable) {
                            this.addMenuItem("Add bezier point", () => {
                                const mp = this.getMousePosition(evt);
                                (edge.waypoints ??= []).push({
                                    id: Date.now().toString(),
                                    x: mp.x,
                                    y: mp.y,
                                    type: "bezier"
                                });
                                this.buildDOM();
                                this.updatePositions();
                                this.triggerSave();
                            });
                            this.addMenuItem("Add linear point", () => {
                                const mp = this.getMousePosition(evt);
                                (edge.waypoints ??= []).push({
                                    id: Date.now().toString(),
                                    x: mp.x,
                                    y: mp.y,
                                    type: "linear"
                                });
                                this.buildDOM();
                                this.updatePositions();
                                this.triggerSave();
                            });
                        }
                        this.addColorPicker("Edge color", edge.color, (c) => {
                            edge.color = c;
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        this.addMenuItem(edge.type === "arrow" ? "Remove arrow" : "Add arrow", () => {
                            edge.type = edge.type === "arrow" ? undefined : "arrow";
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        this.addDivider();
                        this.addMenuItem("Delete edge", () => {
                            this.edges = this.edges.filter(e => e.id !== edge.id);
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        }, "danger");
                    }
                }
            }

            // GATE SECTION
            if (gateGroupCtx?.dataset.gateId) {
                const gate = this.gates.find(g => g.id === gateGroupCtx.dataset.gateId);
                if (gate) {
                    this.addMenuItem("Rename label", () => {
                        this.contextMenu.style.display = "none";
                        const gateEl = this.gateElements.get(gate.id);
                        if (!gateEl) return;
                        // Position inline editor near the gate in screen space
                        const ctm = this.svg.getScreenCTM();
                        const svgRect = this.svg.getBoundingClientRect();
                        const gx = gate.position.x;
                        const gy = gate.position.y;
                        const screenX = ctm ? (gx * ctm.a + ctm.e) - svgRect.left : gx;
                        const screenY = ctm ? (gy * ctm.d + ctm.f) - svgRect.top : gy;

                        const input = document.createElement("input");
                        input.type = "text";
                        input.value = gate.label ?? gate.type;
                        input.placeholder = "Label";
                        input.addClass("automaton-inline-editor");
                        input.style.left = `${screenX}px`;
                        input.style.top = `${screenY + 20}px`;
                        this.container.appendChild(input);
                        input.focus();
                        input.select();

                        let saved = false;
                        const save = () => {
                            if (saved) return;
                            saved = true;
                            gate.label = input.value;
                            input.remove();
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        };
                        input.addEventListener("blur", save);
                        input.addEventListener("keydown", (e) => {
                            if (e.key === "Enter") save();
                            if (e.key === "Escape") {
                                saved = true;
                                input.remove();
                            }
                        });
                    });
                    if (gate.type === "INPUT") {
                        this.addMenuItem("Toggle value", () => {
                            this.simulator.toggleInput(gate.id);
                            this.updateCircuitVisuals();
                            this.triggerSave();
                        });
                    }
                    this.addDivider();
                    this.addMenuItem("Export truth table", () => this.showTruthTableModal());
                    this.addDivider();
                    this.addMenuItem("Delete gate", () => {
                        const gId = gate.id;
                        this.gates = this.gates.filter(g => g.id !== gId);
                        this.wires = this.wires.filter(w => w.fromGate !== gId && w.toGate !== gId);
                        this.simulator.rebuild(this.gates, this.wires);
                        this.simulator.propagate();
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    }, "danger");
                }
            }

            const wireWpCtx = target.closest("circle[data-wire-wp-id]") as SVGCircleElement;
            if (wireWpCtx && !gateGroupCtx && !nodeGroup && !edgeGroup) {
                const wId = wireWpCtx.dataset.wireId ?? '';
                const wpId = wireWpCtx.dataset.wireWpId ?? '';
                const wire = this.wires.find(w => w.id === wId);
                const wp = wire?.waypoints?.find(w => w.id === wpId);

                if (wire && wp) {
                    this.addMenuItem(wp.type === 'bezier' ? "Change to linear" : "Change to bezier", () => {
                        wp.type = wp.type === 'bezier' ? 'linear' : 'bezier';
                        this.buildDOM(); this.updatePositions(); this.triggerSave();
                    });
                    this.addDivider();
                    this.addMenuItem("Delete point", () => {
                        wire.waypoints = wire.waypoints?.filter(w => w.id !== wpId);
                        if (!wire.waypoints?.length) delete wire.waypoints;
                        this.buildDOM(); this.updatePositions(); this.triggerSave();
                    }, "danger");
                }
            }

            // WIRE SECTION
            if (!gateGroupCtx && !nodeGroup && !edgeGroup) {
                // Match either the hitbox (direct target) or visible path
                const wireEl = (
                    target.dataset?.wireId ? target :
                        target.closest("[data-wire-id]")
                ) as SVGPathElement;
                if (wireEl?.dataset.wireId) {
                    const wire = this.wires.find(w => w.id === wireEl.dataset.wireId);
                    if (wire) {
                        this.addMenuItem(wire.isBendable ? "Lock path" : "Unlock path", () => {
                            wire.isBendable = !wire.isBendable;
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        if (wire.isBendable) {
                            this.addMenuItem("Add bezier point", () => {
                                const mp = this.getMousePosition(evt);
                                (wire.waypoints ??= []).push({
                                    id: Date.now().toString(),
                                    x: mp.x,
                                    y: mp.y,
                                    type: "bezier"
                                });
                                this.buildDOM();
                                this.updatePositions();
                                this.triggerSave();
                            });
                            this.addMenuItem("Add linear point", () => {
                                const mp = this.getMousePosition(evt);
                                (wire.waypoints ??= []).push({
                                    id: Date.now().toString(),
                                    x: mp.x,
                                    y: mp.y,
                                    type: "linear"
                                });
                                this.buildDOM();
                                this.updatePositions();
                                this.triggerSave();
                            });
                            this.addDivider();
                        }
                    }
                    this.addMenuItem("Delete wire", () => {
                        const delWireId = wireEl.dataset.wireId;
                        this.wires = this.wires.filter(w => w.id !== delWireId);
                        this.simulator.rebuild(this.gates, this.wires);
                        this.simulator.propagate();
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    }, "danger");
                } else {
                    // CANVAS SECTION
                    this.addMenuItem("Add state here", () => {
                        const mp = this.getMousePosition(evt);
                        const newId = `q${this.nodes.length}`;
                        this.nodes.push({ id: newId, position: { x: mp.x, y: mp.y }, label: newId });
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addDivider();
                    this.addSubMenu("Add gate", (sub) => {
                        const gateTypes: GateType[] = ["INPUT", "OUTPUT", "AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];
                        gateTypes.forEach(type => {
                            this.addSubMenuItem(sub, type, () => {
                                const mp = this.getMousePosition(evt);
                                const newGate: CircuitGate = {
                                    id: `g_${Date.now()}`,
                                    type,
                                    position: { x: mp.x, y: mp.y },
                                    label: (type === "INPUT" || type === "OUTPUT") ? "" : undefined
                                };
                                this.gates.push(newGate);
                                this.simulator.rebuild(this.gates, this.wires);
                                this.simulator.propagate();
                                this.buildDOM();
                                this.updatePositions();
                                this.triggerSave();
                            });
                        });
                    });
                    this.addDivider();
                    this.addMenuItem("Export truth table", () => this.showTruthTableModal());
                    this.addMenuItem("Add frame here", () => {
                        const mp = this.getMousePosition(evt);
                        this.groups.push({
                            id: `grp_${Date.now()}`,
                            label: "Group",
                            x: mp.x - 80,
                            y: mp.y - 60,
                            w: 220,
                            h: 160
                        });
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addMenuItem("Import DOT", () => this.showDotImportModal());
                    this.addDivider();
                    this.addMenuItem("Save", () => {
                        this.triggerSave(true);
                        this.onManualSave();
                    }, "accent");
                }
            }

            this.showContextMenu(evt.clientX, evt.clientY);
        });

        // ── SCROLL ZOOM ──
        this.svg.addEventListener("wheel", (evt) => {
            evt.preventDefault();
            const mousePos = this.getMousePosition(evt);
            const factor = Math.sign(evt.deltaY) > 0 ? 1.1 : 0.9;
            if (this.viewBox.w * factor > 10000 || this.viewBox.w * factor < 50) return;
            const ratioX = (mousePos.x - this.viewBox.x) / this.viewBox.w;
            const ratioY = (mousePos.y - this.viewBox.y) / this.viewBox.h;
            this.viewBox.w *= factor;
            this.viewBox.h *= factor;
            this.viewBox.x = mousePos.x - ratioX * this.viewBox.w;
            this.viewBox.y = mousePos.y - ratioY * this.viewBox.h;
            this.updateViewBox();
        });

        // ── DOUBLE CLICK (label edit) ──
        this.svg.addEventListener("dblclick", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const target = evt.target as SVGElement;
            const nodeGroup = target.closest("g[data-node-id]") as SVGGElement;
            const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;

            // Double-click on waypoint circle = clear all waypoints
            if (edgeGroup && target.nodeName.toLowerCase() === "circle") {
                const edge = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                if (edge?.isBendable) {
                    delete edge.waypoints;
                    this.updatePositions();
                    this.triggerSave();
                }
                return;
            }

            // Double-click on group label area → rename
            const groupDblEl = target.closest("[data-group-drag-id]") as SVGElement;
            if (groupDblEl?.dataset?.groupDragId) {
                const grp = this.groups.find(g => g.id === (groupDblEl as unknown as HTMLElement).dataset.groupDragId);
                if (grp) {
                    const input = document.createElement("input");
                    input.type = "text";
                    input.value = grp.label || "";
                    input.placeholder = "Frame label";
                    input.addClass("automaton-inline-editor");
                    input.style.left = `${evt.offsetX}px`;
                    input.style.top = `${evt.offsetY}px`;
                    this.container.appendChild(input);
                    input.focus();
                    input.select();
                    let saved = false;
                    const save = () => {
                        if (saved) return;
                        saved = true;
                        grp.label = input.value;
                        input.remove();
                        this.updateGroupPositions();
                        this.triggerSave();
                    };
                    input.addEventListener("blur", save);
                    input.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") save();
                        if (e.key === "Escape") {
                            saved = true;
                            input.remove();
                        }
                    });
                    return;
                }
            }

            let editTarget: GraphNode | GraphEdge | null = null;
            let currentText = "";

            if (nodeGroup?.dataset.nodeId) {
                editTarget = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId) || null;
                if (editTarget) currentText = (editTarget as GraphNode).label;
            } else if (edgeGroup?.dataset.edgeId) {
                editTarget = this.edges.find(e => e.id === edgeGroup.dataset.edgeId) || null;
                if (editTarget) currentText = (editTarget as GraphEdge).label || "";
            } else return;

            const input = document.createElement("input");
            input.type = "text";
            input.value = currentText;
            input.placeholder = "Use $...$ for MathJax";
            input.addClass("automaton-inline-editor");
            input.style.left = `${evt.offsetX}px`;
            input.style.top = `${evt.offsetY}px`;
            this.container.appendChild(input);
            input.focus();
            input.select();

            let saved = false;
            const save = () => {
                if (saved) return;
                saved = true;
                if (nodeGroup?.dataset.nodeId) {
                    const n = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId);
                    if (n) n.label = input.value;
                } else if (edgeGroup?.dataset.edgeId) {
                    const e = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                    if (e) e.label = input.value;
                }
                if (input.parentNode) input.remove();
                this.buildDOM();
                this.updatePositions();
                this.triggerSave();
            };

            input.addEventListener("blur", save);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                    saved = true;
                    input.remove();
                }
            });
        });

        // ── MOUSE DOWN ──
        this.svg.addEventListener("mousedown", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();

            // Middle click / Alt+click = pan
            if (evt.button === 1 || (evt.button === 0 && evt.altKey)) {
                this.isPanning = true;
                this.panScale = {
                    x: this.viewBox.w / (this.container.clientWidth || 800),
                    y: this.viewBox.h / (this.container.clientHeight || 300)
                };
                this.panStart = { x: evt.clientX, y: evt.clientY };
                this.panStartViewBox = { x: this.viewBox.x, y: this.viewBox.y };
                this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                this.hasMovedEnough = false;
                this.svg.style.cursor = "grabbing";
                return;
            }

            const target = evt.target as SVGElement;
            const wpHandle = target.closest("circle[data-wp-id]") as SVGCircleElement;
            const nodeGroup = target.closest("g[data-node-id]") as SVGGElement;

            // Group resize (check before drag so grip takes priority)
            const resizeEl = target.closest("[data-group-resize-id]") as SVGElement;
            if (resizeEl?.dataset?.groupResizeId) {
                const grp = this.groups.find(g => g.id === resizeEl.dataset.groupResizeId);
                if (grp) {
                    this.cachedCTM = this.svg.getScreenCTM();
                    this.draggedGroupResize = grp;
                    this.resizeStartSize = { w: grp.w, h: grp.h };
                    this.resizeStartMouse = this.getMousePosition(evt);
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                    return;
                }
            }

            // Group drag
            const groupDragEl = target.closest("[data-group-drag-id]") as SVGElement;
            if (groupDragEl?.dataset?.groupDragId) {
                const grp = this.groups.find(g => g.id === groupDragEl.dataset.groupDragId);
                if (grp) {
                    this.cachedCTM = this.svg.getScreenCTM();
                    const mp = this.getMousePosition(evt);
                    this.dragOffset = { x: mp.x - grp.x, y: mp.y - grp.y };
                    this.draggedGroup = grp;
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                    return;
                }
            }

            // Waypoint drag
            if (wpHandle) {
                const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;
                const edge = this.edges.find(e => e.id === edgeGroup?.dataset.edgeId);
                if (edge?.isBendable) {
                    this.cachedCTM = this.svg.getScreenCTM();
                    this.draggedWaypoint = { edge, wpId: wpHandle.dataset.wpId ?? "" };
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                    return;
                }
            }

            // Wire waypoint drag — must come before node drag
            const wireWpEl = target.closest("circle[data-wire-wp-id]") as SVGCircleElement;
            if (wireWpEl) {
                const wId = wireWpEl.dataset.wireId ?? "";
                const wpId = wireWpEl.dataset.wireWpId ?? "";
                const wire = this.wires.find(w => w.id === wId);
                if (wire?.isBendable) {
                    this.cachedCTM = this.svg.getScreenCTM();
                    this.draggedWireWaypoint = { wire, wpId };
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                    return;
                }
            }

            // Node click in link mode
            if (this.isLinkingMode && nodeGroup?.dataset.nodeId) {
                const clickedId = nodeGroup.dataset.nodeId;
                if (!this.linkSourceNode) {
                    this.startLinking(clickedId);
                } else {
                    this.edges.push({ id: `e_${Date.now()}`, source: this.linkSourceNode, target: clickedId });
                    this.linkSourceNode = null;
                    this.isLinkingMode = false;
                    this.svg.style.cursor = "grab";
                    this.buildDOM();
                    this.updatePositions();
                    this.triggerSave();
                }
                return;
            }

            // Normal node drag
            if (nodeGroup?.dataset.nodeId) {
                const node = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId) || null;
                if (node) {
                    this.toggleSelection(node.id, evt.shiftKey);
                    this.cachedCTM = this.svg.getScreenCTM();
                    const mp = this.getMousePosition(evt);
                    this.dragOffset = { x: mp.x - node.position.x, y: mp.y - node.position.y };
                    this.draggedNode = node;
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                    nodeGroup.style.cursor = "grabbing";
                }
            }

            // Port click → start/finish wiring
            const portEl = target.closest("circle[data-gate-port]") as SVGCircleElement;
            if (portEl) {
                evt.stopPropagation();
                const gateId = portEl.dataset.gateId ?? "";
                const port = portEl.dataset.gatePort ?? "";
                const gate = this.gates.find(g => g.id === gateId);
                if (!gate) return;
                const pp = getPortPositions(gate.type);
                const localPort = pp[port];
                const worldPos = { x: gate.position.x + localPort.x, y: gate.position.y + localPort.y };

                if (!this.wiringFrom) {
                    // Start wiring from an output port
                    if (port === "out") {
                        this.wiringFrom = { gateId, port, pos: worldPos };
                        this.startWiringPreview(worldPos);
                    }
                } else {
                    // Finish wiring to an input port
                    if (port !== "out" && this.wiringFrom.gateId !== gateId) {
                        // Check not already connected
                        const exists = this.wires.some(w => w.toGate === gateId && w.toPort === port);
                        if (!exists) {
                            this.wires.push({
                                id: `w_${Date.now()}`,
                                fromGate: this.wiringFrom.gateId,
                                fromPort: this.wiringFrom.port,
                                toGate: gateId,
                                toPort: port
                            });
                            this.simulator.rebuild(this.gates, this.wires);
                            this.simulator.propagate();
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        }
                    }
                    this.cancelWiring();
                }
                return;
            }

            // Gate body drag (INPUT toggle handled in endDrag when !hasMovedEnough)
            const gateGroup = target.closest("g[data-gate-id]") as SVGGElement;
            if (gateGroup?.dataset.gateId && !portEl) {
                const gate = this.gates.find(g => g.id === gateGroup.dataset.gateId) || null;
                if (gate) {
                    this.toggleSelection(gate.id, evt.shiftKey);
                    this.draggedGate = gate;
                    this.cachedCTM = this.svg.getScreenCTM();
                    const mp = this.getMousePosition(evt);
                    this.dragOffset = { x: mp.x - gate.position.x, y: mp.y - gate.position.y };
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                }
            }

            // Cancel wiring on background click
            if (this.wiringFrom && !portEl && !gateGroup) {
                this.cancelWiring();
            }

            // Clear selection when clicking empty canvas
            if (!nodeGroup && !gateGroup && !portEl && !wpHandle && !wireWpEl) {
                if (!evt.shiftKey) this.clearSelection();
                if (this.clickBgOpensDsl && !this.writingPanel && evt.button === 0) this.toggleWritingMode();
            }
        });

        // ── MOUSE MOVE ──
        this.svg.addEventListener("mousemove", (evt) => {
            if (this.isPanning) {
                this.viewBox.x = this.panStartViewBox.x - (evt.clientX - this.panStart.x) * this.panScale.x;
                this.viewBox.y = this.panStartViewBox.y - (evt.clientY - this.panStart.y) * this.panScale.y;
                this.updateViewBox();
                return;
            }

            const hasDrag = this.draggedNode || this.draggedWaypoint || this.draggedGate || this.draggedGroup || this.draggedGroupResize || this.draggedWireWaypoint;
            if (!this.hasMovedEnough && hasDrag) {
                const dist = Math.sqrt((evt.clientX - this.dragStartPos.x) ** 2 + (evt.clientY - this.dragStartPos.y) ** 2);
                if (dist < 3) {
                    // Still allow wiring preview to update even below threshold
                    if (this.wiringFrom && this.wiringPreviewLine) {
                        const mp2 = this.getMousePosition(evt);
                        this.wiringPreviewLine.setAttribute("x2", mp2.x.toString());
                        this.wiringPreviewLine.setAttribute("y2", mp2.y.toString());
                    }
                    return;
                }
                this.hasMovedEnough = true;
            }

            if (!hasDrag && !this.wiringFrom) return;
            evt.preventDefault();
            const mp = this.getMousePosition(evt);

            // Group resize
            if (this.draggedGroupResize && this.resizeStartSize && this.resizeStartMouse) {
                this.draggedGroupResize.w = Math.max(80, this.resizeStartSize.w + (mp.x - this.resizeStartMouse.x));
                this.draggedGroupResize.h = Math.max(60, this.resizeStartSize.h + (mp.y - this.resizeStartMouse.y));
                this.updateGroupPositions();
                return;
            }

            // Group drag
            if (this.draggedGroup) {
                this.draggedGroup.x = Math.round((mp.x - this.dragOffset.x) * 10) / 10;
                this.draggedGroup.y = Math.round((mp.y - this.dragOffset.y) * 10) / 10;
                this.updateGroupPositions();
                return;
            }

            if (this.draggedWaypoint) {
                const { edge, wpId } = this.draggedWaypoint;
                const wp = edge.waypoints?.find(w => w.id === (wpId ?? ""));
                if (wp) {
                    wp.x = Math.round(mp.x * 10) / 10;
                    wp.y = Math.round(mp.y * 10) / 10;
                    this.updatePositions();
                }
                return;
            }

            if (this.draggedNode) {
                const newX = Math.round((mp.x - this.dragOffset.x) * 10) / 10;
                const newY = Math.round((mp.y - this.dragOffset.y) * 10) / 10;
                const dx = newX - this.draggedNode.position.x;
                const dy = newY - this.draggedNode.position.y;
                this.draggedNode.position = { x: newX, y: newY };

                this.edges.forEach(edge => {
                    if (edge.waypoints) {
                        const dragId = this.draggedNode?.id ?? "";
                        const isSelf = edge.source === dragId && edge.target === dragId;
                        const isConnected = edge.source === dragId || edge.target === dragId;
                        edge.waypoints.forEach(wp => {
                            if (isSelf) {
                                wp.x += dx;
                                wp.y += dy;
                            } else if (isConnected) {
                                wp.x += dx / 2;
                                wp.y += dy / 2;
                            }
                        });
                    }
                });
                this.updatePositions();
            }

            // Wire waypoint dragging
            if (this.draggedWireWaypoint) {
                const { wire, wpId } = this.draggedWireWaypoint;
                const wp = wire.waypoints?.find(w => w.id === wpId);
                if (wp) {
                    wp.x = Math.round(mp.x * 10) / 10;
                    wp.y = Math.round(mp.y * 10) / 10;
                    this.updateGatePositions();
                }
                return;
            }

            // Gate dragging
            if (this.draggedGate) {
                this.draggedGate.position = {
                    x: Math.round((mp.x - this.dragOffset.x) * 10) / 10,
                    y: Math.round((mp.y - this.dragOffset.y) * 10) / 10
                };
                this.updateGatePositions();
            }

            // Wiring preview
            if (this.wiringFrom && this.wiringPreviewLine) {
                this.wiringPreviewLine.setAttribute("x2", mp.x.toString());
                this.wiringPreviewLine.setAttribute("y2", mp.y.toString());
            }
        });

        // ── MOUSE UP / LEAVE ──
        const endDrag = () => {
            this.cachedCTM = null;
            if (this.isPanning) {
                this.isPanning = false;
                this.svg.style.cursor = "grab";
            }
            if (this.draggedNode) {
                const group = this.nodeElements.get(this.draggedNode.id);
                if (group) group.style.cursor = "pointer";
                this.draggedNode = null;
                this.triggerSave(false);
            }
            if (this.draggedWaypoint) {
                this.draggedWaypoint = null;
                this.triggerSave(false);
            }
            if (this.draggedWireWaypoint) {
                this.draggedWireWaypoint = null;
                this.triggerSave(false);
            }
            if (this.draggedGroup) {
                this.draggedGroup = null;
                this.triggerSave(false);
            }
            if (this.draggedGroupResize) {
                this.draggedGroupResize = null;
                this.resizeStartSize = null;
                this.resizeStartMouse = null;
                this.triggerSave(false);
            }
            if (this.draggedGate) {
                if (!this.hasMovedEnough && this.draggedGate.type === "INPUT") {
                    this.simulator.toggleInput(this.draggedGate.id);
                    this.updateCircuitVisuals();
                }
                this.draggedGate = null;
                this.triggerSave(false);
            }
        };

        this.svg.addEventListener("mouseup", endDrag);
        this.svg.addEventListener("mouseleave", endDrag);

        this.triggerSave(false);
    }

    // ─── DOT IMPORT ─────────────────────────────────────────────────────────────

    private importFromDot(dotString: string) {
        const parsedNodes = new Map<string, GraphNode>();
        const parsedEdges: GraphEdge[] = [];

        const getNode = (id: string) => {
            if (!parsedNodes.has(id)) parsedNodes.set(id, { id, label: id, position: { x: 0, y: 0 } });
            return parsedNodes.get(id)!;
        };

        dotString.split("\n").forEach(rawLine => {
            const line = rawLine.trim();
            if (line.startsWith("//") || line.startsWith("digraph") || line === "}") return;

            const edgeMatch = line.match(/([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)(?:\s*\[(.*?)\])?/);
            if (edgeMatch) {
                const [, source, target, attrs = ""] = edgeMatch;
                if (source.toLowerCase() === "start" || source.toLowerCase() === "init") {
                    getNode(target).isStart = true;
                    return;
                }
                getNode(source);
                getNode(target);
                const labelMatch = attrs.match(/label\s*=\s*"([^"]+)"/);
                parsedEdges.push({
                    id: `e_${source}_${target}_${parsedEdges.length}`,
                    source,
                    target,
                    label: labelMatch?.[1] ?? ""
                });
                return;
            }

            const nodeMatch = line.match(/([a-zA-Z0-9_]+)\s*\[(.*?)\]/);
            if (nodeMatch && !line.includes("->")) {
                const [, id, attrs] = nodeMatch;
                const node = getNode(id);
                if (attrs.includes("shape=doublecircle")) node.isAccepting = true;
                const labelMatch = attrs.match(/label\s*=\s*"([^"]+)"/);
                if (labelMatch) node.label = labelMatch[1];
            }
        });

        const nodeArray = Array.from(parsedNodes.values());
        const radius = Math.max(100, nodeArray.length * 25);
        const centerX = this.svg.clientWidth / 2 || 250;

        nodeArray.forEach((node, i) => {
            const angle = Math.PI + (i / nodeArray.length) * Math.PI * 2;
            node.position = { x: centerX + radius * Math.cos(angle), y: 250 + radius * Math.sin(angle) };
        });

        this.nodes = nodeArray;
        this.edges = parsedEdges;
        this.buildDOM();
        this.updatePositions();
        this.triggerSave();
    }


    // ─── GATE RENDERING ─────────────────────────────────────────────────────────

    private buildGateDOM() {
        this.gateElements.clear();
        this.wireElements.clear();

        // Inject electricity animation style once
        if (!this.svg.querySelector("#wire-anim-style")) {
            const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
            style.id = "wire-anim-style";
            style.textContent = `
                .automaton-wire-active {
                    stroke-dasharray: 10 6;
                    animation: wire-flow 0.4s linear infinite;
                }
            `;
            this.svg.appendChild(style);
        }

        // Draw wires first (under gates)
        this.wires.forEach(wire => {
            // Invisible hitbox for easier clicking
            const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "path");
            hitbox.setAttribute("fill", "none");
            hitbox.setAttribute("stroke", "rgba(0,0,0,0.01)");
            hitbox.setAttribute("stroke-width", "18");
            hitbox.style.pointerEvents = "stroke";
            hitbox.style.cursor = "pointer";
            hitbox.dataset.wireId = wire.id;
            this.svg.appendChild(hitbox);

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-linecap", "round");
            path.dataset.wireId = wire.id;
            path.style.pointerEvents = "none";
            this.svg.appendChild(path);

            // Handle group for waypoints
            const handles = document.createElementNS("http://www.w3.org/2000/svg", "g");
            handles.classList.add("wire-handles");
            handles.setAttribute("opacity", wire.isBendable ? "0.8" : "0");
            handles.style.transition = "opacity 0.15s";
            handles.style.pointerEvents = wire.isBendable ? "all" : "none";
            this.svg.appendChild(handles);

            hitbox.addEventListener("mouseenter", () => {
                if (wire.isBendable) handles.setAttribute("opacity", "1");
            });
            hitbox.addEventListener("mouseleave", () => {
                handles.setAttribute("opacity", wire.isBendable ? "0.8" : "0");
            });

            this.wireElements.set(wire.id, path);
        });

        // Draw gates
        this.gates.forEach(gate => {
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.dataset.gateId = gate.id;
            g.style.cursor = "grab";

            // Gate body shape
            const bodyPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            bodyPath.setAttribute("stroke-width", "2");
            bodyPath.setAttribute("stroke-linecap", "round");
            bodyPath.setAttribute("stroke-linejoin", "round");
            g.appendChild(bodyPath);

            // Type label (centered on gate body)
            const typeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
            typeLabel.setAttribute("text-anchor", "middle");
            typeLabel.setAttribute("dominant-baseline", "central");
            typeLabel.setAttribute("font-size", "9");
            typeLabel.setAttribute("font-weight", "600");
            typeLabel.setAttribute("font-family", "var(--font-monospace, monospace)");
            typeLabel.setAttribute("pointer-events", "none");
            g.appendChild(typeLabel);

            // User label (below gate body)
            const userLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
            userLabel.setAttribute("text-anchor", "middle");
            userLabel.setAttribute("dominant-baseline", "auto");
            userLabel.setAttribute("font-size", "10");
            userLabel.setAttribute("font-family", "var(--font-sans, sans-serif)");
            userLabel.setAttribute("pointer-events", "none");
            g.appendChild(userLabel);

            // Port circles
            const ports = getPortPositions(gate.type);
            Object.entries(ports).forEach(([portName, localPos]) => {
                const portEl = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                portEl.setAttribute("r", "5");
                portEl.setAttribute("cx", localPos.x.toString());
                portEl.setAttribute("cy", localPos.y.toString());
                portEl.setAttribute("stroke-width", "1.5");
                portEl.style.cursor = portName === "out" ? "crosshair" : "cell";
                portEl.dataset.gateId = gate.id;
                portEl.dataset.gatePort = portName;

                portEl.addEventListener("mouseenter", () => {
                    portEl.setAttribute("r", "7");
                });
                portEl.addEventListener("mouseleave", () => {
                    portEl.setAttribute("r", "5");
                });
                g.appendChild(portEl);
            });

            this.svg.appendChild(g);
            this.gateElements.set(gate.id, g);
        });

        this.updateGatePositions();
    }

    private updateGatePositions() {
        const stroke = this.theme.gateStroke || this.theme.nodeStroke || "var(--text-normal)";
        const fill = this.theme.gateFill || this.theme.nodeFill || "var(--background-secondary)";
        const txt = this.theme.text || "var(--text-normal)";
        const activeWireColor = this.theme.wireActive || "#facc15";

        this.gates.forEach(gate => {
            const g = this.gateElements.get(gate.id);
            if (!g) return;
            g.setAttribute("transform", `translate(${gate.position.x}, ${gate.position.y})`);

            const active = this.simulator.getGateValue(gate.id);
            const gateFill = gate.type === "INPUT"
                ? (active ? "#22c55e" : fill)
                : gate.type === "OUTPUT"
                    ? (active ? "#22c55e" : fill)
                    : fill;

            const bodyPath = g.querySelector("path") as SVGPathElement;
            if (bodyPath) {
                bodyPath.setAttribute("d", this.getGateShape(gate.type));
                bodyPath.setAttribute("fill", gateFill);
                bodyPath.setAttribute("stroke", stroke);
            }

            // Two text elements: typeLabel (body center) and userLabel (below)
            const allTexts = Array.from(g.querySelectorAll("text")) as SVGTextElement[];
            const typeLabel = allTexts[0];
            const userLabel = allTexts[1];

            if (typeLabel) {
                typeLabel.setAttribute("x", "0");
                typeLabel.setAttribute("y", "0");
                typeLabel.setAttribute("fill", txt);
                if (gate.type === "INPUT" || gate.type === "OUTPUT") {
                    // Show value inside input/output shape
                    typeLabel.setAttribute("font-size", "11");
                    typeLabel.textContent = active ? "1" : "0";
                } else {
                    typeLabel.setAttribute("font-size", "9");
                    typeLabel.textContent = gate.type;
                }
            }
            if (userLabel) {
                userLabel.setAttribute("x", "0");
                userLabel.setAttribute("y", (GATE_SIZE.h / 2 + 13).toString());
                userLabel.setAttribute("fill", txt);
                userLabel.setAttribute("font-size", "10");
                const hasCustomLabel = gate.label !== undefined && gate.label !== "";
                userLabel.textContent = hasCustomLabel ? gate.label ?? "" : "";
            }

            // Update port colors
            const portEls = g.querySelectorAll("circle[data-gate-port]");
            portEls.forEach((el) => {
                const portEl = el as SVGCircleElement;
                const portName = portEl.dataset.gatePort ?? "";
                const isOut = portName === "out";
                const portActive = isOut
                    ? active
                    : this.simulator.getPortValue(gate.id, portName);
                portEl.setAttribute("fill", portActive ? "#22c55e" : fill);
                portEl.setAttribute("stroke", portActive ? "#16a34a" : stroke);
            });
        });

        // Update wire paths and colors
        this.wires.forEach(wire => {
            const pathEl = this.wireElements.get(wire.id);
            if (!pathEl) return;
            const fromGate = this.gates.find(g => g.id === wire.fromGate);
            const toGate = this.gates.find(g => g.id === wire.toGate);
            if (!fromGate || !toGate) return;

            const fromPorts = getPortPositions(fromGate.type);
            const toPorts = getPortPositions(toGate.type);
            const fp = fromPorts[wire.fromPort];
            const tp = toPorts[wire.toPort];

            if (!fp || !tp) return;

            const x1 = fromGate.position.x + fp.x;
            const y1 = fromGate.position.y + fp.y;
            const x2 = toGate.position.x + tp.x;
            const y2 = toGate.position.y + tp.y;

            // Build path: use waypoints if present, else default cubic bezier
            let wirePath: string;
            if (wire.waypoints && wire.waypoints.length > 0) {
                const wps = wire.waypoints;
                let p = `M ${x1} ${y1}`;
                if (wps.length === 1) {
                    const cp = wps[0];
                    const cx = 2 * cp.x - 0.5 * x1 - 0.5 * x2;
                    const cy = 2 * cp.y - 0.5 * y1 - 0.5 * y2;
                    p += ` Q ${cx} ${cy} ${x2} ${y2}`;
                } else {
                    wps.forEach((wp, i) => {
                        if (wp.type === "linear") {
                            p += ` L ${wp.x} ${wp.y}`;
                        } else {
                            const next = wps[i + 1];
                            const tx = next ? (next.type === "bezier" ? (wp.x + next.x) / 2 : next.x) : x2;
                            const ty = next ? (next.type === "bezier" ? (wp.y + next.y) / 2 : next.y) : y2;
                            p += ` Q ${wp.x} ${wp.y} ${tx} ${ty}`;
                        }
                    });
                    if (wps[wps.length - 1].type !== "bezier") p += ` L ${x2} ${y2}`;
                }
                wirePath = p;
            } else {
                wirePath = `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;
            }

            // Sync hitbox (element before the visible path)
            const hitboxEl = pathEl.previousElementSibling as SVGPathElement;
            if (hitboxEl?.dataset.wireId === wire.id) {
                hitboxEl.setAttribute("d", wirePath);
            }
            pathEl.setAttribute("d", wirePath);

            const active = this.simulator.getWireValue(wire);
            pathEl.setAttribute("stroke", active ? activeWireColor : (this.theme.edgeStroke || "var(--text-muted)"));
            pathEl.setAttribute("stroke-width", active ? "2.5" : "2");
            if (active) {
                pathEl.classList.add("automaton-wire-active");
            } else {
                pathEl.classList.remove("automaton-wire-active");
            }

            // Draw waypoint handles if wire is bendable
            const handleGroup = pathEl.nextElementSibling as SVGGElement;
            if (handleGroup && handleGroup.classList.contains("wire-handles")) {
                handleGroup.innerHTML = "";
                handleGroup.style.pointerEvents = wire.isBendable ? "all" : "none";
                if (wire.isBendable && wire.waypoints) {
                    wire.waypoints.forEach(wp => {
                        const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                        circ.setAttribute("cx", wp.x.toString());
                        circ.setAttribute("cy", wp.y.toString());
                        circ.setAttribute("r", "6");
                        circ.setAttribute("fill", wp.type === "bezier" ? "var(--interactive-accent)" : "#d97706");
                        circ.setAttribute("stroke", "var(--background-primary)");
                        circ.setAttribute("stroke-width", "1.5");
                        circ.setAttribute("opacity", "0.7");
                        circ.dataset.wireWpId = wp.id;
                        circ.dataset.wireId = wire.id;
                        circ.style.cursor = "grab";
                        handleGroup.appendChild(circ);
                    });
                }
            }
        });
    }

    private updateCircuitVisuals() {
        this.simulator.propagate();
        this.updateGatePositions();
    }

    // IEEE gate shapes in local coords centered at 0,0
    private getGateShape(type: GateType): string {
        const { w, h } = GATE_SIZE;  // w=54, h=40
        const hw = w / 2, hh = h / 2;

        switch (type) {
            case 'AND':
                return [
                    `M ${-hw} ${-hh}`,
                    `L ${0} ${-hh}`,
                    `C ${hw + 4} ${-hh} ${hw + 4} ${hh} ${0} ${hh}`,  // control points pushed out so curve peaks at hw
                    `L ${-hw} ${hh}`,
                    `Z`,
                ].join(' ');

            case 'NAND':
                return [
                    `M ${-hw} ${-hh}`,
                    `L ${0} ${-hh}`,
                    `C ${hw - 1} ${-hh} ${hw - 1} ${hh} ${0} ${hh}`,
                    `L ${-hw} ${hh}`,
                    `Z`,
                    `M ${hw} 0 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0`,
                ].join(' ');

            case 'OR':
                return [
                    `M ${-hw} ${-hh}`,
                    `C ${0} ${-hh} ${hw} ${-hh * 0.5} ${hw} ${0}`,   // top: flat-ish top sweeping to tip
                    `C ${hw} ${hh * 0.5} ${0} ${hh} ${-hw} ${hh}`,   // bottom: tip back to bottom-left
                    `C ${-hw * 0.4} ${hh * 0.5} ${-hw * 0.4} ${-hh * 0.5} ${-hw} ${-hh}`,  // concave left
                    `Z`,
                ].join(' ');

            case 'NOR':
                return [
                    `M ${-hw} ${-hh}`,
                    `C ${0} ${-hh} ${hw - 6} ${-hh * 0.5} ${hw - 6} ${0}`,
                    `C ${hw - 6} ${hh * 0.5} ${0} ${hh} ${-hw} ${hh}`,
                    `C ${-hw * 0.4} ${hh * 0.5} ${-hw * 0.4} ${-hh * 0.5} ${-hw} ${-hh}`,
                    `Z`,
                    `M ${hw - 1} 0 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0`,
                ].join(' ');

            case 'XOR':
                return [
                    `M ${-hw + 4} ${-hh}`,
                    `C ${0} ${-hh} ${hw} ${-hh * 0.5} ${hw} ${0}`,
                    `C ${hw} ${hh * 0.5} ${0} ${hh} ${-hw + 4} ${hh}`,
                    `C ${-hw * 0.4 + 4} ${hh * 0.5} ${-hw * 0.4 + 4} ${-hh * 0.5} ${-hw + 4} ${-hh}`,
                    `Z`,
                    // extra back line offset to the left
                    `M ${-hw} ${-hh} C ${-hw * 0.4} ${-hh * 0.5} ${-hw * 0.4} ${hh * 0.5} ${-hw} ${hh}`,
                ].join(' ');

            case 'XNOR':
                return [
                    `M ${-hw + 4} ${-hh}`,
                    `C ${0} ${-hh} ${hw - 6} ${-hh * 0.5} ${hw - 6} ${0}`,
                    `C ${hw - 6} ${hh * 0.5} ${0} ${hh} ${-hw + 4} ${hh}`,
                    `C ${-hw * 0.4 + 4} ${hh * 0.5} ${-hw * 0.4 + 4} ${-hh * 0.5} ${-hw + 4} ${-hh}`,
                    `Z`,
                    `M ${-hw} ${-hh} C ${-hw * 0.4} ${-hh * 0.5} ${-hw * 0.4} ${hh * 0.5} ${-hw} ${hh}`,
                    `M ${hw - 1} 0 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0`,
                ].join(' ');

            case 'NOT':
                // Triangle pointing right + bubble
                return [
                    `M ${-hw} ${-hh}`,
                    `L ${-hw} ${hh}`,
                    `L ${hw - 6} ${0}`,
                    `Z`,
                    `M ${hw - 1} 0 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0`,
                ].join(' ');

            case 'INPUT':
                return `M ${-hw} ${-hh * 0.7} L ${hw * 0.6} ${-hh * 0.7} L ${hw} 0 L ${hw * 0.6} ${hh * 0.7} L ${-hw} ${hh * 0.7} Z`;

            case 'OUTPUT':
                return `M ${-hw} ${-hh * 0.7} L ${hw * 0.4} ${-hh * 0.7} L ${hw} 0 L ${hw * 0.4} ${hh * 0.7} L ${-hw} ${hh * 0.7} Z`;

            default:
                return `M ${-hw} ${-hh} L ${hw} ${-hh} L ${hw} ${hh} L ${-hw} ${hh} Z`;
        }
    }

    // ─── WIRING PREVIEW ─────────────────────────────────────────────────────────

    private startWiringPreview(from: { x: number; y: number }) {
        if (this.wiringPreviewLine) this.wiringPreviewLine.remove();
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x.toString());
        line.setAttribute("y1", from.y.toString());
        line.setAttribute("x2", from.x.toString());
        line.setAttribute("y2", from.y.toString());
        line.setAttribute("stroke", "var(--interactive-accent)");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-dasharray", "6 3");
        line.setAttribute("pointer-events", "none");
        this.svg.appendChild(line);
        this.wiringPreviewLine = line;
    }

    private cancelWiring() {
        this.wiringFrom = null;
        this.wiringPreviewLine?.remove();
        this.wiringPreviewLine = null;
        this.svg.style.cursor = "grab";
    }

    // ─── TRUTH TABLE MODAL ──────────────────────────────────────────────────────

    private showTruthTableModal() {
        const result = this.simulator.generateTruthTable();

        const overlay = document.createElement("div");
        overlay.addClass("automaton-modal-overlay");
        const modal = document.createElement("div");
        modal.addClass("automaton-modal-box");
        modal.style.minWidth = "320px";
        modal.style.maxWidth = "600px";
        modal.createEl("h3", { text: "Truth table", cls: "automaton-modal-title" });

        if (!result) {
            modal.createEl("p", {
                text: "Add at least one INPUT and one OUTPUT gate to generate a truth table.",
                cls: "automaton-modal-textarea"
            });
        } else {
            const table = document.createElement("table");
            table.addClass("automaton-truth-table");

            const thead = table.createEl("thead");
            const headerRow = thead.createEl("tr");
            result.headers.forEach((h, i) => {
                const th = headerRow.createEl("th", { text: h });
                if (i >= result.headers.length - result.rows[0].length + result.rows[0].length - (result.headers.length - (result.rows[0].length - result.headers.length + result.headers.length))) {
                    th.style.borderLeft = "2px solid var(--background-modifier-border)";
                }
            });

            // Recount: inputs = headers minus outputs
            const inputCount = this.gates.filter(g => g.type === "INPUT").length;
            Array.from(headerRow.querySelectorAll("th")).forEach((th, i) => {
                if (i === inputCount) th.style.borderLeft = "2px solid var(--background-modifier-border)";
            });

            const tbody = table.createEl("tbody");
            result.rows.forEach(row => {
                const tr = tbody.createEl("tr");
                row.forEach((val, i) => {
                    const td = tr.createEl("td", { text: val.toString() });
                    td.style.textAlign = "center";
                    td.style.padding = "4px 12px";
                    td.style.color = val === 1 ? "var(--color-green)" : "var(--text-muted)";
                    if (i === inputCount) td.style.borderLeft = "2px solid var(--background-modifier-border)";
                });
            });

            modal.appendChild(table);

            // Copy as markdown button
            const copyBtn = modal.createEl("button", { text: "Copy as markdown", cls: "automaton-modal-button" });
            copyBtn.style.marginTop = "12px";
            copyBtn.onclick = () => {
                const header = "| " + result.headers.join(" | ") + " |";
                const sep = "| " + result.headers.map(() => "---").join(" | ") + " |";
                const rows = result.rows.map(r => "| " + r.join(" | ") + " |").join("\n");
                navigator.clipboard.writeText(header + "\n" + sep + "\n" + rows);
                copyBtn.textContent = "Copied!";
                setTimeout(() => copyBtn.textContent = "Copy as markdown", 1500);
            };
        }

        const closeBtn = modal.createEl("button", {
            text: "Close",
            cls: "automaton-modal-button automaton-modal-button-primary"
        });
        closeBtn.style.marginTop = "8px";
        closeBtn.onclick = () => overlay.remove();

        overlay.appendChild(modal);
        document.appendChild(overlay);
    }

    public applyTheme(newTheme: GraphTheme) {
        this.theme = { ...DEFAULT_THEME, ...newTheme };
        this.buildDOM();
        this.updatePositions();
    }

    // --- WRITING MODE ────────────────────────────────────────────────────────────────────────────
    public toggleWritingMode() {
        if (this.writingPanel) {
            this.writingPanel.remove();
            this.writingPanel = null;
            this.writingTextarea = null;
            this.contentArea.style.flexDirection = "column";
            return;
        }

        const currentDsl = serializeToDSL({
            nodes: this.nodes,
            edges: this.edges,
            gates: this.gates,
            wires: this.wires,
            groups: this.groups
        });

        const isSidebar = this.dslMode === "sidebar";

        const panel = document.createElement("div");
        panel.classList.add("automaton-writing-panel");
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.background = "var(--background-secondary)";

        if (isSidebar) {
            panel.style.width = "220px";
            panel.style.minWidth = "160px";
            panel.style.borderLeft = "1px solid var(--background-modifier-border)";
            panel.style.overflow = "auto";
            // Only contentArea goes row; container (and toolbar) stay column
            this.contentArea.style.flexDirection = "row";
        } else {
            panel.style.height = "150px";
            panel.style.borderTop = "1px solid var(--background-modifier-border)";
            this.contentArea.style.flexDirection = "column";
        }

        // Textarea
        const textarea = document.createElement("textarea");
        textarea.value = currentDsl;
        textarea.placeholder = "Type your graph DSL...";
        textarea.style.flex = "1";
        textarea.style.width = "100%";
        textarea.style.resize = "none";
        textarea.style.border = "none";
        textarea.style.outline = "none";
        textarea.style.padding = "6px";
        textarea.style.fontFamily = "var(--font-monospace)";
        textarea.style.fontSize = "12px";
        textarea.style.background = "transparent";
        textarea.style.color = "var(--text-normal)";

        // Ctrl+Enter applies
        textarea.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                this.applyParserOutput(parseDSL(textarea.value, { straightWires: this.straightWires }));
            }
        });

        // Controls
        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;justify-content:space-between;padding:4px;flex-shrink:0;gap:4px";

        const applyBtn = document.createElement("button");
        applyBtn.textContent = "Apply";
        applyBtn.title = "Apply DSL (Ctrl+Shift+Enter)";
        applyBtn.style.flex = "1";
        applyBtn.onclick = () => { this.applyParserOutput(parseDSL(textarea.value, { straightWires: this.straightWires })); };

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        closeBtn.title = "Close DSL editor";
        closeBtn.onclick = () => { this.toggleWritingMode(); };

        controls.appendChild(applyBtn);
        controls.appendChild(closeBtn);
        panel.appendChild(textarea);
        panel.appendChild(controls);
        this.contentArea.appendChild(panel);
        this.writingPanel = panel;
        this.writingTextarea = textarea;
        textarea.focus();
    }

    /** @deprecated use toggleWritingMode */
    public enableWritingMode() { this.toggleWritingMode(); }

    public applyOpenDslText() {
        if (!this.writingTextarea) return;
        this.applyParserOutput(parseDSL(this.writingTextarea.value, { straightWires: this.straightWires }));
    }

    
    public applyParserOutput(output: ParserOutput) {
        const layout = (output as any).layout as { rows: string[][], columns: string[][] } | undefined;
        const explicitIds = new Set<string>([
            ...(layout?.rows?.flat() ?? []),
            ...(layout?.columns?.flat() ?? [])
        ]);

        if (output.nodes) {
            this.nodes = output.nodes.map(n => {
                if (explicitIds.has(n.id)) return n;
                const existing = this.nodes.find(e => e.id === n.id);
                return existing ? { ...n, position: existing.position } : n;
            });
        }
        if (output.edges) this.edges = output.edges;
        if (output.gates) {
            this.gates = output.gates.map(g => {
                if (explicitIds.has(g.id)) return g;
                const existing = this.gates.find(e => e.id === g.id);
                return existing ? { ...g, position: existing.position } : g;
            });
        }
        if (output.wires) this.wires = output.wires;
        if (output.groups) this.groups = output.groups;

        this.simulator.rebuild(this.gates, this.wires);
        this.simulator.propagate();
        this.buildDOM();
        this.updatePositions();
        this.triggerSave();
    }

    private onGraphChanged() {
        if (!this.writingTextarea) return;

        const dsl = serializeToDSL({
            nodes: this.nodes,
            edges: this.edges,
            gates: this.gates,
            wires: this.wires,
            groups: this.groups
        });

        this.writingTextarea.value = dsl;
    }

    // ─── CLEANUP ────────────────────────────────────────────────────────────────

    public destroy() {
        this.contextMenu?.parentNode && this.contextMenu.remove();
    }
}