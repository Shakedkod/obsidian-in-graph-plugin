import { Position } from "src/models/graph";

export function snapPosition(
    pos: Position,
    others: Position[],
    threshold = 10
): { pos: Position, guides: { x?: number, y?: number } } {

    let snapX = pos.x;
    let snapY = pos.y;

    let guideX: number | undefined;
    let guideY: number | undefined;

    for (const other of others) {
        // snap X alignment
        if (Math.abs(pos.x - other.x) < threshold) {
            snapX = other.x;
            guideX = other.x;
        }

        // snap Y alignment
        if (Math.abs(pos.y - other.y) < threshold) {
            snapY = other.y;
            guideY = other.y;
        }
    }

    // grid snap (optional but recommended)
    const GRID = 20;
    snapX = Math.round(snapX / GRID) * GRID;
    snapY = Math.round(snapY / GRID) * GRID;

    return {
        pos: { x: snapX, y: snapY },
        guides: { x: guideX, y: guideY }
    };
}