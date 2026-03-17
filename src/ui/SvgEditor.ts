import { finishRenderMath, renderMath } from "obsidian";
import { GraphEdge, GraphNode, GraphViewport, Position } from "../models/graph";
import { DEFAULT_THEME, GraphTheme } from "../models/theme";

export class SvgGraphEditor
{
    static persistedMode = "none";

    container: HTMLElement;
    svg: SVGSVGElement;

    private contextMenu: HTMLDivElement;
    private unsavedDot: HTMLDivElement;

    private readonly viewBox = { x: 0, y: 0, w: 800, h: 500 };
    private isPanning = false;
    private panStart: Position = { x: 0, y: 0 };
    private panStartViewBox: Position = { x: 0, y: 0 };
    private panScale = { x: 1, y: 1 };
    private dragStartPos: Position = { x: 0, y: 0 };
    private hasMovedEnough = false;
    private cachedCTM: DOMMatrix | null = null;

    nodes: GraphNode[];
    edges: GraphEdge[];
    theme: GraphTheme;

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

    // Linking state only — no more delete mode
    private isLinkingMode = false;
    private linkSourceNode: string | null = null;

    // Hover link button overlay
    private linkButton: SVGGElement | null = null;
    private hoveredNodeId: string | null = null;

    private onSave: (nodes: GraphNode[], edges: GraphEdge[], theme?: GraphTheme, viewport?: GraphViewport) => void;
    private onManualSave: () => void;

    constructor(
        container: HTMLElement,
        initialNodes: GraphNode[],
        initialEdges: GraphEdge[],
        initialViewport: GraphViewport | undefined,
        userTheme: GraphTheme | undefined,
        onSave: (nodes: GraphNode[], edges: GraphEdge[], theme?: GraphTheme, viewport?: GraphViewport) => void,
        onManualSave: () => void
    )
    {
        this.container = container;
        this.container.addClass("automaton-graph-container");

        const initHeight = initialViewport?.height ? Math.max(100, initialViewport.height) : 300;
        this.container.style.height = `${initHeight}px`;

        this.nodes = initialNodes;
        this.edges = initialEdges;
        this.onSave = onSave;
        this.onManualSave = onManualSave;
        this.theme = { ...DEFAULT_THEME, ...userTheme };

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.classList.add("automaton-svg-canvas");
        this.container.appendChild(this.svg);

        if (initialViewport?.viewBox)
        {
            this.viewBox = { ...initialViewport.viewBox };
            if (this.viewBox.h > 10000 || this.viewBox.w > 10000 || this.viewBox.h < 10)
            {
                this.viewBox = { x: 0, y: 0, w: 800, h: initHeight };
            }
        } else
        {
            this.viewBox = { x: 0, y: 0, w: 800, h: initHeight };
        }
        this.updateViewBox();

        this.buildDOM();
        this.buildUnsavedDot();
        this.buildContextMenu();
        this.buildResizer();
        this.initEvents();
        this.updatePositions();
    }

    // ─── SAVE ───────────────────────────────────────────────────────────────────

    private triggerSave(forceFileWrite = false)
    {
        const h = Math.max(100, this.container.clientHeight || parseInt(this.container.style.height) || 300);
        const currentViewport: GraphViewport = { height: h, viewBox: { ...this.viewBox } };

        if (forceFileWrite)
        {
            this.onSave(this.nodes, this.edges, this.theme, currentViewport);
            this.unsavedDot.style.opacity = "0";
        } else
        {
            this.unsavedDot.style.opacity = "1";
        }
    }

    public forceSave()
    {
        this.triggerSave(true);
    }

    // ─── VIEWPORT ───────────────────────────────────────────────────────────────

