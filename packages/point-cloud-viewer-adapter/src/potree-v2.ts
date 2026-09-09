import type { PointCloudChunkInput } from "@ifc-lite/renderer";

export type Vec3Tuple = [number, number, number];
export type BoundsTuple = { min: Vec3Tuple; max: Vec3Tuple };

export type PotreeAttribute = {
  name: string;
  type: string;
  size: number;
  numElements: number;
  elementSize: number;
  byteOffset: number;
};

export type PotreeMetadata = {
  version: "2.0";
  encoding: "DEFAULT";
  points: number;
  spacing: number;
  scale: Vec3Tuple;
  offset: Vec3Tuple;
  boundingBox: BoundsTuple;
  hierarchy: {
    firstChunkSize: number;
    stepSize: number;
    depth: number;
  };
  attributes: PotreeAttribute[];
  bytesPerPoint: number;
};

export type PotreeNode = {
  name: string;
  level: number;
  spacing: number;
  bounds: BoundsTuple;
  nodeType: 0 | 1 | 2;
  numPoints: number;
  byteOffset: bigint;
  byteSize: bigint;
  hierarchyByteOffset: bigint;
  hierarchyByteSize: bigint;
  children: Array<PotreeNode | undefined>;
};

const supportedAttributeTypes = new Set([
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float",
  "double",
]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Potree ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Potree ${label} is invalid`);
  }
  return value;
}

function integer(value: unknown, label: string, positive = false) {
  const parsed = finiteNumber(value, label);
  if (!Number.isSafeInteger(parsed) || (positive ? parsed <= 0 : parsed < 0)) {
    throw new Error(`Potree ${label} is invalid`);
  }
  return parsed;
}

function vec3(value: unknown, label: string): Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Potree ${label} must contain three numbers`);
  }
  return value.map((part, index) =>
    finiteNumber(part, `${label}[${index}]`),
  ) as Vec3Tuple;
}

export function parsePotreeV2Metadata(value: unknown): PotreeMetadata {
  const source = object(value, "metadata");
  if (source.version !== "2.0" || source.encoding !== "DEFAULT") {
    throw new Error("Only uncompressed Potree 2.0 octrees are supported");
  }
  const hierarchy = object(source.hierarchy, "hierarchy");
  const boundingBox = object(source.boundingBox, "boundingBox");
  if (!Array.isArray(source.attributes) || source.attributes.length === 0) {
    throw new Error("Potree metadata has no attributes");
  }

  let byteOffset = 0;
  const attributes = source.attributes.map((raw, index): PotreeAttribute => {
    const attribute = object(raw, `attribute ${index}`);
    const name = attribute.name;
    const type = attribute.type;
    if (typeof name !== "string" || !name || typeof type !== "string") {
      throw new Error(`Potree attribute ${index} has no name or type`);
    }
    if (!supportedAttributeTypes.has(type)) {
      throw new Error(`Unsupported Potree attribute type: ${type}`);
    }
    const size = integer(attribute.size, `${name} size`, true);
    const numElements = integer(
      attribute.numElements,
      `${name} element count`,
      true,
    );
    const elementSize = integer(
      attribute.elementSize,
      `${name} element size`,
      true,
    );
    if (size !== numElements * elementSize) {
      throw new Error(`Potree attribute ${name} has inconsistent dimensions`);
    }
    const parsed = {
      name,
      type,
      size,
      numElements,
      elementSize,
      byteOffset,
    };
    byteOffset += size;
    return parsed;
  });
  const position = attributes.find((attribute) =>
    ["position", "POSITION_CARTESIAN"].includes(attribute.name),
  );
  if (
    !position ||
    position.type !== "int32" ||
    position.numElements !== 3 ||
    position.size !== 12
  ) {
    throw new Error("Potree position must be an int32 triplet");
  }

  const min = vec3(boundingBox.min, "boundingBox.min");
  const max = vec3(boundingBox.max, "boundingBox.max");
  if (max.some((part, index) => part < min[index])) {
    throw new Error("Potree bounding box is inverted");
  }

  const scale = vec3(source.scale, "scale");
  if (scale.some((part) => part <= 0)) {
    throw new Error("Potree scale values must be positive");
  }
  const spacing = finiteNumber(source.spacing, "spacing");
  if (spacing <= 0) throw new Error("Potree spacing must be positive");

  return {
    version: "2.0",
    encoding: "DEFAULT",
    points: integer(source.points, "point count"),
    spacing,
    scale,
    offset: vec3(source.offset, "offset"),
    boundingBox: { min, max },
    hierarchy: {
      firstChunkSize: integer(
        hierarchy.firstChunkSize,
        "first hierarchy chunk size",
        true,
      ),
      stepSize: integer(hierarchy.stepSize, "hierarchy step size", true),
      depth: integer(hierarchy.depth, "hierarchy depth"),
    },
    attributes,
    bytesPerPoint: byteOffset,
  };
}

