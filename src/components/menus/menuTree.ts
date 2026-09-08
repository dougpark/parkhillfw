export type MenuKind = 'menu' | 'page' | 'link';

export interface MenuRow {
    id: number;
    parentId: number | null;
    kind: MenuKind;
    slug: string | null;
    title: string;
    description: string | null;
    iconName: string | null;
    pageId: number | null;
    targetUrl: string | null;
    displayOrder: number;
    isPublic: boolean;
    isDraft: boolean;
    updatedAt: string | null;
    pageTitle: string | null;
    pageSlug: string | null;
    pageIsDraft: boolean | null;
    pageIsPublic: boolean | null;
}

export interface FlatNode {
    row: MenuRow;
    depth: number;
}

export interface ReorderItem {
    id: number;
    parentId: number | null;
    displayOrder: number;
}

export const MAX_MENU_DEPTH = 3;

/** Viewer-facing navigation node returned by /api/nav. */
export interface NavNode {
    id: number;
    kind: string;
    slug: string | null;
    title: string;
    description: string | null;
    iconName: string | null;
    pageSlug: string | null;
    targetUrl: string | null;
    isPublic: boolean;
    isDraft: boolean;
    children: NavNode[];
}

/** Depth-first order matching how the tree is presented. Depth is 1-based. */
export function flattenMenus(rows: MenuRow[], collapsed: Set<number> = new Set()): FlatNode[] {
    const byParent = new Map<number | null, MenuRow[]>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }
    for (const bucket of byParent.values()) {
        bucket.sort((left, right) => (left.displayOrder - right.displayOrder) || (left.id - right.id));
    }

    const result: FlatNode[] = [];
    const walk = (parentId: number | null, depth: number) => {
        for (const row of byParent.get(parentId) ?? []) {
            result.push({ row, depth });
            if (!collapsed.has(row.id)) walk(row.id, depth + 1);
        }
    };
    walk(null, 1);
    return result;
}

export function descendantIds(rows: MenuRow[], id: number): number[] {
    const byParent = new Map<number | null, MenuRow[]>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }
    const result: number[] = [];
    const queue = [...(byParent.get(id) ?? [])];
    while (queue.length) {
        const current = queue.shift()!;
        result.push(current.id);
        queue.push(...(byParent.get(current.id) ?? []));
    }
    return result;
}

/** 1 for a leaf; used to keep a dragged subtree inside the depth limit. */
export function subtreeHeight(rows: MenuRow[], id: number): number {
    const children = rows.filter((row) => row.parentId === id);
    if (!children.length) return 1;
    return 1 + Math.max(...children.map((child) => subtreeHeight(rows, child.id)));
}

/**
 * Moves one node under a new parent at a sibling index and renumbers every
 * sibling group, producing the payload the reorder endpoint expects.
 */
export function moveNode(rows: MenuRow[], id: number, parentId: number | null, siblingIndex: number): MenuRow[] {
    const next = rows.map((row) => ({ ...row }));
    const moving = next.find((row) => row.id === id);
    if (!moving) return next;
    moving.parentId = parentId;

    const siblings = next
        .filter((row) => row.parentId === parentId && row.id !== id)
        .sort((left, right) => (left.displayOrder - right.displayOrder) || (left.id - right.id));
    siblings.splice(Math.max(0, Math.min(siblingIndex, siblings.length)), 0, moving);
    siblings.forEach((row, index) => { row.displayOrder = index; });

    const groups = new Map<number | null, MenuRow[]>();
    for (const row of next) {
        const bucket = groups.get(row.parentId) ?? [];
        bucket.push(row);
        groups.set(row.parentId, bucket);
    }
    for (const bucket of groups.values()) {
        bucket.sort((left, right) => (left.displayOrder - right.displayOrder) || (left.id - right.id));
        bucket.forEach((row, index) => { row.displayOrder = index; });
    }
    return next;
}

export function toReorderItems(rows: MenuRow[]): ReorderItem[] {
    return flattenMenus(rows).map(({ row }) => ({
        id: row.id,
        parentId: row.parentId,
        displayOrder: row.displayOrder,
    }));
}

/**
 * Given a drop slot in the visible list and a pointer indent, works out the
 * legal depth and the resulting parent + sibling index.
 */
export function projectDrop(
    visible: FlatNode[],
    insertIndex: number,
    requestedDepth: number,
    draggedHeight: number,
): { depth: number; parentId: number | null; siblingIndex: number } {
    const previous = visible[insertIndex - 1];
    const next = visible[insertIndex];

    const maxByPrevious = previous ? (previous.row.kind === 'menu' ? previous.depth + 1 : previous.depth) : 1;
    const maxDepth = Math.min(maxByPrevious, MAX_MENU_DEPTH - draggedHeight + 1);
    const minDepth = Math.min(next ? next.depth : 1, Math.max(1, maxDepth));
    const depth = Math.max(minDepth, Math.min(requestedDepth, Math.max(minDepth, maxDepth)));

    let parentId: number | null = null;
    if (depth > 1) {
        for (let index = insertIndex - 1; index >= 0; index -= 1) {
            const candidate = visible[index]!;
            if (candidate.depth === depth - 1) {
                parentId = candidate.row.id;
                break;
            }
        }
    }

    let siblingIndex = 0;
    for (let index = 0; index < insertIndex; index += 1) {
        if (visible[index]!.row.parentId === parentId) siblingIndex += 1;
    }

    return { depth, parentId, siblingIndex };
}
