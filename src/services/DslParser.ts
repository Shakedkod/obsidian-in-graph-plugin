import { CircuitGate, CircuitWire, GateType } from "src/models/circuits";
import { GraphEdge, GraphGroup, GraphNode, Position } from "src/models/graph";
import { ParserNode, ParserGroup, ParserInner, ParserOutput, ParserGate, NODE_SPACING_Y, START_Y, NODE_SPACING_X, START_X } from "src/models/parser";

enum LineType {
    CIRCUIT, AUTOMATON, GROUP, SETTINGS, UNKNOWN,
    NODE, GATE, NODE_ATTR
}

type funcOutput = { data: ParserInner, type: LineType, vars: Record<string, any> };

function processGroupLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput {
    const startIndex = "group ".length;
    const endIndex = line.indexOf(":");
    if (endIndex === -1) {
        return { data, type: LineType.UNKNOWN, vars: {} };
    }

    const groupName = line.substring(startIndex, endIndex).trim();
    if (!groupName) {
        return { data, type: LineType.UNKNOWN, vars: {} };
    }

    const group: ParserGroup = {
        id: `group-${crypto.randomUUID()}`,
        name: groupName,
        nodes: [],
        gates: [],
        groups: []
    };

    if (groupFlag) {
        const parent = data.groups.find(g => g.id === groupFlag);
        parent?.groups.push(group);
    } else {
        data.groups.push(group);
    }
    return { data, type: LineType.GROUP, vars: { groupFlag: group.id } };
}

function isInData(nodeId: string, type: LineType, data: ParserInner): boolean {
    switch (type) {
        case LineType.NODE:
            return data.nodes.some(n => n.id === nodeId) || data.gates.some(g => g.id === nodeId);
        case LineType.GATE:
            return data.gates.some(g => g.id === nodeId) || data.nodes.some(n => n.id === nodeId);
        case LineType.GROUP:
            return data.groups.some(g => g.id === nodeId);
        default:
            return false;
    }
}

function processStyles(stylesStr: string): { color?: string, style?: string, active?: boolean, _via?: string, label?: string, start?: boolean, accept?: boolean } {
    let viaStr: string | undefined;
    const viaIdx = stylesStr.indexOf("via ");
    if (viaIdx !== -1) {
        viaStr = stylesStr.slice(viaIdx + 4).trim();
        stylesStr = stylesStr.slice(0, viaIdx);
    }

    // 1. Smart Split: Separate by commas, but IGNORE commas inside quotes
    const styles: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < stylesStr.length; i++) {
        const char = stylesStr[i];
        if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
            current += char;
        } else if (char === ',' && !inQuotes) {
            styles.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    if (current) styles.push(current.trim());

    // 2. Parse the safely separated attributes
    const result: { color?: string, style?: string, active?: boolean, _via?: string, label?: string, start?: boolean, accept?: boolean } = {};
    
    for (const style of styles.filter(Boolean)) {
        const eqIdx = style.indexOf("=");
        const key = eqIdx !== -1 ? style.slice(0, eqIdx).trim() : style.trim();
        const val = eqIdx !== -1 ? style.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "") : "";

        if (key === "color") result.color = val;
        else if (key === "style") result.style = val;
        else if (key === "active") result.active = val.toLowerCase() === "true";
        else if (key === "label") result.label = val;
        else if (key === "start") result.start = true;
        else if (key === "accept") result.accept = true;
    }
    
    if (viaStr) result._via = viaStr;
    return result;
}

function addNode(id: string, data: ParserInner, groupFlag: string | null): funcOutput {
    const node: ParserNode = { id, label: id, shape: "circle" };

    if (!isInData(node.id, LineType.NODE, data)) {
        data.nodes.push(node);
    }

    if (groupFlag) {
        const group = data.groups.find(g => g.id === groupFlag);
        if (group) {
            if (!group.nodes.some(n => n.id === node.id)) group.nodes.push(node);
        }
        else {
            processGroupLine(`group ${groupFlag}:`, data, null);
            const newGroup = data.groups.find(g => g.id === groupFlag);
            if (newGroup) newGroup.nodes.push(node);
            return { data, type: LineType.GROUP, vars: { groupFlag } };
        }
    }
    return { data, type: LineType.NODE, vars: {} };
}

