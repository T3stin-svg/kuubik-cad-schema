import type { CadEntity, KDrawDocumentV1 } from "./types.js";

export interface ValidationIssue {
  path: string;
  code:
    | "INVALID_ROOT"
    | "INVALID_SCHEMA_VERSION"
    | "INVALID_NUMBER"
    | "INVALID_ENTITY_KIND"
    | "DUPLICATE_ID"
    | "MISSING_REFERENCE"
    | "INVALID_VALUE";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const ENTITY_KINDS = new Set([
  "line",
  "polyline",
  "circle",
  "arc",
  "ellipse",
  "spline",
  "text",
  "mtext",
  "leader",
  "dimension",
  "hatch",
  "blockRef",
  "proxy",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addDuplicateIssues(
  values: readonly string[],
  path: string,
  issues: ValidationIssue[],
): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      issues.push({
        path,
        code: "DUPLICATE_ID",
        message: `Duplicate identifier: ${value}`,
      });
    }
    seen.add(value);
  }
  return seen;
}

function scanFiniteNumbers(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  skipRaw = false,
): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issues.push({ path, code: "INVALID_NUMBER", message: "Number must be finite." });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanFiniteNumbers(item, `${path}[${index}]`, issues, skipRaw));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (skipRaw && key === "raw") continue;
    scanFiniteNumbers(child, `${path}.${key}`, issues, skipRaw);
  }
}

function validateEntity(
  candidate: unknown,
  path: string,
  layerIds: ReadonlySet<string>,
  blockIds: ReadonlySet<string>,
  handles: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!isRecord(candidate)) {
    issues.push({ path, code: "INVALID_VALUE", message: "Entity must be an object." });
    return;
  }

  const kind = candidate.kind;
  if (typeof kind !== "string" || !ENTITY_KINDS.has(kind)) {
    issues.push({
      path: `${path}.kind`,
      code: "INVALID_ENTITY_KIND",
      message: "Unsupported entities must be preserved with kind=proxy.",
    });
    return;
  }

  const handle = candidate.handle;
  if (typeof handle !== "string" || handle.length === 0) {
    issues.push({ path: `${path}.handle`, code: "INVALID_VALUE", message: "Handle is required." });
  } else if (handles.has(handle)) {
    issues.push({ path: `${path}.handle`, code: "DUPLICATE_ID", message: `Duplicate handle: ${handle}` });
  } else {
    handles.add(handle);
  }

  const layerId = candidate.layerId;
  if (typeof layerId !== "string" || !layerIds.has(layerId)) {
    issues.push({
      path: `${path}.layerId`,
      code: "MISSING_REFERENCE",
      message: `Unknown layer: ${String(layerId)}`,
    });
  }

  if (kind === "blockRef") {
    const blockId = candidate.blockId;
    if (typeof blockId !== "string" || !blockIds.has(blockId)) {
      issues.push({
        path: `${path}.blockId`,
        code: "MISSING_REFERENCE",
        message: `Unknown block: ${String(blockId)}`,
      });
    }
  }

  if (kind === "proxy" && typeof candidate.originalType !== "string") {
    issues.push({
      path: `${path}.originalType`,
      code: "INVALID_VALUE",
      message: "Proxy entity must identify its original type.",
    });
  }

  scanFiniteNumbers(candidate, path, issues, kind === "proxy");
}