export function createPotreeRoot(metadata: PotreeMetadata): PotreeNode {
  return {
    name: "r",
    level: 0,
    spacing: metadata.spacing,
    bounds: {
      min: [0, 0, 0],
      max: metadata.boundingBox.max.map(
        (part, index) => part - metadata.boundingBox.min[index],
      ) as Vec3Tuple,
    },
    nodeType: 2,
    numPoints: 0,
    byteOffset: BigInt(0),
    byteSize: BigInt(0),
    hierarchyByteOffset: BigInt(0),
    hierarchyByteSize: BigInt(metadata.hierarchy.firstChunkSize),
    children: [],
  };
}

function childBounds(parent: BoundsTuple, index: number): BoundsTuple {
  const midpoint = parent.min.map(
    (part, axis) => (part + parent.max[axis]) / 2,
  ) as Vec3Tuple;
  const min: Vec3Tuple = [...parent.min];
  const max: Vec3Tuple = [...parent.max];

  // Potree child bits are z, y, x from least to most significant.
  for (let axis = 0; axis < 3; axis += 1) {
    const bit = 1 << (2 - axis);
    if (index & bit) min[axis] = midpoint[axis];
    else max[axis] = midpoint[axis];
  }
  return { min, max };
}

export function parsePotreeHierarchyPage(
  root: PotreeNode,
  buffer: ArrayBuffer,
) {
  const bytesPerNode = 22;
  if (buffer.byteLength === 0 || buffer.byteLength % bytesPerNode !== 0) {
    throw new Error("Potree hierarchy page has an invalid byte length");
  }
  const view = new DataView(buffer);
  const nodes: Array<PotreeNode | undefined> = [root];
  let nextNode = 1;

  for (let index = 0; index < buffer.byteLength / bytesPerNode; index += 1) {
    const current = nodes[index];
    if (!current) throw new Error("Potree hierarchy traversal is incomplete");
    const offset = index * bytesPerNode;
    const nodeType = view.getUint8(offset) as 0 | 1 | 2;
    if (nodeType > 2) throw new Error(`Unknown Potree node type ${nodeType}`);
    const childMask = view.getUint8(offset + 1);
    const numPoints = view.getUint32(offset + 2, true);
    const byteOffset = view.getBigUint64(offset + 6, true);
    const byteSize = view.getBigUint64(offset + 14, true);

    current.nodeType = nodeType;
    current.numPoints = byteSize === BigInt(0) ? 0 : numPoints;
    if (nodeType === 2) {
      current.hierarchyByteOffset = byteOffset;
      current.hierarchyByteSize = byteSize;
      continue;
    }
    current.byteOffset = byteOffset;
    current.byteSize = byteSize;

    for (let childIndex = 0; childIndex < 8; childIndex += 1) {
      if ((childMask & (1 << childIndex)) === 0) continue;
      const child: PotreeNode = {
        name: `${current.name}${childIndex}`,
        level: current.level + 1,
        spacing: current.spacing / 2,
        bounds: childBounds(current.bounds, childIndex),
        nodeType: 2,
        numPoints: 0,
        byteOffset: BigInt(0),
        byteSize: BigInt(0),
        hierarchyByteOffset: BigInt(0),
        hierarchyByteSize: BigInt(0),
        children: [],
      };
      current.children[childIndex] = child;
      nodes[nextNode] = child;
      nextNode += 1;
    }
  }
  if (
    nextNode !== buffer.byteLength / bytesPerNode ||
    nodes.some((node) => !node)
  ) {
    throw new Error("Potree hierarchy page contains dangling children");
  }
}

