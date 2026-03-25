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