// FIX: Handle standalone node declarations (e.g. `q0` or `q0 [label="hi"]`)
function processNodeAttrLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput {
    const bracketStart = line.indexOf("[");
    let id = line;
    let styles: any = {};

    if (bracketStart !== -1) {
        id = line.slice(0, bracketStart).trim();
        const bracketEnd = line.lastIndexOf("]");
        if (bracketEnd !== -1) {
            const attrStr = line.slice(bracketStart + 1, bracketEnd);
            styles = processStyles(attrStr);
        }
    } else {
        id = line.trim();
    }

    if (!id) return { data, type: LineType.UNKNOWN, vars: {} };

    if (!isInData(id, LineType.NODE, data)) addNode(id, data, groupFlag);

    const node = data.nodes.find(n => n.id === id);
    if (node) {
        if (styles.label !== undefined) node.label = styles.label;
        if (styles.color !== undefined) node.color = styles.color;
        if (styles.start) node.isStart = true;
        if (styles.accept) node.isAccepting = true;
    }

    const gate = data.gates.find(g => g.id === id);
    if (gate) {
        if (styles.label !== undefined) gate.label = styles.label;
        if (styles.color !== undefined) gate.color = styles.color;
    }

    return { data, type: LineType.NODE_ATTR, vars: {} };
}

function processAutomatonLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput {
    const parts = line.split("->").map(p => p.trim());
    if (parts.length !== 2) return { data, type: LineType.UNKNOWN, vars: {} };

    const right = parts[1].trim();
    let targetId = right;
    let label: string | undefined;
    let styles: any = {};

    if (right.includes(":")) {
        const colonIndex = right.indexOf(":");
        targetId = right.slice(0, colonIndex).trim();
        const rest = right.slice(colonIndex + 1).trim();

        if (rest.includes("[")) {
            const styleStart = rest.indexOf("[");
            label = rest.slice(0, styleStart).trim();
            styles = processStyles(rest.slice(styleStart + 1, rest.lastIndexOf("]")));
        } else {
            label = rest;
        }
    }

    const sourceId = parts[0].trim();
    const sourceResult = addNode(sourceId, data, groupFlag);
    const targetResult = addNode(targetId, data, groupFlag);

    let waypoints: { x: number; y: number; type: "bezier" | "linear" }[] | undefined;
    const viaStr = styles._via;
    if (viaStr) {
        waypoints = viaStr.split(";").map((s: string) => s.trim()).filter(Boolean).map((pt: string) => {
            const isLinear = pt.endsWith("l");
            const clean = pt.replace(/[bl]$/, "");
            const [x, y] = clean.split(",").map(Number);
            return { x, y, type: isLinear ? "linear" as const : "bezier" as const };
        });
    }

    data.edges.push({
        id: `edge-${crypto.randomUUID()}`,
        from: sourceId,
        to: targetId,
        label,
        color: styles.color,
        style: styles.style,
        waypoints
    });

    return { data, type: LineType.AUTOMATON, vars: { groupFlag: groupFlag ?? sourceResult.vars.groupFlag ?? targetResult.vars.groupFlag } };
}

function processGateLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) return { data, type: LineType.UNKNOWN, vars: {} };

    const gateId = line.slice(0, eqIdx).trim();
    let rightSide = line.slice(eqIdx + 1).trim();

    const hasStyling = rightSide.includes(" [");
    let color = undefined, active = false, gateLabel: string | undefined;
    
    if (hasStyling) {
        const styleStart = rightSide.indexOf(" [");
        const styles = processStyles(rightSide.slice(styleStart + 2, rightSide.lastIndexOf("]")).trim());
        color = styles.color;
        active = styles.active ?? false;
        gateLabel = styles.label;
        rightSide = rightSide.slice(0, styleStart).trim();
    }

    const match = rightSide.match(/^(\w+)\s*\((.*)\)/);
    let type: GateType;
    let inputs: string[] = [];

    if (match) {
        type = match[1].toUpperCase() as GateType;
        inputs = match[2].split(",").map(s => s.trim()).filter(Boolean);
    } else {
        type = rightSide.trim().toUpperCase() as GateType;
    }

    const gate: ParserGate = { id: gateId, type, color, active, label: gateLabel };

    if (!isInData(gate.id, LineType.GATE, data)) data.gates.push(gate);

    if (groupFlag) {
        const group = data.groups.find(g => g.id === groupFlag);
        if (group) {
            if (!group.gates.some(g => g.id === gate.id)) group.gates.push(gate);
        } else {
            processGroupLine(`group ${groupFlag}:`, data, null);
            data.groups.find(g => g.id === groupFlag)?.gates.push(gate);
            return { data, type: LineType.GROUP, vars: { groupFlag } };
        }
    }

    for (const input of inputs) {
        data.wires.push({
            id: `wire-${crypto.randomUUID()}`,
            from: input,
            to: gateId,
            active: false
        });
    }

    return { data, type: LineType.GATE, vars: {} };
}

function processSettingsLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput {
    const parts = line.split(":");
    if (parts.length < 2) return { data, type: LineType.UNKNOWN, vars: {} };

    const type = parts[0].trim().toLowerCase();
    const settingsPart = parts[1].trim();

    if (type === "row") {
        data.layout.rows.push(settingsPart.split(",").map(s => s.trim()).filter(Boolean));
        return { data, type: LineType.SETTINGS, vars: {} };
    }
    else if (type === "col" || type === "column") {
        data.layout.columns.push(settingsPart.split(",").map(s => s.trim()).filter(Boolean));
        return { data, type: LineType.SETTINGS, vars: {} };
    }

    if (type === "start" || type === "accept") {
        for (const nodeId of settingsPart.split(",").map(s => s.trim())) {
            let node = data.nodes.find(n => n.id === nodeId);
            if (!node) {
                addNode(nodeId, data, groupFlag);
                node = data.nodes.find(n => n.id === nodeId);
            }
            if (node) {
                if (type === "start") node.isStart = true;
                if (type === "accept") node.isAccepting = true;
            }
        }
    }
    return { data, type: LineType.SETTINGS, vars: {} };
}

function processLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput {
    let type = LineType.UNKNOWN;

    if (line.startsWith("group ")) {
        type = LineType.GROUP;
    } else {
        let inBracket = 0;
        for (const char of line) {
            if (char === "[") { inBracket++; continue; }
            if (char === "]") { inBracket--; continue; }
            if (inBracket > 0) continue; 
            if (char === "=") { type = LineType.GATE; break; }
        }

        if (type === LineType.UNKNOWN) {
            if (/^(start|accept|row|col)\s*:/.test(line)) type = LineType.SETTINGS;
            else if (line.includes("->")) type = LineType.AUTOMATON;
            // FIX: Allow standalone IDs to act as node declarations
            else if (/^[a-zA-Z0-9_.-]+(\s*\[.*\])?$/.test(line)) type = LineType.NODE_ATTR;
        }
    }

    switch (type) {
        case LineType.GATE: return processGateLine(line, data, groupFlag);
        case LineType.AUTOMATON: return processAutomatonLine(line, data, groupFlag);
        case LineType.GROUP: return processGroupLine(line, data, groupFlag);
        case LineType.SETTINGS: return processSettingsLine(line, data, groupFlag);
        case LineType.NODE_ATTR: return processNodeAttrLine(line, data, groupFlag);
    }
    return { data, type: LineType.UNKNOWN, vars: { line: line } };
}

export function getParsedDsl(dsl: string): ParserInner {
    const lines = dsl.split("\n");
    const data: ParserInner = {
        nodes: [], edges: [], gates: [], wires: [], groups: [],
        layout: {
            columns: [],
            rows: []
        }
    };
    let groupFlag: string | null = null;

    for (const rawLine of lines) {
        // 1. A completely blank line automatically closes the current group
        if (rawLine.trim().length === 0) {
            groupFlag = null; 
            continue;
        }

        const isIndented = rawLine.startsWith(" ") || rawLine.startsWith("\t");
        const line = rawLine.trim();

        // 2. If a line is NOT indented (and isn't the start of a new group), close the group
        if (!isIndented && !line.startsWith("group ")) {
            groupFlag = null; 
        }

        const { type, vars } = processLine(line, data, groupFlag);

        if (type === LineType.UNKNOWN) {
            console.warn(`Unrecognized line in DSL: "${line}"`);
            continue;
        }

        if (vars.groupFlag) groupFlag = vars.groupFlag;
    }

    return data;
}