    private updateViewBox()
    {
        this.svg.setAttribute("viewBox", `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
    }

    // ─── RESIZER ────────────────────────────────────────────────────────────────

    private buildResizer()
    {
        const resizer = document.createElement("div");
        resizer.className = "obsidian-automaton-resizer";
        resizer.onmouseenter = () => resizer.style.backgroundColor = "var(--interactive-accent)";
        resizer.onmouseleave = () => resizer.style.backgroundColor = "transparent";
        this.container.appendChild(resizer);

        let isResizing = false, startY = 0, startHeight = 0, startViewBoxH = 0, scaleY = 1;

        resizer.addEventListener("mousedown", (e) =>
        {
            e.preventDefault();
            isResizing = true;
            startY = e.clientY;
            startHeight = this.container.clientHeight || 300;
            startViewBoxH = this.viewBox.h;
            scaleY = startViewBoxH / startHeight;
            document.body.style.cursor = "ns-resize";
        });

        document.addEventListener("mousemove", (e) =>
        {
            if (!isResizing) return;
            const dy = e.clientY - startY;
            this.container.style.height = `${Math.max(100, startHeight + dy)}px`;
            this.viewBox.h = startViewBoxH + dy * scaleY;
            this.updateViewBox();
        });

        document.addEventListener("mouseup", () =>
        {
            if (isResizing)
            {
                isResizing = false;
                document.body.style.cursor = "";
            }
        });
    }

    // ─── UNSAVED DOT ────────────────────────────────────────────────────────────

    private buildUnsavedDot()
    {
        this.unsavedDot = document.createElement("div");
        this.unsavedDot.className = "automaton-unsaved-dot";
        this.unsavedDot.style.opacity = "0";
        this.unsavedDot.title = "Unsaved changes — press Ctrl+S to save";
        this.container.appendChild(this.unsavedDot);
    }

    // ─── LINK BUTTON (hover overlay on nodes) ───────────────────────────────────

    private buildLinkButton()
    {
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

        g.addEventListener("mousedown", (e) =>
        {
            e.preventDefault();
            e.stopPropagation();
            if (!this.hoveredNodeId) return;
            this.startLinking(this.hoveredNodeId);
        });
    }

    private showLinkButton(node: GraphNode)
    {
        if (!this.linkButton) return;
        // Position at top-right of node circle
        const bx = node.position.x + 20;
        const by = node.position.y - 20;
        this.linkButton.setAttribute("transform", `translate(${bx}, ${by})`);
        this.linkButton.style.display = "block";
    }

    private hideLinkButton()
    {
        if (this.linkButton) this.linkButton.style.display = "none";
    }

    private startLinking(sourceId: string)
    {
        this.isLinkingMode = true;
        this.linkSourceNode = sourceId;
        this.svg.style.cursor = "crosshair";
        this.hideLinkButton();

        // Highlight source node
        const group = this.nodeElements.get(sourceId);
        group?.querySelector("circle")?.setAttribute("stroke", "var(--interactive-accent)");
    }

    // ─── DOT IMPORT ─────────────────────────────────────────────────────────────

    private showDotImportModal()
    {
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
        convertBtn.onclick = () =>
        {
            if (textarea.value.trim()) this.importFromDot(textarea.value);
            overlay.remove();
        };

        overlay.appendChild(modal);
        this.container.appendChild(overlay);
        textarea.focus();
    }

    // ─── LABEL RENDERING ────────────────────────────────────────────────────────

    private createLabelContent(text: string, color: string): HTMLElement
    {
        const container = document.createElement("div");
        container.addClass("automaton-label-container");

        const pill = document.createElement("div");
        pill.addClass("automaton-label-pill");
        pill.style.color = color;

        text.split(/(\$.*?\$)/g).forEach(part =>
        {
            if (part.startsWith("$") && part.endsWith("$"))
            {
                try
                {
                    const mathEl = renderMath(part.slice(1, -1), false);
                    mathEl.style.margin = "0";
                    pill.appendChild(mathEl);
                } catch
                {
                    pill.appendChild(document.createTextNode(part));
                }
            } else if (part.length > 0)
            {
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
    }
    {
        const sx = sourceNode.position.x, sy = sourceNode.position.y;
        const tx = targetNode.position.x, ty = targetNode.position.y;
        const radius = 25;

        const getNormal = (dx: number, dy: number) =>
        {
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            return { nx: dy / dist, ny: -dx / dist };
        };

        // 1. SELF-LOOPS
        if (sourceNode.id === targetNode.id && (!edge.waypoints || edge.waypoints.length <= 1))
        {
            let loopAngle = -Math.PI / 2;
            let pushOut = 90, curvePeak = pushOut * 0.75;

            if (edge.waypoints?.length === 1)
            {
                const wp = edge.waypoints[0];
                loopAngle = Math.atan2(wp.y - sy, wp.x - sx);
                curvePeak = Math.max(30, Math.sqrt((wp.x - sx) ** 2 + (wp.y - sy) ** 2));
                pushOut = curvePeak / 0.75;
            } else
            {
                let sumX = 0, sumY = 0, count = 0;
                this.edges.forEach(e =>
                {
                    const otherId = (e.source === sourceNode.id && e.target !== sourceNode.id) ? e.target :
                        (e.target === sourceNode.id && e.source !== sourceNode.id) ? e.source : null;
                    if (otherId)
                    {
                        const other = this.nodes.find(n => n.id === otherId);
                        if (other)
                        {
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
                lx: sx + Math.cos(loopAngle) * curvePeak + Math.cos(loopAngle) * 20,
                ly: sy + Math.sin(loopAngle) * curvePeak + Math.sin(loopAngle) * 20,
                hx: 0, hy: 0
            };
        }

        // 2. MULTI-POINT PATH
        if (edge.waypoints?.length)
        {
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
            for (let i = 0; i < wps.length; i++)
            {
                const wp = wps[i];
                if (wp.type === "linear")
                {
                    path += ` L ${wp.x} ${wp.y}`;
                } else
                {
                    if (wps.length === 1)
                    {
                        const ctrlX = 2 * wp.x - 0.5 * startX - 0.5 * endX;
                        const ctrlY = 2 * wp.y - 0.5 * startY - 0.5 * endY;
                        path += ` Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
                    } else
                    {
                        let targetX, targetY;
                        if (i + 1 < wps.length)
                        {
                            const next = wps[i + 1];
                            targetX = next.type === "bezier" ? (wp.x + next.x) / 2 : next.x;
                            targetY = next.type === "bezier" ? (wp.y + next.y) / 2 : next.y;
                        } else
                        {
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
            for (let i = 0; i < allPoints.length - 1; i++)
            {
                const d = Math.sqrt((allPoints[i + 1].x - allPoints[i].x) ** 2 + (allPoints[i + 1].y - allPoints[i].y) ** 2);
                distances.push(d);
                totalDist += d;
            }

            const halfDist = totalDist / 2;
            let runningDist = 0, lx = 0, ly = 0;
            for (let i = 0; i < allPoints.length - 1; i++)
            {
                if (runningDist + distances[i] >= halfDist || i === allPoints.length - 2)
                {
                    const ratio = distances[i] === 0 ? 0 : (halfDist - runningDist) / distances[i];
                    const midX = allPoints[i].x + (allPoints[i + 1].x - allPoints[i].x) * ratio;
                    const midY = allPoints[i].y + (allPoints[i + 1].y - allPoints[i].y) * ratio;
                    const segDx = allPoints[i + 1].x - allPoints[i].x;
                    const segDy = allPoints[i + 1].y - allPoints[i].y;
                    const dist = distances[i] || 1;
                    lx = midX + (segDy / dist) * 20;
                    ly = midY + (-segDx / dist) * 20;
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
        if (hasReverse)
        {
            const startX = sx + Math.cos(angle + 0.35) * radius;
            const startY = sy + Math.sin(angle + 0.35) * radius;
            const endX = tx + Math.cos(angle + Math.PI - 0.35) * radius;
            const endY = ty + Math.sin(angle + Math.PI - 0.35) * radius;
            const midX = (sx + tx) / 2, midY = (sy + ty) / 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const { nx, ny } = getNormal(dx, dy);
            const ctrlX = midX + nx * (dist * 0.2), ctrlY = midY + ny * (dist * 0.2);
            const hx = (midX + ctrlX) / 2, hy = (midY + ctrlY) / 2;
            return {
                path: `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`,
                lx: hx + nx * 20, ly: hy + ny * 20, hx, hy
            };
        }

        // 4. STRAIGHT LINE
        const startX = sx + Math.cos(angle) * radius, startY = sy + Math.sin(angle) * radius;
        const endX = tx - Math.cos(angle) * radius, endY = ty - Math.sin(angle) * radius;
        const { nx, ny } = getNormal(dx, dy);
        const hx = (startX + endX) / 2, hy = (startY + endY) / 2;
        return {
            path: `M ${startX} ${startY} L ${endX} ${endY}`,
            lx: hx + nx * 20, ly: hy + ny * 20, hx, hy
        };
    }

    // ─── DOM BUILD ──────────────────────────────────────────────────────────────

    private buildDOM()
    {
        const markerId = `arrow-${Math.random().toString(36).substring(2, 9)}`;
        this.svg.innerHTML = "";
        this.nodeElements.clear();
        this.edgeElements.clear();
        this.linkButton = null;

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
        this.edges.forEach(edge =>
        {
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

            edge.waypoints?.forEach(wp =>
            {
                const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                handle.dataset.wpId = wp.id;
                handle.setAttribute("r", "8");
                handle.setAttribute("fill", wp.type === "bezier" ? "var(--interactive-accent)" : "#d97706");
                handle.style.cursor = "grab";
                handleGroup.appendChild(handle);
            });

            group.addEventListener("mouseenter", () =>
            {
                if (edge.isBendable)
                {
                    handleGroup.setAttribute("opacity", "1");
                    hitbox.style.cursor = "crosshair";
                }
            });
            group.addEventListener("mouseleave", () =>
            {
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
        this.nodes.forEach(node =>
        {
            const nodeColor = node.color || this.theme.nodeStroke || "var(--text-normal)";
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.style.cursor = "pointer";
            group.dataset.nodeId = node.id;

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", "0");
            circle.setAttribute("cy", "0");
            circle.setAttribute("r", "25");
            if (node.isAccepting) circle.setAttribute("stroke", this.theme.acceptCircle || nodeColor);
            else circle.setAttribute("stroke", nodeColor);
            circle.setAttribute("fill", this.theme.nodeFill || "var(--background-primary)");
            circle.setAttribute("stroke-width", "2");
            group.appendChild(circle);

            if (node.isAccepting)
            {
                const inner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                inner.setAttribute("r", "20");
                inner.setAttribute("fill", "none");
                inner.setAttribute("stroke", this.theme.acceptCircle || nodeColor);
                inner.setAttribute("stroke-width", "2");
                group.appendChild(inner);
            }

            if (node.isStart)
            {
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
            foreignObjNode.appendChild(this.createLabelContent(node.label, this.theme.text!));
            group.appendChild(foreignObjNode);

            // Hover → show link button
            group.addEventListener("mouseenter", () =>
            {
                if (this.isLinkingMode || this.draggedNode) return;
                this.hoveredNodeId = node.id;
                this.showLinkButton(node);
            });
            group.addEventListener("mouseleave", (e) =>
            {
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
    }

    // ─── POSITIONS ──────────────────────────────────────────────────────────────

    private updatePositions()
    {
        this.nodes.forEach(node =>
        {
            const group = this.nodeElements.get(node.id);
            if (group) group.setAttribute("transform", `translate(${node.position.x}, ${node.position.y})`);
        });

        this.edges.forEach(edge =>
        {
            const src = this.nodes.find(n => n.id === edge.source);
            const tgt = this.nodes.find(n => n.id === edge.target);
            const els = this.edgeElements.get(edge.id);
            if (src && tgt && els)
            {
                const { path, lx, ly } = this.getEdgePathData(edge, src, tgt);
                els.path.setAttribute("d", path);
                els.hitbox.setAttribute("d", path);
                els.label.setAttribute("x", lx.toString());
                els.label.setAttribute("y", ly.toString());

                edge.waypoints?.forEach((wp, i) =>
                {
                    const circles = els.handleGroup.querySelectorAll("circle");
                    if (circles[i])
                    {
                        circles[i].setAttribute("cx", wp.x.toString());
                        circles[i].setAttribute("cy", wp.y.toString());
                    }
                });
            }
        });
    }

    // ─── MOUSE HELPERS ──────────────────────────────────────────────────────────

    private getMousePosition(evt: MouseEvent): Position
    {
        const CTM = this.cachedCTM || this.svg.getScreenCTM();
        if (!CTM) return { x: evt.clientX, y: evt.clientY };
        return { x: (evt.clientX - CTM.e) / CTM.a, y: (evt.clientY - CTM.f) / CTM.d };
    }

    // ─── CONTEXT MENU ───────────────────────────────────────────────────────────

    private buildContextMenu()
    {
        this.contextMenu = document.createElement("div");
        this.contextMenu.addClass("automaton-context-menu");
        document.body.appendChild(this.contextMenu);

        document.addEventListener("mousedown", (e) =>
        {
            if (!this.contextMenu.contains(e.target as HTMLElement))
            {
                this.contextMenu.style.display = "none";
            }
        });

        document.addEventListener("keydown", (e) =>
        {
            if (e.key === "Escape")
            {
                this.cancelLinking();
                this.contextMenu.style.display = "none";
            }
        });
    }

    private cancelLinking()
    {
        if (this.isLinkingMode)
        {
            this.isLinkingMode = false;
            this.linkSourceNode = null;
            this.svg.style.cursor = "grab";
            this.buildDOM();
            this.updatePositions();
        }
    }

    private showContextMenu(x: number, y: number)
    {
        this.contextMenu.style.display = "flex";
        this.contextMenu.style.visibility = "hidden";

        const menuRect = this.contextMenu.getBoundingClientRect();
        const nx = x + menuRect.width > window.innerWidth ? x - menuRect.width : x;
        const ny = y + menuRect.height > window.innerHeight ? y - menuRect.height : y;

        this.contextMenu.style.left = `${nx}px`;
        this.contextMenu.style.top = `${ny}px`;
        this.contextMenu.style.visibility = "visible";
    }

    private addMenuItem(text: string, onClick: () => void, variant: "normal" | "danger" | "accent" = "normal")
    {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.addClass("automaton-context-menu-item");
        if (variant === "danger") btn.addClass("automaton-context-menu-item-error");
        if (variant === "accent") btn.addClass("automaton-context-menu-accent");
        btn.onclick = (e) =>
        {
            e.stopPropagation();
            this.contextMenu.style.display = "none";
            onClick();
        };
        this.contextMenu.appendChild(btn);
    }

    private addDivider()
    {
        const d = document.createElement("div");
        d.addClass("automaton-context-menu-divider");
        this.contextMenu.appendChild(d);
    }

    private addColorPicker(label: string, current: string | undefined, onChange: (c: string) => void)
    {
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

    // ─── EVENTS ─────────────────────────────────────────────────────────────────

    private initEvents()
    {
        this.container.addEventListener("click", (e) => e.stopPropagation());
        this.container.addEventListener("pointerdown", (e) => e.stopPropagation());

        // ── CONTEXT MENU ──
        this.svg.addEventListener("contextmenu", (evt) =>
        {
            evt.preventDefault();
            evt.stopPropagation();
            this.contextMenu.innerHTML = "";

            const target = evt.target as SVGElement;
            const nodeGroup = target.closest("g[data-node-id]") as SVGGElement;
            const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;
            const wpHandle = target.closest("circle[data-wp-id]") as SVGCircleElement;

            // NODE SECTION
            if (nodeGroup?.dataset.nodeId)
            {
                const node = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId);
                if (node)
                {
                    this.addMenuItem(node.isStart ? "Remove start" : "Set as start", () =>
                    {
                        node.isStart = !node.isStart;
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addMenuItem(node.isAccepting ? "Remove accepting" : "Set as accepting", () =>
                    {
                        node.isAccepting = !node.isAccepting;
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addColorPicker("Node color", node.color, (c) =>
                    {
                        node.color = c;
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    });
                    this.addDivider();
                    this.addMenuItem("Delete state", () =>
                    {
                        this.nodes = this.nodes.filter(n => n.id !== node.id);
                        this.edges = this.edges.filter(e => e.source !== node.id && e.target !== node.id);
                        this.buildDOM();
                        this.updatePositions();
                        this.triggerSave();
                    }, "danger");
                }
            }

            // EDGE SECTION
            else if (edgeGroup?.dataset.edgeId)
            {
                const edge = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                if (edge)
                {
                    if (wpHandle)
                    {
                        // Waypoint sub-menu
                        const wpId = wpHandle.dataset.wpId;
                        const wpIdx = edge.waypoints!.findIndex(w => w.id === wpId);
                        const wp = edge.waypoints![wpIdx];
                        this.addMenuItem(wp.type === "bezier" ? "Change to linear" : "Change to bezier", () =>
                        {
                            wp.type = wp.type === "bezier" ? "linear" : "bezier";
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        this.addDivider();
                        this.addMenuItem("Delete point", () =>
                        {
                            edge.waypoints!.splice(wpIdx, 1);
                            if (!edge.waypoints!.length) delete edge.waypoints;
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        }, "danger");
                    } else
                    {
                        // Edge sub-menu
                        this.addMenuItem(edge.isBendable ? "Lock path" : "Unlock path", () =>
                        {
                            edge.isBendable = !edge.isBendable;
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        if (edge.isBendable)
                        {
                            this.addMenuItem("Add bezier point", () =>
                            {
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
                            this.addMenuItem("Add linear point", () =>
                            {
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
                        this.addColorPicker("Edge color", edge.color, (c) =>
                        {
                            edge.color = c;
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        this.addMenuItem(edge.type === "arrow" ? "Remove arrow" : "Add arrow", () =>
                        {
                            edge.type = edge.type === "arrow" ? undefined : "arrow";
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        });
                        this.addDivider();
                        this.addMenuItem("Delete edge", () =>
                        {
                            this.edges = this.edges.filter(e => e.id !== edge.id);
                            this.buildDOM();
                            this.updatePositions();
                            this.triggerSave();
                        }, "danger");
                    }
                }
            }

            // CANVAS SECTION (always at bottom, or only section if on blank canvas)
            else
            {
                this.addMenuItem("Add state here", () =>
                {
                    const mp = this.getMousePosition(evt);
                    const newId = `q${this.nodes.length}`;
                    this.nodes.push({ id: newId, position: { x: mp.x, y: mp.y }, label: newId });
                    this.buildDOM();
                    this.updatePositions();
                    this.triggerSave();
                });
                this.addMenuItem("Import DOT", () => this.showDotImportModal());
                this.addDivider();
                this.addMenuItem("Save", () =>
                {
                    this.triggerSave(true);
                    this.onManualSave();
                }, "accent");
            }

            this.showContextMenu(evt.clientX, evt.clientY);
        });

        // ── SCROLL ZOOM ──
        this.svg.addEventListener("wheel", (evt) =>
        {
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
        this.svg.addEventListener("dblclick", (evt) =>
        {
            evt.preventDefault();
            evt.stopPropagation();
            const target = evt.target as SVGElement;
            const nodeGroup = target.closest("g[data-node-id]") as SVGGElement;
            const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;

            // Double-click on waypoint circle = clear all waypoints
            if (edgeGroup && target.nodeName.toLowerCase() === "circle")
            {
                const edge = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                if (edge?.isBendable)
                {
                    delete edge.waypoints;
                    this.updatePositions();
                    this.triggerSave();
                }
                return;
            }

            let editTarget: GraphNode | GraphEdge | null = null;
            let currentText = "";

            if (nodeGroup?.dataset.nodeId)
            {
                editTarget = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId) || null;
                if (editTarget) currentText = (editTarget as GraphNode).label;
            } else if (edgeGroup?.dataset.edgeId)
            {
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
            const save = () =>
            {
                if (saved) return;
                saved = true;
                if (nodeGroup?.dataset.nodeId)
                {
                    const n = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId);
                    if (n) n.label = input.value;
                } else if (edgeGroup?.dataset.edgeId)
                {
                    const e = this.edges.find(e => e.id === edgeGroup.dataset.edgeId);
                    if (e) e.label = input.value;
                }
                if (input.parentNode) input.remove();
                this.buildDOM();
                this.updatePositions();
                this.triggerSave();
            };

            input.addEventListener("blur", save);
            input.addEventListener("keydown", (e) =>
            {
                if (e.key === "Enter") save();
                if (e.key === "Escape")
                {
                    saved = true;
                    input.remove();
                }
            });
        });

        // ── MOUSE DOWN ──
        this.svg.addEventListener("mousedown", (evt) =>
        {
            evt.preventDefault();
            evt.stopPropagation();

            // Middle click / Alt+click = pan
            if (evt.button === 1 || (evt.button === 0 && evt.altKey))
            {
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

            // Waypoint drag
            if (wpHandle)
            {
                const edgeGroup = target.closest("g[data-edge-id]") as SVGGElement;
                const edge = this.edges.find(e => e.id === edgeGroup?.dataset.edgeId);
                if (edge?.isBendable)
                {
                    this.cachedCTM = this.svg.getScreenCTM();
                    this.draggedWaypoint = { edge, wpId: wpHandle.dataset.wpId! };
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                    return;
                }
            }

            // Node click in link mode
            if (this.isLinkingMode && nodeGroup?.dataset.nodeId)
            {
                const clickedId = nodeGroup.dataset.nodeId;
                if (!this.linkSourceNode)
                {
                    this.startLinking(clickedId);
                } else
                {
                    this.edges.push({ id: `e_${Date.now()}`, source: this.linkSourceNode, target: clickedId, type: "arrow" });
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
            if (nodeGroup?.dataset.nodeId)
            {
                const node = this.nodes.find(n => n.id === nodeGroup.dataset.nodeId) || null;
                if (node)
                {
                    this.cachedCTM = this.svg.getScreenCTM();
                    const mp = this.getMousePosition(evt);
                    this.dragOffset = { x: mp.x - node.position.x, y: mp.y - node.position.y };
                    this.draggedNode = node;
                    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
                    this.hasMovedEnough = false;
                    nodeGroup.style.cursor = "grabbing";
                }
            }
        });

        // ── MOUSE MOVE ──
        this.svg.addEventListener("mousemove", (evt) =>
        {
            if (this.isPanning)
            {
                this.viewBox.x = this.panStartViewBox.x - (evt.clientX - this.panStart.x) * this.panScale.x;
                this.viewBox.y = this.panStartViewBox.y - (evt.clientY - this.panStart.y) * this.panScale.y;
                this.updateViewBox();
                return;
            }

            if (!this.hasMovedEnough && (this.draggedNode || this.draggedWaypoint))
            {
                const dist = Math.sqrt((evt.clientX - this.dragStartPos.x) ** 2 + (evt.clientY - this.dragStartPos.y) ** 2);
                if (dist < 3) return;
                this.hasMovedEnough = true;
            }

            if (!this.draggedNode && !this.draggedWaypoint) return;
            evt.preventDefault();
            const mp = this.getMousePosition(evt);

            if (this.draggedWaypoint)
            {
                const { edge, wpId } = this.draggedWaypoint;
                const wp = edge.waypoints?.find(w => w.id === wpId);
                if (wp)
                {
                    wp.x = Math.round(mp.x * 10) / 10;
                    wp.y = Math.round(mp.y * 10) / 10;
                    this.updatePositions();
                }
                return;
            }

            if (this.draggedNode)
            {
                const newX = Math.round((mp.x - this.dragOffset.x) * 10) / 10;
                const newY = Math.round((mp.y - this.dragOffset.y) * 10) / 10;
                const dx = newX - this.draggedNode.position.x;
                const dy = newY - this.draggedNode.position.y;
                this.draggedNode.position = { x: newX, y: newY };

                this.edges.forEach(edge =>
                {
                    if (edge.waypoints)
                    {
                        const isSelf = edge.source === this.draggedNode!.id && edge.target === this.draggedNode!.id;
                        const isConnected = edge.source === this.draggedNode!.id || edge.target === this.draggedNode!.id;
                        edge.waypoints.forEach(wp =>
                        {
                            if (isSelf)
                            {
                                wp.x += dx;
                                wp.y += dy;
                            } else if (isConnected)
                            {
                                wp.x += dx / 2;
                                wp.y += dy / 2;
                            }
                        });
                    }
                });
                this.updatePositions();
            }
        });

        // ── MOUSE UP / LEAVE ──
        const endDrag = () =>
        {
            this.cachedCTM = null;
            if (this.isPanning)
            {
                this.isPanning = false;
                this.svg.style.cursor = "grab";
            }
            if (this.draggedNode)
            {
                const group = this.nodeElements.get(this.draggedNode.id);
                if (group) group.style.cursor = "pointer";
                this.draggedNode = null;
                this.triggerSave(false);
            }
            if (this.draggedWaypoint)
            {
                this.draggedWaypoint = null;
                this.triggerSave(false);
            }
        };

        this.svg.addEventListener("mouseup", endDrag);
        this.svg.addEventListener("mouseleave", endDrag);

        this.triggerSave(false);
    }

    // ─── DOT IMPORT ─────────────────────────────────────────────────────────────

    private importFromDot(dotString: string)
    {
        const parsedNodes = new Map<string, GraphNode>();
        const parsedEdges: GraphEdge[] = [];

        const getNode = (id: string) =>
        {
            if (!parsedNodes.has(id)) parsedNodes.set(id, { id, label: id, position: { x: 0, y: 0 } });
            return parsedNodes.get(id)!;
        };

        dotString.split("\n").forEach(rawLine =>
        {
            const line = rawLine.trim();
            if (line.startsWith("//") || line.startsWith("digraph") || line === "}") return;

            const edgeMatch = line.match(/([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)(?:\s*\[(.*?)\])?/);
            if (edgeMatch)
            {
                const [, source, target, attrs = ""] = edgeMatch;
                if (source.toLowerCase() === "start" || source.toLowerCase() === "init")
                {
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
                    label: labelMatch?.[1] ?? "",
                    type: "arrow"
                });
                return;
            }

            const nodeMatch = line.match(/([a-zA-Z0-9_]+)\s*\[(.*?)\]/);
            if (nodeMatch && !line.includes("->"))
            {
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

        nodeArray.forEach((node, i) =>
        {
            const angle = Math.PI + (i / nodeArray.length) * Math.PI * 2;
            node.position = { x: centerX + radius * Math.cos(angle), y: 250 + radius * Math.sin(angle) };
        });

        this.nodes = nodeArray;
        this.edges = parsedEdges;
        this.buildDOM();
        this.updatePositions();
        this.triggerSave();
    }

    // ─── CLEANUP ────────────────────────────────────────────────────────────────

    public destroy()
    {
        this.contextMenu?.parentNode && this.contextMenu.remove();
    }
}