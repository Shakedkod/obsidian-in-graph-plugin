import { CircuitGate, CircuitWire } from "./circuits";
import { GraphEdge, GraphGroup, GraphNode } from "./graph";

export interface ParserOutput 
{
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    gates?: CircuitGate[];
    wires?: CircuitWire[];
    groups?: GraphGroup[];
}

export interface Group
{
    id: string;
    name: string;
    nodes: GraphNode[];
    gates: CircuitGate[];
    groups: Group[];
}

export interface ParserInner
{
    nodes: GraphNode[];
    edges: GraphEdge[];
    gates: CircuitGate[];
    wires: CircuitWire[];
    groups: Group[];
    layout: {
        columns: string[][];
        rows: string[][];
    }
}