function computeDFALayout(parsed: ParserInner): Map<string, Position> {
    const positions = new Map<string, Position>();

    const X_SPACING = 180;
    const Y_SPACING = 120;
    const START_X = 120;
    const START_Y = 200;

    // =========================
    // 1. Build graph
    // =========================
    const adj = new Map<string, string[]>();
    const reverseAdj = new Map<string, string[]>();

    const nodes = parsed.nodes.map(n => n.id);

    for (const id of nodes) {
        adj.set(id, []);
        reverseAdj.set(id, []);
    }

    for (const e of parsed.edges) {
        adj.get(e.from)!.push(e.to);
        reverseAdj.get(e.to)!.push(e.from);
    }

    // =========================
    // 2. Find start node
    // =========================
    let start = parsed.nodes.find(n => n.isStart)?.id;

    if (!start) start = nodes[0];

    // =========================
    // 3. BFS layering
    // =========================
    const level = new Map<string, number>();
    const queue: string[] = [];

    level.set(start!, 0);
    queue.push(start!);

    while (queue.length) {
        const curr = queue.shift()!;
        const l = level.get(curr)!;

        for (const next of adj.get(curr) ?? []) {
            if (next === curr) continue; // skip self-loops
            if (!level.has(next)) {
                level.set(next, l + 1);
                queue.push(next);
            }
        }
    }

    // Unreachable nodes → put at last layer
    const maxLevel = Math.max(...level.values());

    for (const n of nodes) {
        if (!level.has(n)) {
            level.set(n, maxLevel + 1);
        }
    }

    // =========================
    // 4. Group by layers
    // =========================
    const layers = new Map<number, string[]>();

    for (const [id, l] of level.entries()) {
        if (!layers.has(l)) layers.set(l, []);
        layers.get(l)!.push(id);
    }

    // =========================
    // 5. Order nodes to reduce crossings
    // =========================
    for (let l = 1; l <= Math.max(...layers.keys()); l++) {
        const layer = layers.get(l);
        if (!layer) continue;

        layer.sort((a, b) => {
            const aParents = reverseAdj.get(a)!;
            const bParents = reverseAdj.get(b)!;

            const avgA = avg(aParents.map(p => level.get(p)!));
            const avgB = avg(bParents.map(p => level.get(p)!));

            return avgA - avgB;
        });
    }

    function avg(arr: number[]) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    // =========================
    // 6. Assign positions
    // =========================
    for (const [l, layer] of layers.entries()) {
        const offsetY = -((layer.length - 1) * Y_SPACING) / 2;

        layer.forEach((id, i) => {
            positions.set(id, {
                x: START_X + l * X_SPACING,
                y: START_Y + offsetY + i * Y_SPACING
            });
        });
    }

    // =========================
    // 7. Align accepting states (optional polish)
    // =========================
    const accepting = parsed.nodes.filter(n => n.isAccepting).map(n => n.id);

    if (accepting.length > 1) {
        const avgY =
            accepting.reduce((sum, id) => sum + positions.get(id)!.y, 0) /
            accepting.length;

        for (const id of accepting) {
            positions.get(id)!.y = avgY;
        }
    }

    return positions;
}