export function validateKDrawDocumentV1(candidate: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(candidate)) {
    return {
      valid: false,
      issues: [{ path: "$", code: "INVALID_ROOT", message: "Document must be an object." }],
    };
  }
  if (candidate.schemaVersion !== 1) {
    issues.push({
      path: "$.schemaVersion",
      code: "INVALID_SCHEMA_VERSION",
      message: "Only KDraw schemaVersion 1 is supported.",
    });
  }

  const layers = Array.isArray(candidate.layers) ? candidate.layers : [];
  const blocks = Array.isArray(candidate.blocks) ? candidate.blocks : [];
  const entities = Array.isArray(candidate.entities) ? candidate.entities : [];
  const layouts = Array.isArray(candidate.layouts) ? candidate.layouts : [];
  if (!Array.isArray(candidate.layers)) {
    issues.push({ path: "$.layers", code: "INVALID_VALUE", message: "Layers must be an array." });
  }
  if (!Array.isArray(candidate.blocks)) {
    issues.push({ path: "$.blocks", code: "INVALID_VALUE", message: "Blocks must be an array." });
  }
  if (!Array.isArray(candidate.entities)) {
    issues.push({ path: "$.entities", code: "INVALID_VALUE", message: "Entities must be an array." });
  }
  if (!Array.isArray(candidate.layouts)) {
    issues.push({ path: "$.layouts", code: "INVALID_VALUE", message: "Layouts must be an array." });
  }

  const layerIds = addDuplicateIssues(
    layers.flatMap((layer) => (isRecord(layer) && typeof layer.id === "string" ? [layer.id] : [])),
    "$.layers",
    issues,
  );
  const blockIds = addDuplicateIssues(
    blocks.flatMap((block) => (isRecord(block) && typeof block.id === "string" ? [block.id] : [])),
    "$.blocks",
    issues,
  );

  if (typeof candidate.currentLayerId !== "string" || !layerIds.has(candidate.currentLayerId)) {
    issues.push({
      path: "$.currentLayerId",
      code: "MISSING_REFERENCE",
      message: `Unknown current layer: ${String(candidate.currentLayerId)}`,
    });
  }

  const handles = new Set<string>();
  entities.forEach((entity, index) =>
    validateEntity(entity, `$.entities[${index}]`, layerIds, blockIds, handles, issues),
  );
  blocks.forEach((block, blockIndex) => {
    if (!isRecord(block) || !Array.isArray(block.entities)) return;
    block.entities.forEach((entity, entityIndex) =>
      validateEntity(
        entity,
        `$.blocks[${blockIndex}].entities[${entityIndex}]`,
        layerIds,
        blockIds,
        handles,
        issues,
      ),
    );
  });

  addDuplicateIssues(
    layouts.flatMap((layout) => (isRecord(layout) && typeof layout.id === "string" ? [layout.id] : [])),
    "$.layouts",
    issues,
  );
  const layoutNames = new Set<string>();
  const viewportIds = new Set<string>();
  layouts.forEach((layout, layoutIndex) => {
    const path = `$.layouts[${layoutIndex}]`;
    if (!isRecord(layout)) {
      issues.push({ path, code: "INVALID_VALUE", message: "Layout must be an object." });
      return;
    }
    if (typeof layout.id !== "string" || layout.id.length === 0) {
      issues.push({ path: `${path}.id`, code: "INVALID_VALUE", message: "Layout id is required." });
    }
    if (typeof layout.name !== "string" || layout.name.length === 0) {
      issues.push({ path: `${path}.name`, code: "INVALID_VALUE", message: "Layout name is required." });
    } else {
      const normalizedName = layout.name.toLocaleLowerCase("en-US");
      if (layoutNames.has(normalizedName)) {
        issues.push({ path: `${path}.name`, code: "DUPLICATE_ID", message: `Duplicate layout name: ${layout.name}` });
      }
      layoutNames.add(normalizedName);
    }
    if (layout.kind !== "model" && layout.kind !== "paper") {
      issues.push({ path: `${path}.kind`, code: "INVALID_VALUE", message: "Layout kind must be model or paper." });
    }
    if (!Array.isArray(layout.viewports)) {
      issues.push({ path: `${path}.viewports`, code: "INVALID_VALUE", message: "Layout viewports must be an array." });
    } else {
      layout.viewports.forEach((viewport, viewportIndex) => {
        if (!isRecord(viewport) || typeof viewport.id !== "string" || viewport.id.length === 0) {
          issues.push({ path: `${path}.viewports[${viewportIndex}].id`, code: "INVALID_VALUE", message: "Viewport id is required." });
          return;
        }
        if (viewportIds.has(viewport.id)) {
          issues.push({ path: `${path}.viewports[${viewportIndex}].id`, code: "DUPLICATE_ID", message: `Duplicate viewport id: ${viewport.id}` });
        }
        viewportIds.add(viewport.id);
      });
    }
    if (layout.entities !== undefined && !Array.isArray(layout.entities)) {
      issues.push({ path: `${path}.entities`, code: "INVALID_VALUE", message: "Layout entities must be an array." });
    } else if (Array.isArray(layout.entities)) {
      layout.entities.forEach((entity, entityIndex) =>
        validateEntity(entity, `${path}.entities[${entityIndex}]`, layerIds, blockIds, handles, issues),
      );
    }
  });
  if (layouts.filter((layout) => isRecord(layout) && layout.kind === "model").length !== 1) {
    issues.push({ path: "$.layouts", code: "INVALID_VALUE", message: "Document must contain exactly one model layout." });
  }

  scanFiniteNumbers(candidate.units, "$.units", issues);
  scanFiniteNumbers(candidate.layouts, "$.layouts", issues);
  scanFiniteNumbers(candidate.linetypes, "$.linetypes", issues);
  scanFiniteNumbers(candidate.dimensionStyles, "$.dimensionStyles", issues);

  return { valid: issues.length === 0, issues };
}

export function assertKDrawDocumentV1(candidate: unknown): asserts candidate is KDrawDocumentV1 {
  const result = validateKDrawDocumentV1(candidate);
  if (!result.valid) {
    const message = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
    throw new TypeError(`Invalid KDrawDocumentV1:\n${message}`);
  }
}
