import { CircuitGate, CircuitWire, GateType } from "./circuits";
import { GraphEdge, GraphGroup, GraphNode } from "./graph";

export interface ParserOutput 
{
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    gates?: CircuitGate[];
    wires?: CircuitWire[];
    groups?: GraphGroup[];
}

export interface ParserNode
{
    id: string;
    label: string;
    color?: string;
    shape: "circle" | "doublecircle" | "rectangle";
    isStart?: boolean;
    isAccepting?: boolean;
}

export interface ParserGate
{
    id: string;
    type: GateType;
    label?: string;
    color?: string;
    active: boolean;
}

export interface ParserGroup
{
    id: string;
    name: string;
    nodes: ParserNode[];
    gates: ParserGate[];
    groups: ParserGroup[];
}

export interface ParserWaypoint
{
    x: number;
    y: number; 
    type: "bezier" | "linear";
}

export interface ParserWire
{
    id: string;
    from: string;
    to: string;
    label?: string;
    style?: string;
    color?: string;
    active: boolean;
    waypoints?: ParserWaypoint[];
}

export interface ParserEdge
{
    id: string;
    from: string;
    to: string;
    label?: string;
    style?: string;
    color?: string;
    waypoints?: ParserWaypoint[];
}

export interface ParserInner
{
    nodes: ParserNode[];
    edges: ParserEdge[];
    gates: ParserGate[];
    wires: ParserWire[];
    groups: ParserGroup[];
    layout: {
        columns: string[][];
        rows: string[][];
    }
}

export const NODE_SPACING_X = 120;
export const NODE_SPACING_Y = 100;
export const START_X = 100;
export const START_Y = 100;