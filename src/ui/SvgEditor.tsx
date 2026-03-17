import { finishRenderMath, renderMath } from "obsidian";

export interface Position { x: number; y: number; }
export interface GraphNode { id: string; position: Position; label: string; isAccepting?: boolean; isStart?: boolean; color?: string; }
export interface GraphWaypoint { id: string; x: number; y: number; type: 'linear' | 'bezier'; }
export interface GraphEdge { id: string; source: string; target: string; label?: string; waypoints?: GraphWaypoint[]; isBendable?: boolean; color?: string; }
export interface GraphTheme { background?: string; nodeFill?: string; nodeStroke?: string; text?: string; edgeStroke?: string; startArrow?: string; acceptCircle?: string; }
export interface GraphViewport { height: number; viewBox: { x: number, y: number, w: number, h: number }; }

const DEFAULT_THEME: GraphTheme = {
    background: "var(--background-primary)",
    nodeFill: "var(--background-secondary)",
    nodeStroke: "var(--text-normal)",
    text: "var(--text-normal)",
    edgeStroke: "var(--text-muted)"
};

export class SvgGraphEditor {
    static persistedMode = "none";

    container: HTMLElement;
    svg: SVGSVGElement;

    private contextMenu: HTMLDivElement;
    private modeIndicator: HTMLDivElement;

    private viewBox = { x: 0, y: 0, w: 800, h: 500 };
    private isPanning: boolean = false;
    private panStart: Position = { x: 0, y: 0 };
    private panStartViewBox: Position = { x: 0, y: 0 };
    private panScale = { x: 1, y: 1 };
    private dragStartPos: Position = { x: 0, y: 0 };
    private hasMovedEnough: boolean = false;

    private cachedCTM: DOMMatrix | null = null;

    nodes: GraphNode[];
    edges: GraphEdge[];
    theme: GraphTheme;

    private nodeElements: Map<string, SVGGElement> = new Map();
    private edgeElements: Map<string, { hitbox: SVGPathElement, path: SVGPathElement, label: SVGForeignObjectElement, handleGroup: SVGGElement }> = new Map();

    // Interaction States
    private draggedNode: GraphNode | null = null;
    private draggedWaypoint: { edge: GraphEdge, wpId: string } | null = null;
    private dragOffset: Position = { x: 0, y: 0 };

    // New Linking States
    private isLinkingMode: boolean = false;
    private isDeletingMode: boolean = false;
    private isEdgeEditMode: boolean = false;
    private isTogglingStartMode: boolean = false;
    private isTogglingAcceptMode: boolean = false;
    private linkSourceNode: string | null = null;

    private onSave: (nodes: GraphNode[], edges: GraphEdge[], theme?: GraphTheme, viewport?: GraphViewport) => void;

    constructor(container: HTMLElement, initialNodes: GraphNode[], initialEdges: GraphEdge[], initialViewport: GraphViewport | undefined, userTheme: GraphTheme | undefined, onSave: (nodes: GraphNode[], edges: GraphEdge[], theme?: GraphTheme, viewport?: GraphViewport) => void) {
        this.container = container;
        this.container.style.position = "relative";

        let initHeight = initialViewport && initialViewport.height ? initialViewport.height : 300;
        if (initHeight < 100) initHeight = 100;
        this.container.style.height = `${initHeight}px`;

        this.container.style.overflow = "hidden"; // Prevent context menu from clipping
        this.container.style.direction = "ltr";
        // Prevent the browser from highlighting the graph like text
        this.container.style.userSelect = "none";
        this.container.style.webkitUserSelect = "none";

        const style = document.createElement("style");
        style.textContent = `
            @media print {
                .automaton-ui-element { display: none !important; }
                .obsidian-automaton-resizer { display: none !important; }
            }
        `;
        this.container.appendChild(style);

        this.nodes = initialNodes;
        this.edges = initialEdges;
        this.onSave = onSave;
        this.theme = { ...DEFAULT_THEME, ...userTheme };

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("width", "100%");
        this.svg.setAttribute("height", "100%");
        this.svg.style.border = "1px solid var(--background-modifier-border)";
        this.svg.style.borderRadius = "8px";
        this.svg.style.backgroundColor = "transparent";

        this.container.appendChild(this.svg);

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

        // Smart Arrow: context-stroke forces the arrow to copy the line's color!
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", "smart-arrow");
        marker.setAttribute("viewBox", "0 -5 10 10");
        marker.setAttribute("refX", "10");
        marker.setAttribute("refY", "0");
        marker.setAttribute("markerWidth", "6");
        marker.setAttribute("markerHeight", "6");
        marker.setAttribute("orient", "auto");

        const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowPath.setAttribute("d", "M 0,-5 L 10,0 L 0,5 Z");
        arrowPath.setAttribute("fill", "context-stroke"); // Magic dynamic coloring

        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        this.svg.appendChild(defs);

        if (initialViewport && initialViewport.viewBox) {
            this.viewBox = { ...initialViewport.viewBox };

            // Safe glitch-nuke
            if (this.viewBox.h > 10000 || this.viewBox.w > 10000 || this.viewBox.h < 10) {
                this.viewBox = { x: 0, y: 0, w: 800, h: initHeight };
            }
        } else {
            this.viewBox = { x: 0, y: 0, w: 800, h: initHeight };
        }
        this.updateViewBox();

        this.buildDOM();
        this.buildModeIndicator();
        this.buildContextMenu();
        this.buildResizer();
        this.initEvents();
        this.updatePositions()
    }

    private triggerSave(forceFileWrite: boolean = false) {
        let h = this.container.clientHeight;
        if (h < 100) {
            h = parseInt(this.container.style.height) || 300;
            if (h < 100) h = 100;
        }
        const currentViewport: GraphViewport = {
            height: h,
            viewBox: { ...this.viewBox }
        };

        if (forceFileWrite) {
            this.onSave(this.nodes, this.edges, this.theme, currentViewport);
            this.modeIndicator.style.border = "none";
            this.modeIndicator.textContent = "";
            this.modeIndicator.style.display = "none";
        }
        else {
            this.modeIndicator.style.display = "block";
            this.modeIndicator.style.border = "2px solid #ff9800";
            this.modeIndicator.textContent = "Unsaved Changes (Ctrl+S to save)";
        }
    }