function computeCircuitLayout(parsed: ParserInner): Map<string, Position> {
    const positions = new Map<string, Position>();

    const X_SPACING = 180;
    const Y_SPACING = 100;
    const START_X = 120;
    const START_Y = 200;

    const allGates = parsed.gates.map(g => g.id);

    // =========================
    // 1. Build graph (dependencies)
    // =========================
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const id of allGates) {
        adj.set(id, []);
        inDegree.set(id, 0);
    }

    for (const w of parsed.wires) {
        if (!adj.has(w.from)) adj.set(w.from, []);
        adj.get(w.from)!.push(w.to);

        inDegree.set(w.to, (inDegree.get(w.to) ?? 0) + 1);
    }

    // =========================
    // 2. Find input gates
    // =========================
    const inputGates = parsed.gates
        .filter(g => g.type === "INPUT")
        .map(g => g.id);

    // fallback: zero in-degree
    const startNodes = inputGates.length > 0
        ? inputGates
        : allGates.filter(id => (inDegree.get(id) ?? 0) === 0);

    // =========================
    // 3. Topological layering
    // =========================
    const level = new Map<string, number>();
    const queue: string[] = [];

    for (const s of startNodes) {
        level.set(s, 0);
        queue.push(s);
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        const currLevel = level.get(curr)!;

        for (const next of adj.get(curr) ?? []) {
            if (next === curr) continue; // skip self-loops
            if (!level.has(next)) {       // only visit each node once
                level.set(next, currLevel + 1);
                queue.push(next);
            }
        }
    }

    // Unassigned → push right
    const maxLevel = Math.max(...level.values(), 0);

    for (const id of allGates) {
        if (!level.has(id)) {
            level.set(id, maxLevel + 1);
        }
    }

    // =========================
    // 4. Group by level
    // =========================
    const layers = new Map<number, string[]>();

    for (const [id, l] of level.entries()) {
        if (!layers.has(l)) layers.set(l, []);
        layers.get(l)!.push(id);
    }

    // =========================
    // 5. Sort inside layers (reduce crossings)
    // =========================
    for (const [, ids] of layers.entries()) {
        ids.sort((a, b) => {
            const aInputs = parsed.wires.filter(w => w.to === a).map(w => w.from);
            const bInputs = parsed.wires.filter(w => w.to === b).map(w => w.from);

            const avgA = avg(aInputs.map(i => level.get(i) ?? 0));
            const avgB = avg(bInputs.map(i => level.get(i) ?? 0));

            return avgA - avgB;
        });
    }

    function avg(arr: number[]) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    // =========================
    // 6. Assign positions
    // =========================
    for (const [l, ids] of layers.entries()) {
        const offsetY = -((ids.length - 1) * Y_SPACING) / 2;

        ids.forEach((id, i) => {
            positions.set(id, {
                x: START_X + l * X_SPACING,
                y: START_Y + offsetY + i * Y_SPACING
            });
        });
    }

    // =========================
    // 7. Align outputs (rightmost)
    // =========================
    const outputGates = parsed.gates
        .filter(g => g.type === "OUTPUT")
        .map(g => g.id);

    if (outputGates.length > 0) {
        const maxX = Math.max(...[...positions.values()].map(p => p.x));

        for (const id of outputGates) {
            const pos = positions.get(id);
            if (pos) pos.x = maxX + X_SPACING;
        }
    }

    return positions;
}

function computeAutoLayout(parsed: ParserInner): Map<string, Position> {
    const positions = new Map<string, Position>();

    const X_SPACING = 160;
    const Y_SPACING = 110;
    const START_X = 120;
    const START_Y = 200;

    // =========================
    // 1. Collect all IDs
    // =========================
    const allIds = new Set<string>([
        ...parsed.nodes.map(n => n.id),
        ...parsed.gates.map(g => g.id)
    ]);

    // =========================
    // 2. Build adjacency
    // =========================
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const id of allIds) {
        adj.set(id, []);
        inDegree.set(id, 0);
    }

    // edges (automaton)
    for (const e of parsed.edges) {
        adj.get(e.from)?.push(e.to);
        inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    }

    // wires (circuit)
    for (const w of parsed.wires) {
        adj.get(w.from)?.push(w.to);
        inDegree.set(w.to, (inDegree.get(w.to) ?? 0) + 1);
    }

    // =========================
    // 3. Find start points
    // =========================
    let startNodes = [...allIds].filter(id => (inDegree.get(id) ?? 0) === 0);

    if (startNodes.length === 0) {
        startNodes = [...allIds].slice(0, 1); // fallback
    }

    // =========================
    // 4. BFS layering
    // =========================
    const level = new Map<string, number>();
    const queue: string[] = [];

    for (const s of startNodes) {
        level.set(s, 0);
        queue.push(s);
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        const currLevel = level.get(curr)!;

        for (const next of adj.get(curr) ?? []) {
            if (next === curr) continue; // skip self-loops
            if (!level.has(next)) {       // only visit each node once
                level.set(next, currLevel + 1);
                queue.push(next);
            }
        }
    }

    // Unreached nodes → push right
    const maxLevel = Math.max(...level.values(), 0);

    for (const id of allIds) {
        if (!level.has(id)) {
            level.set(id, maxLevel + 1);
        }
    }

    // =========================
    // 5. Group by level
    // =========================
    const layers = new Map<number, string[]>();

    for (const [id, l] of level.entries()) {
        if (!layers.has(l)) layers.set(l, []);
        layers.get(l)!.push(id);
    }

    // =========================
    // 6. Sort within layers (reduce crossings)
    // =========================
    for (const [, ids] of layers.entries()) {
        ids.sort((a, b) => {
            const aOut = adj.get(a)?.length ?? 0;
            const bOut = adj.get(b)?.length ?? 0;
            return bOut - aOut;
        });
    }

    // =========================
    // 7. Assign positions
    // =========================
    for (const [l, ids] of layers.entries()) {
        const offsetY = -((ids.length - 1) * Y_SPACING) / 2;

        ids.forEach((id, i) => {
            positions.set(id, {
                x: START_X + l * X_SPACING,
                y: START_Y + offsetY + i * Y_SPACING
            });
        });
    }

    // =========================
    // 8. Simple overlap repel
    // =========================
    const MIN_DIST = 70;

    const ids = [...positions.keys()];

    for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = positions.get(ids[i])!;
                const b = positions.get(ids[j])!;

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < MIN_DIST && dist > 0.01) {
                    const push = (MIN_DIST - dist) / 2;
                    const angle = Math.atan2(dy, dx);

                    const px = Math.cos(angle) * push;
                    const py = Math.sin(angle) * push;

                    b.x += px;
                    b.y += py;
                    a.x -= px;
                    a.y -= py;
                }
            }
        }
    }

    return positions;
}

