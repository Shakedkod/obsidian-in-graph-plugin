import { CircuitGate, CircuitWire, GATE_INPUT_COUNT, GATE_SIZE, GateType } from "../models/circuits";

// Port positions in local gate coords
export function getPortPositions(type: GateType): Record<string, { x: number; y: number }>
{
    const { w, h } = GATE_SIZE;
    const hw = w / 2;
    const hh = h / 2;
    const inCount = GATE_INPUT_COUNT[type];

    const ports: Record<string, { x: number; y: number }> = {};

    if (inCount === 1)
    {
        ports["in0"] = { x: -hw, y: 0 };
    } else if (inCount === 2)
    {
        ports["in0"] = { x: -hw, y: -hh * 0.5 };
        ports["in1"] = { x: -hw, y: hh * 0.5 };
    }

    if (type !== "INPUT")
    {
        ports["out"] = { x: hw, y: 0 };
    } else
    {
        // INPUT is just a source — output on right
        ports["out"] = { x: hw, y: 0 };
    }

    return ports;
}

// ─── SIGNAL PROPAGATION ─────────────────────────────────────────────────────

export class CircuitSimulator
{
    private gateStates: Map<string, boolean> = new Map();
    private portValues: Map<string, boolean> = new Map(); // "gateId:portName" → value

    constructor(
        private gates: CircuitGate[],
        private wires: CircuitWire[]
    )
    {
        for (const g of gates)
        {
            if (g.type === "INPUT" && g.value !== undefined)
            {
                this.gateStates.set(g.id, g.value);
            }
        }
    }

    // Call this when gates/wires change
    rebuild(gates: CircuitGate[], wires: CircuitWire[])
    {
        this.gates = gates;
        this.wires = wires;

        for (const g of gates)
        {
            if (g.type === "INPUT" && g.value !== undefined)
            {
                this.gateStates.set(g.id, g.value);
            }
        }
    }

    // Toggle an INPUT gate and re-propagate
    toggleInput(gateId: string): void
    {
        const current = this.gateStates.get(gateId) ?? false;
        const next = !current;
        this.gateStates.set(gateId, next);

        const gate = this.gates.find(g => g.id === gateId);
        if (gate) gate.value = next;
        this.propagate();
    }

    setInput(gateId: string, value: boolean): void
    {
        this.gateStates.set(gateId, value);
    }

    propagate(): void
    {
        this.portValues.clear();

        // Topological sort to evaluate in dependency order
        const order = this.topologicalSort();

        for (const gateId of order)
        {
            const gate = this.gates.find(g => g.id === gateId);
            if (!gate) continue;

            if (gate.type === "INPUT")
            {
                const val = this.gateStates.get(gateId) ?? false;
                this.portValues.set(`${gateId}:out`, val);
                continue;
            }

            // Gather input values from connected wires
            const in0Wire = this.wires.find(w => w.toGate === gateId && w.toPort === "in0");
            const in1Wire = this.wires.find(w => w.toGate === gateId && w.toPort === "in1");

            const in0 = in0Wire ? (this.portValues.get(`${in0Wire.fromGate}:out`) ?? false) : false;
            const in1 = in1Wire ? (this.portValues.get(`${in1Wire.fromGate}:out`) ?? false) : false;

            const result = this.evaluate(gate.type, in0, in1);
            this.portValues.set(`${gateId}:out`, result);
            this.gateStates.set(gateId, result);
        }
    }

    evaluate(type: GateType, a: boolean, b: boolean): boolean
    {
        switch (type)
        {
            case "AND":
                return a && b;
            case "OR":
                return a || b;
            case "NOT":
                return !a;
            case "NAND":
                return !(a && b);
            case "NOR":
                return !(a || b);
            case "XOR":
                return a !== b;
            case "XNOR":
                return a === b;
            case "OUTPUT":
                return a;
            default:
                return false;
        }
    }

    getGateValue(gateId: string): boolean
    {
        return this.gateStates.get(gateId) ?? false;
    }

    getWireValue(wire: CircuitWire): boolean
    {
        return this.portValues.get(`${wire.fromGate}:out`) ?? false;
    }

    getPortValue(gateId: string, port: string): boolean
    {
        return this.portValues.get(`${gateId}:${port}`) ?? false;
    }

    // Kahn's algorithm topological sort
    private topologicalSort(): string[]
    {
        const inDegree = new Map<string, number>();
        const adjList = new Map<string, string[]>();

        for (const g of this.gates)
        {
            inDegree.set(g.id, 0);
            adjList.set(g.id, []);
        }

        for (const w of this.wires)
        {
            adjList.get(w.fromGate)?.push(w.toGate);
            inDegree.set(w.toGate, (inDegree.get(w.toGate) ?? 0) + 1);
        }

        const queue: string[] = [];
        for (const [id, deg] of inDegree)
        {
            if (deg === 0) queue.push(id);
        }

        const result: string[] = [];
        while (queue.length > 0)
        {
            const node = queue.shift() as string;
            result.push(node);
            for (const neighbor of (adjList.get(node) ?? []))
            {
                const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
                inDegree.set(neighbor, newDeg);
                if (newDeg === 0) queue.push(neighbor);
            }
        }

        // If not all gates processed (cycle), append remaining
        for (const g of this.gates)
        {
            if (!result.includes(g.id)) result.push(g.id);
        }

        return result;
    }

    // ─── TRUTH TABLE ──────────────────────────────────────────────────────────

    generateTruthTable(): { headers: string[]; rows: (0 | 1)[][] } | null
    {
        const inputs = this.gates.filter(g => g.type === "INPUT");
        const outputs = this.gates.filter(g => g.type === "OUTPUT");

        if (inputs.length === 0 || outputs.length === 0) return null;
        if (inputs.length > 8) return null; // 256 rows max

        const n = inputs.length;
        const rowCount = 1 << n;
        const rows: (0 | 1)[][] = [];

        const savedStates = new Map(this.gateStates);

        for (let mask = 0; mask < rowCount; mask++)
        {
            // Set input values for this combination
            for (let i = 0; i < n; i++)
            {
                const val = Boolean((mask >> (n - 1 - i)) & 1);
                this.setInput(inputs[i].id, val);
            }
            this.propagate();

            const row: (0 | 1)[] = [
                ...inputs.map(g => (this.getGateValue(g.id) ? 1 : 0) as 0 | 1),
                ...outputs.map(g => (this.getGateValue(g.id) ? 1 : 0) as 0 | 1)
            ];
            rows.push(row);
        }

        // Restore previous state
        this.gateStates = savedStates;
        this.propagate();

        const headers = [
            ...inputs.map(g => g.label || g.id),
            ...outputs.map(g => g.label || g.id)
        ];

        return { headers, rows };
    }
}