import { GraphTheme } from "src/models/theme";

export interface AutomatonPluginSettings {
    activeTheme: string;
    customTheme: GraphTheme;
}

const DEFAULT_SETTINGS: AutomatonPluginSettings = {
    activeTheme: "Obsidian (default)",
    customTheme: {
        background: "",
        nodeFill: "",
        nodeStroke: "",
        text: "",
        edgeStroke: "",
        startArrow: "",
        acceptCircle: "",
    }
};