export default function parseDSL(dsl: string, opts: { straightWires?: boolean } = {}): ParserOutput {
    const parsed = getParsedDsl(dsl);
    const positions = new Map<string, Position>();

    // =========================
    // 1. LAYOUT: ROWS
    // =========================
    parsed.layout?.rows?.forEach((row, rowIndex) => {
        row.forEach((id, colIndex) => {
            if (!positions.has(id)) {
                positions.set(id, {
                    x: START_X + colIndex * NODE_SPACING_X,
                    y: START_Y + rowIndex * NODE_SPACING_Y
                });
            }
        });
    });

    // =========================
    // 2. LAYOUT: COLUMNS
    // =========================
    parsed.layout?.columns?.forEach((col, colIndex) => {
        col.forEach((id, rowIndex) => {
            if (!positions.has(id)) {
                positions.set(id, {
                    x: START_X + colIndex * NODE_SPACING_X,
                    y: START_Y + rowIndex * NODE_SPACING_Y
                });
            }
        });
    });

    // =========================
    // 3. FALLBACK AUTO-LAYOUT
    // =========================
    let currentPos: Map<string, Position>;
    const hasGraph = parsed.nodes.length > 0;
    const hasCircuit = parsed.gates.length > 0;

    if (hasGraph && !hasCircuit) {
        currentPos = computeDFALayout(parsed);
    }
    else if (!hasGraph && hasCircuit) {
        currentPos = computeCircuitLayout(parsed);
    }
    else {
        // mixed → fallback
        currentPos = computeAutoLayout(parsed);
    }

    for (const [id, pos] of currentPos.entries()) {
        if (!positions.has(id)) {
            positions.set(id, pos);
        }
    }

    // =========================
    // 4. NODES
    // =========================
    const nodes: GraphNode[] = parsed.nodes.map(n => {
        const label = n.label ?? n.id;
        return {
            id: n.id,
            position: positions.get(n.id)!,
            label,
            isAccepting: n.isAccepting,
            isStart: n.isStart,
            color: n.color,
            radius: 25
        } as any;
    });

    // =========================
    // 5. EDGES
    // =========================
    const edges: GraphEdge[] = parsed.edges.map(e => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: e.label,
        color: e.color,
        type: "arrow",
        isBendable: false,
        waypoints: (e as any).waypoints?.map((wp: any, i: number) => ({
            id: `wp-${e.id}-${i}`,
            x: wp.x,
            y: wp.y,
            type: wp.type
        }))
    }));

    // Auto-route: bend parallel/bidirectional edges that share the same node pair
    const edgePairGroups = new Map<string, typeof edges>();
    for (const edge of edges) {
        if (edge.waypoints?.length) continue; // user-placed, leave alone
        const key = [edge.source, edge.target].sort().join("\u2194");
        if (!edgePairGroups.has(key)) edgePairGroups.set(key, []);
        edgePairGroups.get(key)!.push(edge);
    }
    for (const group of edgePairGroups.values()) {
        if (group.length < 2) continue;
        const srcNode = nodes.find(n => n.id === group[0].source);
        const tgtNode = nodes.find(n => n.id === group[0].target);
        if (!srcNode || !tgtNode) continue;
        const mx = (srcNode.position.x + tgtNode.position.x) / 2;
        const my = (srcNode.position.y + tgtNode.position.y) / 2;
        const dx = tgtNode.position.x - srcNode.position.x;
        const dy = tgtNode.position.y - srcNode.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len; const ny = dx / len;
        const OFFSET = 45;
        group.forEach((edge, i) => {
            const slot = i - (group.length - 1) / 2;
            edge.waypoints = [{
                id: `auto-wp-${edge.id}`,
                x: mx + nx * OFFSET * slot,
                y: my + ny * OFFSET * slot,
                type: "bezier"
            }];
        });
    }

    // =========================
    // 6. GATES
    // =========================
    const gates: CircuitGate[] = parsed.gates.map(g => ({
        id: g.id,
        type: g.type,
        position: positions.get(g.id)!,
        label: g.label,
        value: g.active
    }));

    // =========================
    // 7. WIRES (basic port mapping)
    // =========================
    const inputPortUsage = new Map<string, number>();

    const wires: CircuitWire[] = parsed.wires.map(w => {
        const inputIndex = inputPortUsage.get(w.to) ?? 0;
        inputPortUsage.set(w.to, inputIndex + 1);

        return {
            id: w.id,
            fromGate: w.from,
            fromPort: "out",
            toGate: w.to,
            toPort: `in${inputIndex}`,
            isBendable: false
        };
    });

    // Auto-route fan-out wires from the same gate so they dont overlap
    const wiresByFrom = new Map<string, typeof wires>();
    for (const wire of wires) {
        if (!wiresByFrom.has(wire.fromGate)) wiresByFrom.set(wire.fromGate, []);
        wiresByFrom.get(wire.fromGate)!.push(wire);
    }
    for (const group of wiresByFrom.values()) {
        group.forEach((wire, i) => {
            const fromGate = gates.find(g => g.id === wire.fromGate);
            const toGate = gates.find(g => g.id === wire.toGate);
            if (!fromGate || !toGate) return;

            // FIX: Only apply the Bezier fan-out if straightWires is OFF
            if (!opts.straightWires && group.length >= 2) {
                const mx = (fromGate.position.x + toGate.position.x) / 2;
                const my = (fromGate.position.y + toGate.position.y) / 2;
                const dx = toGate.position.x - fromGate.position.x;
                const dy = toGate.position.y - fromGate.position.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const nx = -dy / len; const ny = dx / len;
                const slot = i - (group.length - 1) / 2;
                const WIRE_OFFSET = 20;
                wire.waypoints = [{
                    id: `auto-wp-${wire.id}`,
                    x: mx + nx * WIRE_OFFSET * slot,
                    y: my + ny * WIRE_OFFSET * slot,
                    type: "bezier" as const
                }];
            }
        });
    }

    // =========================
    // 8. GROUP BOUNDING BOX
    // =========================
    function computeGroupBox(ids: string[]) {
        const pts = ids
            .map(id => positions.get(id))
            .filter(Boolean) as Position[];

        if (pts.length === 0) {
            return { x: 0, y: 0, w: 100, h: 100 };
        }

        const minX = Math.min(...pts.map(p => p.x));
        const minY = Math.min(...pts.map(p => p.y));
        const maxX = Math.max(...pts.map(p => p.x));
        const maxY = Math.max(...pts.map(p => p.y));

        return {
            x: minX - 60,
            y: minY - 60,
            w: (maxX - minX) + 120,
            h: (maxY - minY) + 120
        };
    }

    // =========================
    // 9. GROUPS (recursive)
    // =========================
    function convertGroup(g: ParserGroup): GraphGroup[] {
        const ids = [
            ...g.nodes.map(n => n.id),
            ...g.gates.map(g => g.id)
        ];

        const box = computeGroupBox(ids);

        const current: GraphGroup = {
            id: g.id,
            label: g.name,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
        };

        return [
            current,
            ...g.groups.flatMap(convertGroup)
        ];
    }

    const groups: GraphGroup[] = parsed.groups.flatMap(convertGroup);

    // =========================
    // FINAL OUTPUT
    // =========================
    return {
        nodes,
        edges,
        gates,
        wires,
        groups,
        layout: parsed.layout
    } as any;
}

