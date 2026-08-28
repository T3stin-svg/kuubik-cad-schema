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
function validateAppearance(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ path, code: "INVALID_VALUE", message: "Appearance must be an object." });
        return;
    }
    if (value.color !== undefined && (typeof value.color !== "string" || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu.test(value.color))) {
        issues.push({ path: `${path}.color`, code: "INVALID_VALUE", message: "Appearance color must be #RGB or #RRGGBB." });
    }
    if (value.linetypeId !== undefined && (typeof value.linetypeId !== "string" || value.linetypeId.length === 0)) {
        issues.push({ path: `${path}.linetypeId`, code: "INVALID_VALUE", message: "Appearance linetypeId must be a non-empty string." });
    }
    if (value.lineweightMm !== undefined && (typeof value.lineweightMm !== "number" || !Number.isFinite(value.lineweightMm) || value.lineweightMm < 0)) {
        issues.push({ path: `${path}.lineweightMm`, code: "INVALID_VALUE", message: "Appearance lineweightMm must be finite and non-negative." });
    }
    if (value.transparency !== undefined && (typeof value.transparency !== "number" || !Number.isFinite(value.transparency) ||
        value.transparency < 0 || value.transparency > 90)) {
        issues.push({ path: `${path}.transparency`, code: "INVALID_VALUE", message: "Appearance transparency must be a percentage from 0 to 90." });
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
    if (candidate.appearance !== undefined)
        validateAppearance(candidate.appearance, `${path}.appearance`, issues);
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
    const layerIds = addDuplicateIssues(layers.flatMap((layer) => (isRecord(layer) && typeof layer.id === "string" ? [layer.id] : [])), "$.layers", issues);
    layers.forEach((layer, index) => {
        if (isRecord(layer) && layer.appearance !== undefined)
            validateAppearance(layer.appearance, `$.layers[${index}].appearance`, issues);
    });
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
    addDuplicateIssues(layouts.flatMap((layout) => (isRecord(layout) && typeof layout.id === "string" ? [layout.id] : [])), "$.layouts", issues);
    const layoutNames = new Set();
    const viewportIds = new Set();
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
        }
        else {
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
        }
        else {
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
        if (layout.pageSetup !== undefined) {
            const setupPath = `${path}.pageSetup`;
            if (!isRecord(layout.pageSetup)) {
                issues.push({ path: setupPath, code: "INVALID_VALUE", message: "Page setup must be an object." });
            }
            else {
                const setup = layout.pageSetup;
                if (typeof setup.mediaName !== "string" || setup.mediaName.trim().length === 0) {
                    issues.push({ path: `${setupPath}.mediaName`, code: "INVALID_VALUE", message: "Page setup mediaName is required." });
                }
                if (setup.orientation !== "portrait" && setup.orientation !== "landscape") {
                    issues.push({ path: `${setupPath}.orientation`, code: "INVALID_VALUE", message: "Page setup orientation must be portrait or landscape." });
                }
                if (!isRecord(setup.plotArea) || !["layout", "extents", "display", "window"].includes(String(setup.plotArea.kind))) {
                    issues.push({ path: `${setupPath}.plotArea`, code: "INVALID_VALUE", message: "Page setup plotArea is invalid." });
                }
                else if (setup.plotArea.kind === "window") {
                    const window = setup.plotArea.window;
                    if (!isRecord(window) || typeof window.x !== "number" || typeof window.y !== "number" ||
                        typeof window.width !== "number" || typeof window.height !== "number" || window.width <= 0 || window.height <= 0) {
                        issues.push({ path: `${setupPath}.plotArea.window`, code: "INVALID_VALUE", message: "Window plot area must have positive width and height." });
                    }
                }
                if (!isRecord(setup.plotScale) || !["fit", "custom"].includes(String(setup.plotScale.mode))) {
                    issues.push({ path: `${setupPath}.plotScale`, code: "INVALID_VALUE", message: "Page setup plotScale is invalid." });
                }
                else if (setup.plotScale.mode === "custom" && (typeof setup.plotScale.paperUnits !== "number" || setup.plotScale.paperUnits <= 0 ||
                    typeof setup.plotScale.drawingUnits !== "number" || setup.plotScale.drawingUnits <= 0)) {
                    issues.push({ path: `${setupPath}.plotScale`, code: "INVALID_VALUE", message: "Custom plot scale units must be positive." });
                }
                if (typeof setup.centerPlot !== "boolean") {
                    issues.push({ path: `${setupPath}.centerPlot`, code: "INVALID_VALUE", message: "Page setup centerPlot must be boolean." });
                }
                if (!isRecord(setup.plotOriginMm) || typeof setup.plotOriginMm.x !== "number" || typeof setup.plotOriginMm.y !== "number") {
                    issues.push({ path: `${setupPath}.plotOriginMm`, code: "INVALID_VALUE", message: "Page setup plotOriginMm must be a point." });
                }
                if (setup.plotStyle !== undefined) {
                    if (!isRecord(setup.plotStyle)) {
                        issues.push({ path: `${setupPath}.plotStyle`, code: "INVALID_VALUE", message: "Page setup plotStyle must be an object." });
                    }
                    else {
                        if (!["color", "monochrome", "grayscale"].includes(String(setup.plotStyle.profile))) {
                            issues.push({ path: `${setupPath}.plotStyle.profile`, code: "INVALID_VALUE", message: "Plot profile must be color, monochrome or grayscale." });
                        }
                        if (typeof setup.plotStyle.plotLineweights !== "boolean") {
                            issues.push({ path: `${setupPath}.plotStyle.plotLineweights`, code: "INVALID_VALUE", message: "plotLineweights must be boolean." });
                        }
                        if (typeof setup.plotStyle.plotTransparency !== "boolean") {
                            issues.push({ path: `${setupPath}.plotStyle.plotTransparency`, code: "INVALID_VALUE", message: "plotTransparency must be boolean." });
                        }
                    }
                }
            }
        }
        if (layout.entities !== undefined && !Array.isArray(layout.entities)) {
            issues.push({ path: `${path}.entities`, code: "INVALID_VALUE", message: "Layout entities must be an array." });
        }
        else if (Array.isArray(layout.entities)) {
            layout.entities.forEach((entity, entityIndex) => validateEntity(entity, `${path}.entities[${entityIndex}]`, layerIds, blockIds, handles, issues));
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
export function assertKDrawDocumentV1(candidate) {
    const result = validateKDrawDocumentV1(candidate);
    if (!result.valid) {
        const message = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
        throw new TypeError(`Invalid KDrawDocumentV1:\n${message}`);
    }
}
