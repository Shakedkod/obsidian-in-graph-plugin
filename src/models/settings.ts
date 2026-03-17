import { GraphTheme } from "./theme";

export interface InGraphPluginSettings {
    activeTheme: string;
    customTheme: GraphTheme;
}

export const DEFAULT_SETTINGS: InGraphPluginSettings = {
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