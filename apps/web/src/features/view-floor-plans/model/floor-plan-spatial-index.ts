export type PlanBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
type Entry<T> = PlanBounds & { item: T };
type Node<T> = PlanBounds & {
  entries?: Entry<T>[];
  left?: Node<T>;
  right?: Node<T>;
};

/** Shared bounding-volume tree for visible paths and nearby snap segments. */
export class PlanSpatialIndex<T> {
  private readonly root: Node<T> | null;

  constructor(items: T[], bounds: (item: T) => PlanBounds) {
    const build = (entries: Entry<T>[]): Node<T> => {
      const node: Node<T> = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
      for (const entry of entries) {
        node.minX = Math.min(node.minX, entry.minX);
        node.minY = Math.min(node.minY, entry.minY);
        node.maxX = Math.max(node.maxX, entry.maxX);
        node.maxY = Math.max(node.maxY, entry.maxY);
      }
      if (entries.length <= 12) node.entries = entries;
      else {
        const horizontal = node.maxX - node.minX > node.maxY - node.minY;
        entries.sort((a, b) =>
          horizontal
            ? a.minX + a.maxX - b.minX - b.maxX
            : a.minY + a.maxY - b.minY - b.maxY,
        );
        const middle = Math.floor(entries.length / 2);
        node.left = build(entries.slice(0, middle));
        node.right = build(entries.slice(middle));
      }
      return node;
    };
    const entries = items
      .map((item) => ({ ...bounds(item), item }))
      .filter((entry) =>
        [entry.minX, entry.minY, entry.maxX, entry.maxY].every(Number.isFinite),
      );
    this.root = entries.length ? build(entries) : null;
  }

  forEach(bounds: PlanBounds, visit: (item: T) => void) {
    const intersects = (other: PlanBounds) =>
      bounds.minX <= other.maxX &&
      bounds.maxX >= other.minX &&
      bounds.minY <= other.maxY &&
      bounds.maxY >= other.minY;
    const search = (node: Node<T>) => {
      if (!intersects(node)) return;
      for (const entry of node.entries ?? [])
        if (intersects(entry)) visit(entry.item);
      if (node.left) search(node.left);
      if (node.right) search(node.right);
    };
    if (this.root) search(this.root);
  }
}
