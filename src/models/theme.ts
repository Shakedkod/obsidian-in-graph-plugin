export interface GraphTheme
{
    background?: string;
    text?: string;
    nodeFill?: string;

    // Automaton-specific:
    nodeStroke?: string;
    edgeStroke?: string;
    startArrow?: string;
    acceptCircle?: string;

    // Circuit-specific:
    gateStroke?: string;
    gateFill?: string;
    wireActive?: string;
    groupFill?: string;
    groupStroke?: string;
}

export const DEFAULT_THEME: GraphTheme = {
    background:  "var(--background-primary)",
    nodeFill:    "var(--background-secondary)",
    nodeStroke:  "var(--text-normal)",
    text:        "var(--text-normal)",
    edgeStroke:  "var(--text-muted)",
    gateStroke:  "var(--text-normal)",
    gateFill:    "var(--background-secondary)",
    wireActive:  "#f59e0b",
    groupFill:   "rgba(120,120,180,0.06)",
    groupStroke: "var(--text-muted)",
};

export interface AutomatonThemePreset
{
    name: string;
    theme: GraphTheme;
}

export const THEME_PRESETS: AutomatonThemePreset[] = [
    {
        name: "Obsidian (default)",
        theme: {}  // Empty = use CSS vars
    },
    {
        name: "Chalk",
        theme: {
            background: "#1a1a2e",
            nodeFill: "#16213e",
            nodeStroke: "#e2e2e2",
            text: "#e2e2e2",
            edgeStroke: "#a0a0b0",
            startArrow: "#e2e2e2",
            acceptCircle: "#7ec8e3",
            gateFill: "#16213e",
            gateStroke: "#e2e2e2",
            wireActive: "#7ec8e3",
            groupFill: "rgba(120,120,180,0.06)",
            groupStroke: "#a0a0b0"
        }
    },
    {
        name: "Parchment",
        theme: {
            background: "#f5f0e8",
            nodeFill: "#ede8df",
            nodeStroke: "#5c4a2a",
            text: "#3d2b1f",
            edgeStroke: "#8b7355",
            startArrow: "#5c4a2a",
            acceptCircle: "#8b4513",
            gateFill: "#ede8df",
            gateStroke: "#5c4a2a",
            wireActive: "#8b4513",
            groupFill: "rgba(200,150,100,0.06)",
            groupStroke: "#8b7355"
        }
    },
    {
        name: "Neon",
        theme: {
            background: "#0d0d0d",
            nodeFill: "#111111",
            nodeStroke: "#00ff99",
            text: "#00ff99",
            edgeStroke: "#00cc77",
            startArrow: "#00ff99",
            acceptCircle: "#ff00ff",
            gateFill: "#111111",
            gateStroke: "#00ff99",
            wireActive: "#ff00ff",
            groupFill: "rgba(255,0,255,0.06)",
            groupStroke: "#ff00ff"
        }
    },
    {
        name: "Blueprint",
        theme: {
            background: "#0a2647",
            nodeFill: "#0d3060",
            nodeStroke: "#5ba4cf",
            text: "#c9e8ff",
            edgeStroke: "#4a8db7",
            startArrow: "#5ba4cf",
            acceptCircle: "#7ecfff",
            gateFill: "#0d3060",
            gateStroke: "#5ba4cf",
            wireActive: "#7ecfff",
            groupFill: "rgba(120,160,200,0.06)",
            groupStroke: "#5ba4cf"
        }
    }
];