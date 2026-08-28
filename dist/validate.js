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
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function addDuplicateIssues(values, path, issues) {
    const seen = new Set();
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
function scanFiniteNumbers(value, path, issues, skipRaw = false) {
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
    if (!isRecord(value))
        return;
    for (const [key, child] of Object.entries(value)) {
        if (skipRaw && key === "raw")
            continue;
        scanFiniteNumbers(child, `${path}.${key}`, issues, skipRaw);
    }
}
function validateEntity(candidate, path, layerIds, blockIds, handles, issues) {
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
    }
    else if (handles.has(handle)) {
        issues.push({ path: `${path}.handle`, code: "DUPLICATE_ID", message: `Duplicate handle: ${handle}` });
    }
    else {
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
export function validateKDrawDocumentV1(candidate) {
    const issues = [];
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
    if (!Array.isArray(candidate.layers)) {
        issues.push({ path: "$.layers", code: "INVALID_VALUE", message: "Layers must be an array." });
    }
    if (!Array.isArray(candidate.blocks)) {
        issues.push({ path: "$.blocks", code: "INVALID_VALUE", message: "Blocks must be an array." });
    }
    if (!Array.isArray(candidate.entities)) {
        issues.push({ path: "$.entities", code: "INVALID_VALUE", message: "Entities must be an array." });
    }
    const layerIds = addDuplicateIssues(layers.flatMap((layer) => (isRecord(layer) && typeof layer.id === "string" ? [layer.id] : [])), "$.layers", issues);
    const blockIds = addDuplicateIssues(blocks.flatMap((block) => (isRecord(block) && typeof block.id === "string" ? [block.id] : [])), "$.blocks", issues);
    if (typeof candidate.currentLayerId !== "string" || !layerIds.has(candidate.currentLayerId)) {
        issues.push({
            path: "$.currentLayerId",
            code: "MISSING_REFERENCE",
            message: `Unknown current layer: ${String(candidate.currentLayerId)}`,
        });
    }
    const handles = new Set();
    entities.forEach((entity, index) => validateEntity(entity, `$.entities[${index}]`, layerIds, blockIds, handles, issues));
    blocks.forEach((block, blockIndex) => {
        if (!isRecord(block) || !Array.isArray(block.entities))
            return;
        block.entities.forEach((entity, entityIndex) => validateEntity(entity, `$.blocks[${blockIndex}].entities[${entityIndex}]`, layerIds, blockIds, handles, issues));
    });
    scanFiniteNumbers(candidate.units, "$.units", issues);
    scanFiniteNumbers(candidate.layouts, "$.layouts", issues);
    scanFiniteNumbers(candidate.linetypes, "$.linetypes", issues);
    scanFiniteNumbers(candidate.dimensionStyles, "$.dimensionStyles", issues);
    return { valid: issues.length === 0, issues };
}
export function assertKDrawDocumentV1(candidate) {
    const result = validateKDrawDocumentV1(candidate);
    if (!result.valid) {
        const message = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
        throw new TypeError(`Invalid KDrawDocumentV1:\n${message}`);
    }
}