function numericGetter(view: DataView, type: string, offset: number) {
  switch (type) {
    case "int8":
      return view.getInt8(offset);
    case "uint8":
      return view.getUint8(offset);
    case "int16":
      return view.getInt16(offset, true);
    case "uint16":
      return view.getUint16(offset, true);
    case "int32":
      return view.getInt32(offset, true);
    case "uint32":
      return view.getUint32(offset, true);
    case "int64":
      return Number(view.getBigInt64(offset, true));
    case "uint64":
      return Number(view.getBigUint64(offset, true));
    case "float":
      return view.getFloat32(offset, true);
    case "double":
      return view.getFloat64(offset, true);
    default:
      throw new Error(`Unsupported Potree numeric type: ${type}`);
  }
}

function normalizedColor(value: number, elementSize: number) {
  const byte = elementSize === 1 ? value : value > 255 ? value / 256 : value;
  return Math.min(1, Math.max(0, byte / 255));
}

export function decodePotreeNode(
  buffer: ArrayBuffer,
  metadata: PotreeMetadata,
  node: Pick<PotreeNode, "numPoints" | "bounds">,
): PointCloudChunkInput {
  const expectedBytes = node.numPoints * metadata.bytesPerPoint;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Potree node size mismatch: expected ${expectedBytes}, received ${buffer.byteLength}`,
    );
  }
  const positionAttribute = metadata.attributes.find((attribute) =>
    ["position", "POSITION_CARTESIAN"].includes(attribute.name),
  );
  if (!positionAttribute)
    throw new Error("Potree position attribute is missing");
  const colorAttribute = metadata.attributes.find((attribute) =>
    ["rgb", "rgba"].includes(attribute.name.toLowerCase()),
  );
  const classificationAttribute = metadata.attributes.find(
    (attribute) => attribute.name.toLowerCase() === "classification",
  );
  const intensityAttribute = metadata.attributes.find(
    (attribute) => attribute.name.toLowerCase() === "intensity",
  );
  const positions = new Float32Array(node.numPoints * 3);
  const colors = colorAttribute
    ? new Float32Array(node.numPoints * 3)
    : undefined;
  const classifications = classificationAttribute
    ? new Uint8Array(node.numPoints)
    : undefined;
  const intensities = intensityAttribute
    ? new Uint16Array(node.numPoints)
    : undefined;
  const view = new DataView(buffer);
  const bbox: BoundsTuple = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };

  for (let index = 0; index < node.numPoints; index += 1) {
    const pointOffset = index * metadata.bytesPerPoint;
    for (let axis = 0; axis < 3; axis += 1) {
      const coordinate =
        view.getInt32(
          pointOffset + positionAttribute.byteOffset + axis * 4,
          true,
        ) *
          metadata.scale[axis] +
        metadata.offset[axis] -
        metadata.boundingBox.min[axis];
      positions[index * 3 + axis] = coordinate;
      bbox.min[axis] = Math.min(bbox.min[axis], coordinate);
      bbox.max[axis] = Math.max(bbox.max[axis], coordinate);
    }
    if (colors && colorAttribute) {
      for (let channel = 0; channel < 3; channel += 1) {
        colors[index * 3 + channel] = normalizedColor(
          numericGetter(
            view,
            colorAttribute.type,
            pointOffset +
              colorAttribute.byteOffset +
              channel * colorAttribute.elementSize,
          ),
          colorAttribute.elementSize,
        );
      }
    }
    if (classifications && classificationAttribute) {
      classifications[index] = Math.min(
        255,
        Math.max(
          0,
          numericGetter(
            view,
            classificationAttribute.type,
            pointOffset + classificationAttribute.byteOffset,
          ),
        ),
      );
    }
    if (intensities && intensityAttribute) {
      intensities[index] = Math.min(
        65_535,
        Math.max(
          0,
          numericGetter(
            view,
            intensityAttribute.type,
            pointOffset + intensityAttribute.byteOffset,
          ),
        ),
      );
    }
  }

  return {
    positions,
    colors,
    classifications,
    intensities,
    pointCount: node.numPoints,
    bbox: node.numPoints ? bbox : node.bounds,
  };
}
