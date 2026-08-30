import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertKDrawDocumentV1,
  type KDrawDocumentV1,
  validateKDrawDocumentV1,
} from "../src/index.js";

const publicJsonSchema = JSON.parse(readFileSync(new URL("../schema/kdraw-v1.schema.json", import.meta.url), "utf8")) as {
  $defs: { pageSetup: { properties: Record<string, unknown> } };
};

function fixture(): KDrawDocumentV1 {
  return {
    schemaVersion: 1,
    documentId: "doc-1",
    revision: 0,
    units: { linear: "mm", displayPrecision: 4, angularPrecision: 6 },
    currentLayerId: "0",
    layers: [
      { id: "0", name: "0", visible: true, frozen: false, locked: false, plottable: true },
    ],
    linetypes: [],
    textStyles: [],
    dimensionStyles: [],
    blocks: [],
    layouts: [{ id: "model", name: "Model", kind: "model", viewports: [] }],
    attachments: [],
    entities: [
      {
        kind: "line",
        handle: "10",
        layerId: "0",
        start: { x: 0.125, y: -4.75 },
        end: { x: 100.625, y: 42.375 },
      },
      {
        kind: "proxy",
        handle: "11",
        layerId: "0",
        originalType: "ACME_UNKNOWN",
        raw: { preserved: true },
      },
    ],
    metadata: {
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
  };
}

describe("validateKDrawDocumentV1", () => {
  it("accepts double coordinates and preserves unknown data as a proxy", () => {
    const document = fixture();
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    expect(() => assertKDrawDocumentV1(document)).not.toThrow();
  });

  it("rejects duplicate handles across model and block space", () => {
    const document = fixture();
    document.blocks.push({
      id: "block-1",
      name: "Block 1",
      basePoint: { x: 0, y: 0 },
      entities: [
        { kind: "circle", handle: "10", layerId: "0", center: { x: 0, y: 0 }, radius: 1 },
      ],
    });
    const result = validateKDrawDocumentV1(document);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_ID")).toBe(true);
  });

  it("validates paper-space entities and requires their handles to be document-unique", () => {
    const document = fixture();
    document.layouts.push({
      id: "layout-1",
      name: "Layout 1",
      kind: "paper",
      viewports: [],
      entities: [
        { kind: "circle", handle: "20", layerId: "0", center: { x: 50, y: 50 }, radius: 25 },
      ],
    });
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    document.layouts[1]!.entities![0]!.handle = "10";
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.layouts[1].entities[0].handle", code: "DUPLICATE_ID" }),
    );
  });

  it("validates a discriminated per-layout page setup", () => {
    const document = fixture();
    document.layouts.push({
      id: "layout-1",
      name: "Layout 1",
      kind: "paper",
      paper: { widthMm: 210, heightMm: 297, marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
      pageSetup: {
        mediaName: "ISO_A4",
        orientation: "portrait",
        plotArea: { kind: "window", window: { x: 10, y: 20, width: 180, height: 250 } },
        plotScale: { mode: "custom", paperUnits: 1, drawingUnits: 2 },
        centerPlot: false,
        plotOriginMm: { x: 10, y: 10 },
        plotStyle: { profile: "grayscale", plotLineweights: true, plotTransparency: false },
      },
      viewports: [],
    });
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    if (document.layouts[1]?.pageSetup?.plotScale.mode === "custom") document.layouts[1].pageSetup.plotScale.drawingUnits = 0;
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.layouts[1].pageSetup.plotScale", code: "INVALID_VALUE" }),
    );
  });

  it("rejects an invalid optional vendor-neutral plot style", () => {
    const document = fixture();
    document.layouts.push({
      id: "layout-plot-style",
      name: "Plot style",
      kind: "paper",
      paper: { widthMm: 297, heightMm: 210, marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
      pageSetup: {
        mediaName: "ISO_A4",
        orientation: "landscape",
        plotArea: { kind: "layout" },
        plotScale: { mode: "custom", paperUnits: 1, drawingUnits: 1 },
        centerPlot: false,
        plotOriginMm: { x: 0, y: 0 },
        plotStyle: { profile: "color", plotLineweights: true, plotTransparency: true },
        displayPlotStyles: true,
      },
      viewports: [],
    });
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    const setup = document.layouts[1]!.pageSetup!;
    setup.plotStyle = { ...setup.plotStyle!, profile: "native-ctb" as "color" };
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.layouts[1].pageSetup.plotStyle.profile", code: "INVALID_VALUE" }),
    );
    setup.plotStyle = { profile: "color", plotLineweights: true, plotTransparency: true };
    setup.displayPlotStyles = "yes" as unknown as boolean;
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.layouts[1].pageSetup.displayPlotStyles", code: "INVALID_VALUE" }),
    );
  });

  it("keeps the public JSON Schema aligned with persisted plot-preview state", () => {
    expect(publicJsonSchema.$defs.pageSetup.properties.displayPlotStyles).toEqual({ type: "boolean" });
  });

  it("locks appearance transparency to AutoCAD-style percent semantics", () => {
    const document = fixture();
    document.entities[0]!.appearance = { color: "#f00", colorMethod: "aci", aciIndex: 10, linetypeScale: 2, lineweightMm: 0.7, transparency: 40, thickness: -3, plotStyleId: "Engineering", materialId: "Steel" };
    document.layers[0]!.appearance = { color: "#00ff00", colorMethod: "trueColor", aciIndex: 3, linetypeScale: 0.5, lineweightMm: 0, transparency: 90, thickness: 0 };
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    document.entities[0]!.appearance = { color: "red", colorMethod: "indexed" as "aci", aciIndex: 1.5, linetypeScale: 0, lineweightMm: -0.1, transparency: 91, thickness: Number.NaN, plotStyleId: "", materialId: "" };
    const issues = validateKDrawDocumentV1(document).issues;
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.color", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.colorMethod", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.aciIndex", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.linetypeScale", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.lineweightMm", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.transparency", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.thickness", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.plotStyleId", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.entities[0].appearance.materialId", code: "INVALID_VALUE" }));
  });

  it("rejects ACI or color-method metadata without the matching render color", () => {
    const document = fixture();
    document.entities[0]!.appearance = { aciIndex: 10 };
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[0].appearance.color", code: "INVALID_VALUE" }),
    );
    document.entities[0]!.appearance = { colorMethod: "trueColor" };
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[0].appearance.color", code: "INVALID_VALUE" }),
    );
    expect(publicJsonSchema.$defs.appearance.allOf).toEqual([
      {
        if: { anyOf: [{ required: ["aciIndex"] }, { required: ["colorMethod"] }] },
        then: { required: ["color"] },
      },
    ]);
  });

  it("rejects duplicate layout names case-insensitively and duplicate viewport ids", () => {
    const document = fixture();
    document.layouts[0]!.viewports.push({
      id: "viewport-1", center: { x: 0, y: 0 }, width: 10, height: 10,
      viewCenter: { x: 0, y: 0 }, viewHeight: 10, twistAngleRad: 0, locked: false,
    });
    document.layouts.push({
      id: "layout-1", name: "model", kind: "paper", entities: [],
      viewports: [{
        id: "viewport-1", center: { x: 0, y: 0 }, width: 10, height: 10,
        viewCenter: { x: 0, y: 0 }, viewHeight: 10, twistAngleRad: 0, locked: false,
      }],
    });
    const issues = validateKDrawDocumentV1(document).issues;
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.layouts[1].name", code: "DUPLICATE_ID" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.layouts[1].viewports[0].id", code: "DUPLICATE_ID" }));
  });

  it("rejects missing layer references", () => {
    const document = fixture();
    document.entities[0]!.layerId = "missing";
    const result = validateKDrawDocumentV1(document);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[0].layerId", code: "MISSING_REFERENCE" }),
    );
  });

  it("rejects non-finite geometry", () => {
    const document = fixture();
    if (document.entities[0]?.kind === "line") document.entities[0].end.x = Number.NaN;
    const result = validateKDrawDocumentV1(document);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[0].end.x", code: "INVALID_NUMBER" }),
    );
  });

  it("accepts ray/xline entities and rejects missing or zero directions", () => {
    const document = fixture();
    document.entities.push(
      { kind: "ray", handle: "12", layerId: "0", basePoint: { x: 0, y: 0 }, direction: { x: 3, y: 4 } },
      { kind: "xline", handle: "13", layerId: "0", basePoint: { x: 10, y: 20 }, direction: { x: 0, y: 1 } },
    );
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    const ray = document.entities[2]!;
    if (ray.kind !== "ray") throw new Error("Expected ray fixture.");
    ray.direction = { x: 0, y: 0 };
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[2].direction", code: "INVALID_VALUE" }),
    );
    delete (ray as Partial<typeof ray>).direction;
    expect(validateKDrawDocumentV1(document).issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[2].direction", code: "INVALID_VALUE" }),
    );
  });

  it("requires unsupported entities to use the proxy discriminator", () => {
    const document = fixture() as unknown as Record<string, unknown>;
    (document.entities as unknown[]).push({ kind: "vendorThing", handle: "12", layerId: "0" });
    const result = validateKDrawDocumentV1(document);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[2].kind", code: "INVALID_ENTITY_KIND" }),
    );
  });
});
