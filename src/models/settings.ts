import { GraphTheme } from "./theme";

export interface InGraphPluginSettings {
    activeTheme: string;
    customTheme: GraphTheme;
    dslMode: "bottom" | "sidebar";
    clickBgOpensDsl: boolean;
    maxHistory: number;
    defaultHeight: number;
    straightWires?: boolean;
    customSnippetsEnabled: boolean;
    snippetsPath: string;
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
    },
    dslMode: "bottom",
    clickBgOpensDsl: true,
    straightWires: true,
    maxHistory: 50,
    defaultHeight: 300,
    customSnippetsEnabled: false,
    snippetsPath: "",
};