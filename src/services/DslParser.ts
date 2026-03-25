import { ParserOutput } from "src/models/parser";

export default function getParsedDsl(dsl: string): ParserOutput
{
    const lines = dsl.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    for (const line of lines)
    {
        if (line.contains(" = "))
        {
            const [gateID, gateFunction] = line.split(" = ").map(s => s.trim());

            
        }
        else if (line.contains(" -> "))
        {
            const [source, target] = line.split(" -> ").map(s => s.trim());


        }
    }

    return {};
}