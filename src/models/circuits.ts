import { Position } from "./graph";

export type GateType = "AND" | "OR" | "NOT" | "NAND" | "NOR" | "XOR" | "XNOR" | "INPUT" | "OUTPUT";

export interface CircuitGate
{
    id: string;
    type: GateType;
    position: Position;
    label?: string;
    value?: boolean;
}

export interface CircuitWireWaypoint
{
    id: string;
    x: number;
    y: number;
    type: "linear" | "bezier";
}

export interface CircuitWire
{
    id: string;
    fromGate: string;
    fromPort: string;
    toGate: string;
    toPort: string;
    waypoints?: CircuitWireWaypoint[];
    isBendable?: boolean;
}

export const GATE_INPUT_COUNT: Record<GateType, number> = {
    AND: 2, OR: 2, NOT: 1, NAND: 2, NOR: 2, XOR: 2, XNOR: 2,
    INPUT: 0, OUTPUT: 1
};

export const GATE_SIZE = { w: 54, h: 40 };