export function serializeToDSL(output: ParserOutput): string {
    const lines: string[] = [];

    const startNodes = output.nodes?.filter(n => n.isStart).map(n => n.id) ?? [];
    const acceptNodes = output.nodes?.filter(n => n.isAccepting).map(n => n.id) ?? [];
    if (startNodes.length) lines.push(`start: ${startNodes.join(", ")}`);
    if (acceptNodes.length) lines.push(`accept: ${acceptNodes.join(", ")}`);

    for (const row of (output as any).layout?.rows ?? []) lines.push(`row: ${row.join(", ")}`);
    for (const col of (output as any).layout?.columns ?? []) lines.push(`col: ${col.join(", ")}`);

    // 1. Assign items geometrically to their frames
    const groupContains = (grp: GraphGroup, p: Position) => 
        p.x >= grp.x && p.x <= grp.x + grp.w && p.y >= grp.y && p.y <= grp.y + grp.h;

    const elementToGroup = new Map<string, string>();
    const sortedGroups = [...(output.groups ?? [])].sort((a, b) => (a.w * a.h) - (b.w * b.h));

    for (const n of output.nodes ?? []) {
        const parent = sortedGroups.find(g => groupContains(g, n.position));
        if (parent) elementToGroup.set(n.id, parent.id);
    }
    for (const g of output.gates ?? []) {
        const parent = sortedGroups.find(grp => groupContains(grp, g.position));
        if (parent) elementToGroup.set(g.id, parent.id);
    }

    const printedNodes = new Set<string>();
    const printedGates = new Set<string>();

    const wiresByTarget = new Map<string, any[]>();
    for (const w of output.wires ?? []) {
        if (!wiresByTarget.has(w.toGate)) wiresByTarget.set(w.toGate, []);
        wiresByTarget.get(w.toGate)!.push(w);
    }

    const formatNode = (n: GraphNode) => {
        const attrs: string[] = [];
        if (n.label && n.label !== n.id) attrs.push(`label="${n.label}"`);
        if (n.color) attrs.push(`color="${n.color}"`);
        return attrs.length > 0 ? `${n.id} [${attrs.join(", ")}]` : `${n.id}`;
    };

    const formatGate = (g: CircuitGate) => {
        const inWires = wiresByTarget.get(g.id) ?? [];
        const inputs = inWires.map(w => w.fromGate);
        const attrs: string[] = [];
        if (g.label) attrs.push(`label="${g.label}"`);
        if (g.color) attrs.push(`color="${g.color}"`);
        if (g.type === "INPUT" && ((g as any).value ?? (g as any).active)) attrs.push(`active=true`);
        
        const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";
        if (g.type === "INPUT") return `${g.id} = INPUT${attrStr}`;
        if (inputs.length > 0) return `${g.id} = ${g.type}(${inputs.join(", ")})${attrStr}`;
        return `${g.id} = ${g.type}${attrStr}`;
    };

    // 2. Output frames and their nested contents
    for (const grp of output.groups ?? []) {
        const groupName = grp.label || grp.id;
        lines.push(`group ${groupName}:`);
        
        for (const n of output.nodes ?? []) {
            if (elementToGroup.get(n.id) === grp.id) {
                lines.push(`  ${formatNode(n)}`);
                printedNodes.add(n.id);
            }
        }
        for (const g of output.gates ?? []) {
            if (elementToGroup.get(g.id) === grp.id) {
                lines.push(`  ${formatGate(g)}`);
                printedGates.add(g.id);
            }
        }
        
        // ADD THIS: Inserts a blank line after the group to officially "close" it in text!
        lines.push(""); 
    }

    // 3. Output remaining Top-Level elements
    for (const n of output.nodes ?? []) {
        if (!printedNodes.has(n.id)) {
            // Only print top-level nodes if they have specific attributes
            const attrs: string[] = [];
            if (n.label && n.label !== n.id) attrs.push(`label="${n.label}"`);
            if (n.color) attrs.push(`color="${n.color}"`);
            if (attrs.length > 0) lines.push(formatNode(n));
            printedNodes.add(n.id);
        }
    }

    for (const g of output.gates ?? []) {
        if (!printedGates.has(g.id)) {
            lines.push(formatGate(g));
            printedGates.add(g.id);
        }
    }

    // 4. Output Edges
    for (const e of output.edges ?? []) {
        let line = `${e.source} -> ${e.target}`;
        const hasLabel = !!e.label;
        const hasWaypoints = !!e.waypoints?.length;
        if (hasLabel || hasWaypoints) {
            line += ` : ${e.label ?? ""}`;
            if (hasWaypoints) {
                const viaStr = e.waypoints!
                    .map(wp => `${Math.round(wp.x)},${Math.round(wp.y)}${wp.type === "linear" ? "l" : "b"}`)
                    .join("; ");
                line += ` [via ${viaStr}]`;
            }
        }
        lines.push(line);
    }

    return lines.join("\n");
}