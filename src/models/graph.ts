export interface Position
{
    x: number;
    y: number;
}

export interface GraphNode
{
    id: string;
    position: Position;
    label: string;
    isAccepting?: boolean;
    isStart?: boolean;
    color?: string;
}

export interface GraphWaypoint
{
    id: string;
    x: number;
    y: number;
    type: "linear" | "bezier";
}

export interface GraphEdge
{
    id: string;
    source: string;
    target: string;
    label?: string;
    waypoints?: GraphWaypoint[];
    isBendable?: boolean;
    color?: string;
    type?: "arrow" | "none";
}

export interface GraphViewport
{
    height: number;
    viewBox: { x: number, y: number, w: number, h: number };
}

export interface GraphGroup
{
    id: string;
    label?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color?: string;
}