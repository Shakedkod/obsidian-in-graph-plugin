export interface GraphTheme
{
    background?: string;
    nodeFill?: string;
    nodeStroke?: string;
    text?: string;
    edgeStroke?: string;
    startArrow?: string;
    acceptCircle?: string;
}

export const DEFAULT_THEME: GraphTheme = {
    background: "var(--background-primary)",
    nodeFill: "var(--background-secondary)",
    nodeStroke: "var(--text-normal)",
    text: "var(--text-normal)",
    edgeStroke: "var(--text-muted)"
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
            acceptCircle: "#7ec8e3"
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
            acceptCircle: "#8b4513"
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
            acceptCircle: "#ff00ff"
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
            acceptCircle: "#7ecfff"
        }
    }
];