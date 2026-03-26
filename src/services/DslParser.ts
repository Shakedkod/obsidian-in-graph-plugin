import { Group, ParserInner, ParserOutput } from "src/models/parser";

enum LineType {
    GATE, AUTOMATON, GROUP, SETTINGS, UNKNOWN
}

type funcOutput = { data: ParserInner, type: LineType, vars: Record<string, any> };

function processGroupLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput
{
    const startIndex = "group ".length;
    const endIndex = line.indexOf(":");
    if (endIndex === -1) {
        console.warn(`Malformed group line (missing ":"): "${line}"`);
        return { data, type: LineType.UNKNOWN, vars: {} };
    }

    const groupName = line.substring(startIndex, endIndex).trim();
    if (!groupName) {
        console.warn(`Malformed group line (empty name): "${line}"`);
        return { data, type: LineType.UNKNOWN, vars: {} };
    }

    const group: Group = {
        id: `group-${Date.now()}`,
        name: groupName,
        nodes: [],
        gates: [],
        groups: []
    };

    data.groups.push(group);
    return { data, type: LineType.GROUP, vars: { groupFlag: group.id } };
}

function processLine(line: string, data: ParserInner, groupFlag: string | null): funcOutput {
    let index = 0;
    let type = LineType.UNKNOWN;

    if (line.startsWith("group ")) {
        type = LineType.GROUP;
    }
    else {
        for (const char of line) {
            switch (char) {
                case "=":
                    type = LineType.GATE;
                    break;
                case "-":
                    type = LineType.AUTOMATON;
                    break;
                case ":":
                    type = LineType.SETTINGS;
                    break;
            }
            index++;
        }
    }

    switch (type) {
        case LineType.GATE:
            return processGateLine(line, data, groupFlag);
        case LineType.AUTOMATON:
            return processAutomatonLine(line, data, groupFlag);
        case LineType.GROUP:
            return processGroupLine(line, data, groupFlag);
        case LineType.SETTINGS:
            return processSettingsLine(line, data, groupFlag);
    }

    return { data, type: LineType.UNKNOWN, vars: { line: line } };
}

export function getParsedDsl(dsl: string): ParserInner {
    const lines = dsl.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const data: ParserInner = {
        nodes: [], edges: [], gates: [], wires: [], groups: [],
        layout: {
            columns: [],
            rows: []
        }
    };
    let groupFlag: string | null = null;

    for (const line of lines) {
        const { data: updatedData, type, vars } = processLine(line, data, groupFlag);

        if (type === LineType.UNKNOWN)
        {
            console.warn(`Unrecognized line in DSL: "${line}"`);
            continue;
        }

        Object.assign(data, updatedData);
        if (vars.groupFlag) groupFlag = vars.groupFlag;
    }

    return data;
}

export default function parseDSL(dsl: string): ParserOutput
{
    const parsed = getParsedDsl(dsl);

    //TODO: convert ParserInner to ParserOutput by stripping internal fields and validating references
    //TODO: auto layout

    return {};
}