    public forceSave() {
        this.triggerSave(true);
    }

    private updateViewBox() {
        this.svg.setAttribute("viewBox", `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
    }

    private buildResizer() {
        const resizer = document.createElement("div");
        resizer.style.position = "absolute";
        resizer.style.bottom = "0";
        resizer.style.left = "0";
        resizer.style.width = "100%";
        resizer.style.height = "10px";
        resizer.style.cursor = "ns-resize"; // Shows the Up/Down arrow cursor
        resizer.style.zIndex = "1000";
        resizer.style.transition = "background-color 0.2s";
        resizer.className = "obsidian-automaton-resizer";

        // Subtle visual feedback when hovering
        resizer.onmouseenter = () => resizer.style.backgroundColor = "var(--interactive-accent-hover)";
        resizer.onmouseleave = () => resizer.style.backgroundColor = "transparent";

        this.container.appendChild(resizer);

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        let startViewBoxH = 0;
        let scaleY = 1;

        resizer.addEventListener("mousedown", (e) => {
            e.preventDefault();
            isResizing = true;

            // 1. Cache everything once on click
            startY = e.clientY;
            startHeight = this.container.clientHeight || 300;
            startViewBoxH = this.viewBox.h;

            // 2. Pure math scale (No CTM or DOM reads needed)
            scaleY = startViewBoxH / startHeight;

            document.body.style.cursor = "ns-resize";
        });

        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;

            const dy = e.clientY - startY;
            const newHeight = Math.max(100, startHeight + dy);
            this.container.style.height = `${newHeight}px`;

            // 3. Apply cached scale (Zero layout thrashing!)
            this.viewBox.h = startViewBoxH + (dy * scaleY);
            this.updateViewBox();
        });

        document.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
                resizer.style.backgroundColor = "transparent";
            }
        });
    }

    private showDotImportModal() {
        // Create an overlay background
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        overlay.style.display = "flex";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.zIndex = "1000";
        overlay.style.borderRadius = "8px";

        // Create the modal box
        const modal = document.createElement("div");
        modal.style.backgroundColor = "var(--background-primary)";
        modal.style.padding = "20px";
        modal.style.borderRadius = "8px";
        modal.style.border = "1px solid var(--background-modifier-border)";
        modal.style.display = "flex";
        modal.style.flexDirection = "column";
        modal.style.gap = "10px";
        modal.style.width = "80%";
        modal.style.maxWidth = "400px";

        const title = document.createElement("h3");
        title.textContent = "Import Graphviz (DOT)";
        title.style.margin = "0";

        const textarea = document.createElement("textarea");
        textarea.rows = 8;
        textarea.placeholder = 'digraph G {\n  start -> q0;\n  q0 -> q1 [label="0, 1"];\n  q1 [shape=doublecircle];\n}';
        textarea.style.width = "100%";
        textarea.style.resize = "vertical";
        textarea.style.backgroundColor = "var(--background-secondary)";
        textarea.style.color = "var(--text-normal)";

        const buttonRow = document.createElement("div");
        buttonRow.style.display = "flex";
        buttonRow.style.justifyContent = "flex-end";
        buttonRow.style.gap = "8px";

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = () => overlay.remove();

        const convertBtn = document.createElement("button");
        convertBtn.textContent = "Convert";
        convertBtn.style.backgroundColor = "var(--interactive-accent)";
        convertBtn.style.color = "var(--text-on-accent)";
        convertBtn.onclick = () => {
            if (textarea.value.trim()) {
                this.importFromDot(textarea.value);
            }
            overlay.remove();
        };

        buttonRow.appendChild(cancelBtn);
        buttonRow.appendChild(convertBtn);

        modal.appendChild(title);
        modal.appendChild(textarea);
        modal.appendChild(buttonRow);
        overlay.appendChild(modal);

        this.container.appendChild(overlay);
        textarea.focus();
    }

    // --- MODE MANAGER ---
    private setMode(mode: "none" | "link" | "delete") {
        this.isLinkingMode = mode === "link";
        this.isDeletingMode = mode === "delete";

        this.isTogglingStartMode = false;
        this.isTogglingAcceptMode = false;
        this.linkSourceNode = null;

        if (mode === "none") this.svg.style.cursor = "grab";
        else if (mode === "link") this.svg.style.cursor = "crosshair";
        else if (mode === "delete") this.svg.style.cursor = "not-allowed";

        if (mode === "none") {
            this.modeIndicator.style.display = "none";
        } else {
            this.modeIndicator.style.display = "block";
            this.modeIndicator.textContent = `Mode: ${mode.toUpperCase()} (Press ESC to cancel)`;
        }
    }

    // --- UI: MODE INDICATOR ---
    private buildModeIndicator() {
        this.modeIndicator = document.createElement("div");
        this.modeIndicator.style.position = "absolute";
        this.modeIndicator.style.top = "10px";
        this.modeIndicator.style.right = "10px";
        this.modeIndicator.style.padding = "4px 8px";
        this.modeIndicator.style.backgroundColor = "var(--interactive-accent)";
        this.modeIndicator.style.color = "var(--text-on-accent)";
        this.modeIndicator.style.borderRadius = "4px";
        this.modeIndicator.style.fontSize = "12px";
        this.modeIndicator.style.fontWeight = "bold";
        this.modeIndicator.style.display = "none";
        this.modeIndicator.style.pointerEvents = "none"; // Clicks pass through
        this.modeIndicator.className = "automaton-ui-element";
        this.container.appendChild(this.modeIndicator);
    }

    // --- UI: CONTEXT MENU ---
    private buildContextMenu() {
        this.contextMenu = document.createElement("div");
        this.contextMenu.style.position = "absolute";
        this.contextMenu.style.display = "none";
        this.contextMenu.style.flexDirection = "column";
        this.contextMenu.style.backgroundColor = "var(--background-primary)";
        this.contextMenu.style.border = "1px solid var(--background-modifier-border)";
        this.contextMenu.style.borderRadius = "6px";
        this.contextMenu.style.padding = "4px";
        this.contextMenu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
        this.contextMenu.style.zIndex = "1000";
        this.contextMenu.style.minWidth = "120px";
        this.container.appendChild(this.contextMenu);

        // Hide menu if user clicks anywhere else
        document.addEventListener("mousedown", (e) => {
            if (!this.contextMenu.contains(e.target as HTMLElement)) {
                this.contextMenu.style.display = "none";
            }
        });

        // Cancel modes with Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.setMode("none");
        });
    }

    private createLabelContent(text: string, color: string): HTMLElement {
        const container = document.createElement("div");

        container.style.position = "absolute";
        container.style.transform = "translate(-50%, -50%)";
        container.style.display = "flex";
        container.style.justifyContent = "center";
        container.style.alignItems = "center";
        container.style.pointerEvents = "none";

        const pill = document.createElement("div");
        pill.style.display = "inline-flex";
        pill.style.alignItems = "center";
        pill.style.backgroundColor = "transparent";
        pill.style.padding = "2px 6px";
        pill.style.borderRadius = "4px";
        pill.style.color = color;
        pill.style.fontSize = "14px";
        pill.style.fontWeight = "bold";
        pill.style.whiteSpace = "nowrap"; // Prevents text from breaking into multiple lines

        const parts = text.split(/(\$.*?\$)/g);

        parts.forEach(part => {
            if (part.startsWith("$") && part.endsWith("$")) {
                const mathText = part.slice(1, -1);
                try {
                    const mathEl = renderMath(mathText, false);
                    mathEl.style.margin = "0"; // Strip default MathJax margins
                    pill.appendChild(mathEl);
                } catch (e) {
                    pill.appendChild(document.createTextNode(part));
                }
            } else if (part.length > 0) {
                const span = document.createElement("span");
                span.innerText = part;
                span.style.margin = "0 2px";
                pill.appendChild(span);
            }
        });

        container.appendChild(pill);
        return container;
    }

    // --- RETURNS PATH & LABEL COORDS (lx, ly), AND LEGACY HANDLE COORDS (hx, hy) ---
    private getEdgePathData(edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode): { path: string, lx: number, ly: number, hx: number, hy: number } {
        const sx = sourceNode.position.x;
        const sy = sourceNode.position.y;
        const tx = targetNode.position.x;
        const ty = targetNode.position.y;
        const radius = 25;

        // Helper: Always pushes text "Up/Left" relative to the direction of the edge
        const getNormal = (dx: number, dy: number) => {
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            return { nx: dy / dist, ny: -dx / dist };
        };

        // 1. SELF-LOOPS (Dynamic OR Single Custom Waypoint)
        // If it's a self-loop with 0 or 1 point, maintain the classic teardrop shape!
        if (sourceNode.id === targetNode.id && (!edge.waypoints || edge.waypoints.length <= 1)) {
            let loopAngle = -Math.PI / 2;
            let pushOut = 90;
            let curvePeak = pushOut * 0.75;

            // If there is exactly 1 waypoint, stretch the teardrop to it!
            if (edge.waypoints && edge.waypoints.length === 1) {
                const wp = edge.waypoints[0];
                loopAngle = Math.atan2(wp.y - sy, wp.x - sx);
                curvePeak = Math.max(30, Math.sqrt(Math.pow(wp.x - sx, 2) + Math.pow(wp.y - sy, 2)));
                pushOut = curvePeak / 0.75;
            } else {
                // Otherwise, use the dynamic center-of-mass avoidance
                let sumX = 0, sumY = 0, connectionCount = 0;
                this.edges.forEach(e => {
                    let otherNodeId = (e.source === sourceNode.id && e.target !== sourceNode.id) ? e.target :
                        (e.target === sourceNode.id && e.source !== sourceNode.id) ? e.source : null;
                    if (otherNodeId) {
                        const other = this.nodes.find(n => n.id === otherNodeId);
                        if (other) {
                            const dx = other.position.x - sx, dy = other.position.y - sy;
                            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                            sumX += dx / dist; sumY += dy / dist; connectionCount++;
                        }
                    }
                });
                if (connectionCount > 0 && (sumX !== 0 || sumY !== 0)) loopAngle = Math.atan2(sumY, sumX) + Math.PI;
                curvePeak = pushOut * 0.75;
            }

            const spread = 0.4, ctrlSpread = 0.5;
            const startX = sx + Math.cos(loopAngle - spread) * radius;
            const startY = sy + Math.sin(loopAngle - spread) * radius;
            const endX = sx + Math.cos(loopAngle + spread) * radius;
            const endY = sy + Math.sin(loopAngle + spread) * radius;

            const ctrl1X = sx + Math.cos(loopAngle - ctrlSpread) * pushOut;
            const ctrl1Y = sy + Math.sin(loopAngle - ctrlSpread) * pushOut;
            const ctrl2X = sx + Math.cos(loopAngle + ctrlSpread) * pushOut;
            const ctrl2Y = sy + Math.sin(loopAngle + ctrlSpread) * pushOut;

            const hx = sx + Math.cos(loopAngle) * curvePeak;
            const hy = sy + Math.sin(loopAngle) * curvePeak;

            return {
                path: `M ${startX} ${startY} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${endX} ${endY}`,
                lx: hx + Math.cos(loopAngle) * 20,
                ly: hy + Math.sin(loopAngle) * 20,
                hx: 0, hy: 0
            };
        }

        // 2. COMPLEX MULTI-POINT PATH (Connecting edges, or Self-Loops with 2+ points)
        if (edge.waypoints && edge.waypoints.length > 0) {
            const wps = edge.waypoints;
            const firstWp = wps[0];
            const lastWp = wps[wps.length - 1];

            const startAngle = Math.atan2(firstWp.y - sy, firstWp.x - sx);
            const startX = sx + Math.cos(startAngle) * radius;
            const startY = sy + Math.sin(startAngle) * radius;

            const endAngle = Math.atan2(ty - lastWp.y, tx - lastWp.x);
            const endX = tx - Math.cos(endAngle) * radius;
            const endY = ty - Math.sin(endAngle) * radius;

            let path = `M ${startX} ${startY}`;

            for (let i = 0; i < wps.length; i++) {
                const wp = wps[i];
                if (wp.type === 'linear') {
                    path += ` L ${wp.x} ${wp.y}`;
                } else if (wp.type === 'bezier') {
                    if (wps.length === 1) {
                        const ctrlX = 2 * wp.x - 0.5 * startX - 0.5 * endX;
                        const ctrlY = 2 * wp.y - 0.5 * startY - 0.5 * endY;
                        path += ` Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
                    } else {
                        let targetX, targetY;
                        if (i + 1 < wps.length) {
                            const nextWp = wps[i + 1];
                            if (nextWp.type === 'bezier') {
                                targetX = (wp.x + nextWp.x) / 2;
                                targetY = (wp.y + nextWp.y) / 2;
                            } else {
                                targetX = nextWp.x;
                                targetY = nextWp.y;
                            }
                        } else {
                            targetX = endX;
                            targetY = endY;
                        }
                        path += ` Q ${wp.x} ${wp.y} ${targetX} ${targetY}`;
                    }
                }
            }

            if (lastWp.type !== 'bezier') {
                path += ` L ${endX} ${endY}`;
            }

            // Create an array of every single point the line touches
            const allPoints = [{ x: startX, y: startY }, ...wps, { x: endX, y: endY }];

            // 1. Measure the total length of the path
            let totalDist = 0;
            const distances: number[] = [];
            for (let i = 0; i < allPoints.length - 1; i++) {
                const d = Math.sqrt(Math.pow(allPoints[i + 1].x - allPoints[i].x, 2) + Math.pow(allPoints[i + 1].y - allPoints[i].y, 2));
                distances.push(d);
                totalDist += d;
            }

            // 2. Find the exact coordinate at 50% distance
            const halfDist = totalDist / 2;
            let runningDist = 0;
            let lx = 0, ly = 0;

            for (let i = 0; i < allPoints.length - 1; i++) {
                // If the halfway point falls inside this specific line segment:
                if (runningDist + distances[i] >= halfDist || i === allPoints.length - 2) {
                    const remaining = halfDist - runningDist;
                    const ratio = distances[i] === 0 ? 0 : remaining / distances[i];

                    // Calculate the exact X/Y coordinate on the line
                    const midX = allPoints[i].x + (allPoints[i + 1].x - allPoints[i].x) * ratio;
                    const midY = allPoints[i].y + (allPoints[i + 1].y - allPoints[i].y) * ratio;

                    // Get the normal vector of this specific segment to push the text outward
                    const dx = allPoints[i + 1].x - allPoints[i].x;
                    const dy = allPoints[i + 1].y - allPoints[i].y;
                    const dist = distances[i] || 1;

                    lx = midX + (dy / dist) * 20;
                    ly = midY + (-dx / dist) * 20;
                    break;
                }
                runningDist += distances[i];
            }

            return { path, lx, ly, hx: 0, hy: 0 };
        }

        const dx = tx - sx, dy = ty - sy;
        const angle = Math.atan2(dy, dx);
        const hasReverseEdge = this.edges.some(e => e.source === targetNode.id && e.target === sourceNode.id);

        // 3. TWO-WAY CURVE (Default automatic bend)
        if (hasReverseEdge) {
            const startX = sx + Math.cos(angle + 0.35) * radius;
            const startY = sy + Math.sin(angle + 0.35) * radius;
            const endX = tx + Math.cos(angle + Math.PI - 0.35) * radius;
            const endY = ty + Math.sin(angle + Math.PI - 0.35) * radius;

            const midX = (sx + tx) / 2, midY = (sy + ty) / 2;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const { nx, ny } = getNormal(dx, dy);

            const ctrlX = midX + nx * (dist * 0.2);
            const ctrlY = midY + ny * (dist * 0.2);
            const hx = (midX + ctrlX) / 2, hy = (midY + ctrlY) / 2;

            return {
                path: `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`,
                lx: hx + nx * 20,
                ly: hy + ny * 20,
                hx, hy
            };
        }

        // 4. STRAIGHT LINE (Default automatic line)
        const startX = sx + Math.cos(angle) * radius;
        const startY = sy + Math.sin(angle) * radius;
        const endX = tx - Math.cos(angle) * radius;
        const endY = ty - Math.sin(angle) * radius;

        const { nx, ny } = getNormal(dx, dy);
        const hx = (startX + endX) / 2, hy = (startY + endY) / 2;

        return {
            path: `M ${startX} ${startY} L ${endX} ${endY}`,
            lx: hx + nx * 20,
            ly: hy + ny * 20,
            hx, hy
        };
    }

    // --- DOM CREATION (Runs when adding nodes) ---
    private buildDOM() {
        this.svg.innerHTML = "";
        this.nodeElements.clear();
        this.edgeElements.clear();

        // 1. Arrow Marker
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="${this.theme.edgeStroke}" />
            </marker>

            <marker id="double-arrow" markerWidth="20" markerHeight="10" refX="19" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 10 5 L 0 10 z M 9 0 L 19 5 L 9 10 z" fill="${this.theme.edgeStroke}" />
            </marker>
        `;
        this.svg.appendChild(defs);

        // 2. Build Edges (Now as Groups with Labels!)
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
            path.setAttribute("stroke-width", "2");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", edgeColor);
            path.setAttribute("marker-end", "url(#smart-arrow)"); // Attach our new smart arrow
            path.style.pointerEvents = "none";

            const foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            foreignObj.setAttribute("width", "1");
            foreignObj.setAttribute("height", "1");
            foreignObj.style.overflow = "visible";
            foreignObj.style.color = edge.color || this.theme.text || "var(--text-normal)";
            foreignObj.appendChild(this.createLabelContent(edge.label || "", this.theme.text!));

            const handleGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            handleGroup.setAttribute("opacity", edge.isBendable ? "0.4" : "0");
            handleGroup.style.transition = "opacity 0.2s";
            handleGroup.className.baseVal = "automaton-ui-element";

            // Draw a handle for every waypoint
            if (edge.waypoints) {
                edge.waypoints.forEach(wp => {
                    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    handle.dataset.wpId = wp.id;
                    handle.setAttribute("r", "8");
                    // Bezier points are blue, Linear points are orange
                    handle.setAttribute("fill", wp.type === 'bezier' ? "var(--interactive-accent)" : "#d97706");
                    handle.style.cursor = "grab";
                    handleGroup.appendChild(handle);
                });
            }

            group.addEventListener("mouseenter", () => {
                if (edge.isBendable) {
                    handleGroup.setAttribute("opacity", "1");
                    hitbox.style.cursor = "crosshair"; // Hint that you can click to add points
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

        // 3. Build Nodes
        this.nodes.forEach(node => {
            const nodeColor = node.color || this.theme.nodeStroke || "var(--text-normal)";

            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.style.cursor = "pointer";
            group.dataset.nodeId = node.id;

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", "0");
            circle.setAttribute("cy", "0");
            circle.setAttribute("r", "25");
            circle.setAttribute("stroke", nodeColor);
            circle.setAttribute("fill", this.theme.nodeFill || "var(--background-primary)");
            circle.setAttribute("stroke-width", "2");
            group.appendChild(circle);

            // Draw inner circle if Accepting
            if (node.isAccepting) {
                const innerCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                innerCircle.setAttribute("r", "20");
                innerCircle.setAttribute("fill", "none");
                innerCircle.setAttribute("stroke", this.theme.acceptCircle || nodeColor);
                innerCircle.setAttribute("stroke-width", "2");
                group.appendChild(innerCircle);
            }

            // Draw incoming arrow if Start
            if (node.isStart) {
                const startArrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
                startArrow.setAttribute("d", "M -45 0 L -25 0 M -30 -5 L -25 0 L -30 5");
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
            foreignObjNode.style.color = node.color || this.theme.text || "var(--text-normal)";
            foreignObjNode.appendChild(this.createLabelContent(node.label, this.theme.text!));

            group.appendChild(foreignObjNode);
            this.svg.appendChild(group);
            this.nodeElements.set(node.id, group);
        });

        // Tell Obsidian to typeset all the MathJax we just added
        finishRenderMath();
    }

    private updatePositions() {
        this.nodes.forEach(node => {
            const group = this.nodeElements.get(node.id);
            if (group) group.setAttribute("transform", `translate(${node.position.x}, ${node.position.y})`);
        });

        this.edges.forEach(edge => {
            const sourceNode = this.nodes.find(n => n.id === edge.source);
            const targetNode = this.nodes.find(n => n.id === edge.target);
            const elements = this.edgeElements.get(edge.id);

            if (sourceNode && targetNode && elements) {
                const { path, lx, ly } = this.getEdgePathData(edge, sourceNode, targetNode);

                elements.path.setAttribute("d", path);
                elements.hitbox.setAttribute("d", path);
                elements.label.setAttribute("x", lx.toString());
                elements.label.setAttribute("y", ly.toString());

                if (edge.waypoints) {
                    const circles = elements.handleGroup.querySelectorAll("circle");
                    edge.waypoints.forEach((wp, i) => {
                        if (circles[i]) {
                            circles[i].setAttribute("cx", wp.x.toString());
                            circles[i].setAttribute("cy", wp.y.toString());
                        }
                    });
                }
            }
        });
    }

    private getMousePosition(evt: MouseEvent): Position {
        const CTM = this.cachedCTM || this.svg.getScreenCTM();
        if (!CTM) return { x: evt.clientX, y: evt.clientY };
        return { x: (evt.clientX - CTM.e) / CTM.a, y: (evt.clientY - CTM.f) / CTM.d };
    }

    // --- INTERACTION ---
    private initEvents() {
        // Block Obsidian's CodeMirror from hijacking clicks!
        this.container.addEventListener("click", (evt) => evt.stopPropagation());
        this.container.addEventListener("pointerdown", (evt) => evt.stopPropagation());

        // CONTEXT MENU
        this.svg.addEventListener("contextmenu", (evt) => {
            evt.preventDefault(); // Stop standard browser menu
            evt.stopPropagation();
            this.contextMenu.innerHTML = ""; // Clear old options

            const target = evt.target as SVGElement;
            const nodeGroup = target.closest("g[data-node-id]") as SVGGElement;
            const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;

            // Helper to add buttons to the menu
            const addMenuItem = (text: string, onClick: () => void, color = "var(--text-normal)") => {
                const btn = document.createElement("button");
                btn.textContent = text;
                btn.style.width = "100%";
                btn.style.textAlign = "left";
                btn.style.background = "transparent";
                btn.style.border = "none";
                btn.style.cursor = "pointer";
                btn.style.padding = "6px 12px";
                btn.style.borderRadius = "4px";
                btn.style.color = color;

                btn.onmouseenter = () => btn.style.background = "var(--background-secondary)";
                btn.onmouseleave = () => btn.style.background = "transparent";

                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.contextMenu.style.display = "none";
                    onClick();
                };
                this.contextMenu.appendChild(btn);
            };

            const addColorPicker = (label: string, currentColor: string | undefined, onChange: (newColor: string) => void) => {
                const wrapper = document.createElement("div");
                wrapper.style.display = "flex";
                wrapper.style.justifyContent = "space-between";
                wrapper.style.alignItems = "center";
                wrapper.style.padding = "6px 12px";
                wrapper.style.cursor = "pointer";
                wrapper.style.color = "var(--text-normal)";
                wrapper.onmouseenter = () => wrapper.style.background = "var(--background-secondary)";
                wrapper.onmouseleave = () => wrapper.style.background = "transparent";

                const textSpan = document.createElement("span");
                textSpan.textContent = label;

                const input = document.createElement("input");
                input.type = "color";
                // Default to black/white depending on theme so the picker doesn't look empty
                input.value = currentColor || (document.body.classList.contains('theme-dark') ? "#ffffff" : "#000000");
                input.style.border = "none";
                input.style.width = "24px";
                input.style.height = "24px";
                input.style.padding = "0";
                input.style.background = "none";
                input.style.cursor = "pointer";

                input.oninput = (e) => {
                    const color = (e.target as HTMLInputElement).value;
                    onChange(color);
                };

                wrapper.appendChild(textSpan);
                wrapper.appendChild(input);
                this.contextMenu.appendChild(wrapper);
            };

            // 1. DYNAMIC NODE OPTIONS
            if (nodeGroup && nodeGroup.dataset.nodeId) {
                const clickedNode = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId);
                if (clickedNode) {
                    // Instantly toggles the node you right-clicked!
                    addMenuItem(clickedNode.isStart ? "⏹️ Remove Start" : "▶️ Set as Start", () => {
                        this.setMode("none");
                        clickedNode.isStart = !clickedNode.isStart;
                        this.buildDOM(); this.updatePositions(); this.triggerSave();
                    });
                    addMenuItem(clickedNode.isAccepting ? "❌ Remove Accept" : "🎯 Set as Accept", () => {
                        this.setMode("none");
                        clickedNode.isAccepting = !clickedNode.isAccepting;
                        this.buildDOM(); this.updatePositions(); this.triggerSave();
                    });
                    addColorPicker("🎨 Node Color", clickedNode.color, (newColor) => {
                        clickedNode.color = newColor;
                        this.buildDOM(); this.updatePositions(); this.triggerSave();
                    });

                    const divider = document.createElement("div");
                    divider.style.borderBottom = "1px solid var(--background-modifier-border)";
                    divider.style.margin = "4px 0";
                    this.contextMenu.appendChild(divider);
                }
            }

            // 2. DYNAMIC EDGE OPTIONS
            if (edgeGroup && edgeGroup.dataset.edgeId) {
                const clickedEdge = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                const wpHandle = target.closest("circle[data-wp-id]") as SVGCircleElement;

                if (clickedEdge) {
                    // If they clicked a specific dot:
                    if (wpHandle) {
                        const wpId = wpHandle.dataset.wpId;
                        const wpIndex = clickedEdge.waypoints!.findIndex(w => w.id === wpId);
                        const wp = clickedEdge.waypoints![wpIndex];

                        addMenuItem(wp.type === 'bezier' ? "📐 Change to Linear" : "〰️ Change to Bezier", () => {
                            wp.type = wp.type === 'bezier' ? 'linear' : 'bezier';
                            this.buildDOM(); this.updatePositions(); this.triggerSave();
                        });
                        addMenuItem("🗑️ Delete Point", () => {
                            clickedEdge.waypoints!.splice(wpIndex, 1);
                            if (clickedEdge.waypoints!.length === 0) delete clickedEdge.waypoints;
                            this.buildDOM(); this.updatePositions(); this.triggerSave();
                        }, "var(--text-error)");

                        // If they clicked the line itself:
                    } else {
                        addMenuItem(clickedEdge.isBendable ? "🔒 Lock Path" : "🔓 Unlock Path", () => {
                            clickedEdge.isBendable = !clickedEdge.isBendable;
                            this.buildDOM(); this.updatePositions(); this.triggerSave();
                        });

                        if (clickedEdge.isBendable) {
                            addMenuItem("➕ Add Bezier Point", () => {
                                const mousePos = this.getMousePosition(evt);
                                if (!clickedEdge.waypoints) clickedEdge.waypoints = [];
                                clickedEdge.waypoints.push({ id: Date.now().toString(), x: mousePos.x, y: mousePos.y, type: 'bezier' });
                                this.buildDOM(); this.updatePositions(); this.triggerSave();
                            });
                            addMenuItem("➕ Add Linear Point", () => {
                                const mousePos = this.getMousePosition(evt);
                                if (!clickedEdge.waypoints) clickedEdge.waypoints = [];
                                clickedEdge.waypoints.push({ id: Date.now().toString(), x: mousePos.x, y: mousePos.y, type: 'linear' });
                                this.buildDOM(); this.updatePositions(); this.triggerSave();
                            });
                        }

                        addColorPicker("🎨 Edge Color", clickedEdge.color, (newColor) => {
                            clickedEdge.color = newColor;
                            this.buildDOM(); this.updatePositions(); this.triggerSave();
                        });
                    }
                }

                const divider = document.createElement("div");
                divider.style.borderBottom = "1px solid var(--background-modifier-border)";
                divider.style.margin = "4px 0";
                this.contextMenu.appendChild(divider);
            }

            // 3. BASE OPTIONS (Always Available)
            addMenuItem("+ Add State", () => {
                this.setMode("none");
                // Drops the state exactly at your mouse cursor!
                const mousePos = this.getMousePosition(evt);
                const newId = `q${this.nodes.length}`;
                this.nodes.push({ id: newId, position: { x: mousePos.x, y: mousePos.y }, label: newId });
                this.buildDOM(); this.updatePositions(); this.triggerSave();
            });
            addMenuItem("🔗 Link Mode", () => this.setMode("link"));
            addMenuItem("💾 Save Changes", () => {
                this.triggerSave(true);
                this.contextMenu.style.display = "none";
            }, "var(--interactive-accent)");
            addMenuItem("⚙️ Import DOT", () => { this.setMode("none"); this.showDotImportModal(); });
            addMenuItem("🗑️ Delete Mode", () => this.setMode("delete"), "var(--text-error)");

            // Position and show the menu
            this.contextMenu.style.visibility = "hidden"; // Hide it while we measure it
            this.contextMenu.style.display = "flex";

            const rect = this.container.getBoundingClientRect();
            const menuRect = this.contextMenu.getBoundingClientRect();

            let x = evt.clientX - rect.left;
            let y = evt.clientY - rect.top;

            // If the menu hits the right wall, flip it to open leftward!
            if (x + menuRect.width > rect.width) x -= menuRect.width;

            // If the menu hits the bottom wall, flip it to open upward!
            if (y + menuRect.height > rect.height) y -= menuRect.height;

            this.contextMenu.style.left = `${x}px`;
            this.contextMenu.style.top = `${y}px`;
            this.contextMenu.style.visibility = "visible"; // Show it safely
        });

        this.svg.addEventListener("wheel", (evt) => {
            evt.preventDefault();

            // 1. Get exact SVG coordinate of mouse BEFORE zoom
            const mousePos = this.getMousePosition(evt);

            // 2. Limit extreme zooming bounds
            const delta = Math.sign(evt.deltaY);
            const zoomFactor = delta > 0 ? 1.1 : 0.9;
            if (this.viewBox.w * zoomFactor > 10000 || this.viewBox.w * zoomFactor < 50) return;

            // 3. What exact percentage into the camera is the mouse? (0.0 to 1.0)
            const ratioX = (mousePos.x - this.viewBox.x) / this.viewBox.w;
            const ratioY = (mousePos.y - this.viewBox.y) / this.viewBox.h;

            // 4. Apply the zoom
            this.viewBox.w *= zoomFactor;
            this.viewBox.h *= zoomFactor;

            // 5. Shift camera so that same percentage point stays locked under the mouse!
            this.viewBox.x = mousePos.x - (ratioX * this.viewBox.w);
            this.viewBox.y = mousePos.y - (ratioY * this.viewBox.h);

            this.updateViewBox();
        });

        this.svg.addEventListener("dblclick", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();

            const target = evt.target as SVGElement;

            let nodeToEdit: GraphNode | null = null;
            let edgeToEdit: GraphEdge | null = null;
            let currentText = "";

            // Figure out what we clicked
            const nodeGroup = target.closest("g[data-node-id]") as SVGGElement;
            const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;

            if (edgeGroup && target.nodeName.toLowerCase() === "circle") {
                const edge = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);

                if (edge && edge.isBendable && edge.waypoints) {
                    delete edge.waypoints;
                    this.updatePositions();
                    this.triggerSave();
                }
                return;
            }

            if (nodeGroup && nodeGroup.dataset.nodeId) {
                nodeToEdit = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId) || null;
                if (nodeToEdit) currentText = nodeToEdit.label;
            } else if (edgeGroup && edgeGroup.dataset.edgeId) {
                edgeToEdit = this.edges.find(e => e.id === edgeGroup.dataset.edgeId) || null;
                if (edgeToEdit) currentText = edgeToEdit.label || "";
            } else {
                return; // Clicked empty space
            }

            // Create a floating input box
            const input = document.createElement("input");
            input.type = "text";
            input.value = currentText;
            input.placeholder = "Use $...$ for MathJax";

            // Style it to look native to Obsidian
            input.style.position = "absolute";
            input.style.left = `${evt.offsetX}px`;
            input.style.top = `${evt.offsetY}px`;
            input.style.transform = "translate(-50%, -50%)"; // Center on cursor
            input.style.zIndex = "100";
            input.style.padding = "4px 8px";
            input.style.borderRadius = "4px";
            input.style.border = "2px solid var(--interactive-accent)";
            input.style.background = "var(--background-primary)";
            input.style.color = "var(--text-normal)";
            input.style.outline = "none";
            input.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";

            this.container.appendChild(input);
            input.focus();
            input.select(); // Highlight text so you can overwrite quickly

            let isSaving = false;

            // Function to save and clean up
            const saveAndClose = () => {
                if (isSaving) return; // If already saving, stop here!
                isSaving = true;

                const newLabel = input.value;
                if (nodeToEdit) nodeToEdit.label = newLabel;
                if (edgeToEdit) edgeToEdit.label = newLabel;

                // Safely remove the input if it still exists
                if (input.parentNode) {
                    input.remove();
                }

                this.buildDOM();
                this.updatePositions();
                this.triggerSave();
            };

            // Event listeners for the input
            input.addEventListener("blur", saveAndClose);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    saveAndClose();
                }
                if (e.key === "Escape") {
                    isSaving = true; // Block the blur event from saving
                    if (input.parentNode) input.remove();
                }
            });
        });

        this.svg.addEventListener("mousedown", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();

            if (evt.button === 1 || (evt.button === 0 && evt.altKey)) {
                evt.preventDefault();
                evt.stopPropagation();
                this.isPanning = true;

                // Cache dimensions once!
                const clientW = this.container.clientWidth || 800;
                const clientH = this.container.clientHeight || 300;

                this.panScale = {
                    x: this.viewBox.w / clientW,
                    y: this.viewBox.h / clientH
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

            if (wpHandle) {
                const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;
                const edge = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                if (edge && edge.isBendable) {
                    this.cachedCTM = this.svg.getScreenCTM()
                    this.draggedWaypoint = { edge, wpId: wpHandle.dataset.wpId! };
                    return;
                }
            }

            const group = target.closest("g");

            if (group && group.dataset.nodeId) {
                if (this.isEdgeEditMode) return;

                const clickedNodeId = group.dataset.nodeId;
                const clickedNode = this.nodes.find(n => n.id === clickedNodeId);

                if (this.isTogglingStartMode && clickedNode) {
                    clickedNode.isStart = !clickedNode.isStart;
                    this.buildDOM();
                    this.updatePositions();
                    this.triggerSave();
                    return;
                }

                if (this.isTogglingAcceptMode && clickedNode) {
                    clickedNode.isAccepting = !clickedNode.isAccepting;
                    this.buildDOM();
                    this.updatePositions();
                    this.triggerSave();
                    return;
                }

                // DELETE MODE LOGIC
                if (this.isDeletingMode) {
                    // Remove the node
                    this.nodes = this.nodes.filter(n => n.id !== clickedNodeId);
                    // Remove any edges connected to this node
                    this.edges = this.edges.filter(e => e.source !== clickedNodeId && e.target !== clickedNodeId);

                    this.buildDOM();
                    this.updatePositions();
                    this.triggerSave();
                    return; // Stop here
                }

                // CONNECTION MODE LOGIC
                if (this.isLinkingMode) {
                    if (!this.linkSourceNode) {
                        // First click: Select source
                        this.linkSourceNode = clickedNodeId;
                        group.querySelector("circle")?.setAttribute("stroke", "var(--interactive-accent)"); // Highlight it
                    } else {
                        // Second click: Create Edge
                        this.edges.push({
                            id: `e_${this.linkSourceNode}_${clickedNodeId}`,
                            source: this.linkSourceNode,
                            target: clickedNodeId
                        });

                        // Reset selection
                        this.linkSourceNode = null;
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    }
                    return; // Stop here so we don't accidentally drag while linking
                }

                // DRAG MODE LOGIC
                this.draggedNode = this.nodes.find(n => n.id === clickedNodeId) || null;
                if (this.draggedNode) {
                    this.cachedCTM = this.svg.getScreenCTM();

                    const mousePos = this.getMousePosition(evt);
                    this.dragOffset = {
                        x: mousePos.x - this.draggedNode.position.x,
                        y: mousePos.y - this.draggedNode.position.y
                    };
                    group.style.cursor = "grabbing";
                }
            }
        });

        this.svg.addEventListener("mousemove", (evt) => {
            if (this.isPanning) {
                const dx = (evt.clientX - this.panStart.x) * this.panScale.x;
                const dy = (evt.clientY - this.panStart.y) * this.panScale.y;

                this.viewBox.x = this.panStartViewBox.x - dx;
                this.viewBox.y = this.panStartViewBox.y - dy;

                this.updateViewBox();
                return;
            }

            if (this.isLinkingMode) return;

            if (!this.hasMovedEnough) {
                const dist = Math.sqrt(
                    Math.pow(evt.clientX - this.dragStartPos.x, 2) +
                    Math.pow(evt.clientY - this.dragStartPos.y, 2)
                );
                if (dist < 3) return; // Ignore movements smaller than 3 pixels
                this.hasMovedEnough = true; // Once they move 3px, we start dragging for real
            }

            evt.preventDefault();
            const mousePos = this.getMousePosition(evt);

            // Handle Edge dragging
            if (this.draggedWaypoint) {
                const { edge, wpId } = this.draggedWaypoint;
                const wp = edge.waypoints!.find(w => w.id === wpId);
                if (wp) {
                    wp.x = Math.round(mousePos.x * 10) / 10;
                    wp.y = Math.round(mousePos.y * 10) / 10;
                    this.updatePositions();
                }
                return;
            }

            // Handle Node dragging
            if (this.draggedNode) {
                const rawX = mousePos.x - this.dragOffset.x;
                const rawY = mousePos.y - this.dragOffset.y;

                const newX = Math.round(rawX * 10) / 10;
                const newY = Math.round(rawY * 10) / 10;

                const dx = newX - this.draggedNode.position.x;
                const dy = newY - this.draggedNode.position.y;
                this.draggedNode.position = { x: newX, y: newY };

                this.edges.forEach(edge => {
                    if (edge.waypoints) {
                        edge.waypoints.forEach(wp => {
                            if (edge.source === this.draggedNode!.id && edge.target === this.draggedNode!.id) {
                                wp.x += dx; wp.y += dy;
                            } else if (edge.source === this.draggedNode!.id || edge.target === this.draggedNode!.id) {
                                wp.x += dx / 2; wp.y += dy / 2;
                            }
                        });
                    }
                });
                this.updatePositions();
            }
        });

        const endDrag = () => {
            this.cachedCTM = null;

            if (this.isPanning) {
                this.isPanning = false;
                this.svg.style.cursor = "grab";
            }

            if (this.draggedNode && !this.isLinkingMode) {
                const group = this.nodeElements.get(this.draggedNode.id);
                if (group) group.style.cursor = "pointer";
                this.draggedNode = null;
            }

            if (this.draggedWaypoint) {
                this.draggedWaypoint = null;
            }
        };

        this.triggerSave(false);
        this.svg.addEventListener("mouseup", endDrag);
        this.svg.addEventListener("mouseleave", endDrag);
    }

    private importFromDot(dotString: string) {
        const parsedNodes = new Map<string, GraphNode>();
        const parsedEdges: GraphEdge[] = [];

        // Helper to grab or create a node
        const getNode = (id: string) => {
            if (!parsedNodes.has(id)) {
                parsedNodes.set(id, { id, label: id, position: { x: 0, y: 0 } });
            }
            return parsedNodes.get(id)!;
        };

        const lines = dotString.split('\n');
        lines.forEach(line => {
            // Clean up the line
            line = line.trim();
            if (line.startsWith("//") || line.startsWith("digraph") || line === "}") return;

            // 1. Match Edges: A -> B [label="x"]
            const edgeMatch = line.match(/([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)(?:\s*\[(.*?)\])?/);
            if (edgeMatch) {
                const source = edgeMatch[1];
                const target = edgeMatch[2];
                const attrs = edgeMatch[3] || "";

                // Handle the Graphviz convention for Start states (invisible node pointing to start)
                if (source.toLowerCase() === "start" || source.toLowerCase() === "init" || source === "") {
                    getNode(target).isStart = true;
                    return;
                }

                getNode(source);
                getNode(target);

                let label = "";
                const labelMatch = attrs.match(/label\s*=\s*"([^"]+)"/);
                if (labelMatch) label = labelMatch[1];

                parsedEdges.push({
                    id: `e_${source}_${target}_${parsedEdges.length}`,
                    source,
                    target,
                    label
                });
                return;
            }

            // 2. Match Node Attributes: A [shape=doublecircle]
            const nodeMatch = line.match(/([a-zA-Z0-9_]+)\s*\[(.*?)\]/);
            if (nodeMatch && !line.includes("->")) {
                const id = nodeMatch[1];
                const attrs = nodeMatch[2];
                const node = getNode(id);

                if (attrs.includes("shape=doublecircle")) {
                    node.isAccepting = true;
                }

                const labelMatch = attrs.match(/label\s*=\s*"([^"]+)"/);
                if (labelMatch) node.label = labelMatch[1];
            }
        });

        // 3. Circular Layout Math
        const nodeArray = Array.from(parsedNodes.values());
        const radius = Math.max(100, nodeArray.length * 25); // Scale radius based on node count
        const centerX = this.svg.clientWidth / 2 || 250;
        const centerY = 250;

        nodeArray.forEach((node, i) => {
            // Distribute evenly around a circle (starting from the left)
            const angle = Math.PI + (i / nodeArray.length) * Math.PI * 2;
            node.position = {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            };
        });

        // Overwrite current state and re-render
        this.nodes = nodeArray;
        this.edges = parsedEdges;
        this.buildDOM();
        this.updatePositions();
        this.triggerSave();
    }
}