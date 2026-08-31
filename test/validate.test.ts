import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertKDrawDocumentV1,
  type KDrawDocumentV1,
  validateKDrawDocumentV1,
} from "../src/index.js";

const publicJsonSchema = JSON.parse(readFileSync(new URL("../schema/kdraw-v1.schema.json", import.meta.url), "utf8")) as {
  $defs: { pageSetup: { properties: Record<string, unknown> }; entity: { allOf: Array<{ oneOf?: Array<{ properties?: Record<string, { const?: string }> }> }> } };
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

  it("preserves the MATCHPROP viewport-special state in the public contract", () => {
    const document = fixture();
    document.layouts.push({
      id: "layout-1",
      name: "Layout 1",
      kind: "paper",
      viewports: [{
        id: "viewport-1",
        center: { x: 100, y: 80 },
        width: 160,
        height: 100,
        viewCenter: { x: 500, y: 250 },
        viewHeight: 5_000,
        twistAngleRad: 0,
        locked: true,
        on: false,
        shadePlot: "wireframe",
        snapEnabled: true,
        gridEnabled: false,
        ucsIconVisible: true,
        ucsIconAtOrigin: false,
      }],
    });
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    expect(publicJsonSchema.$defs.viewport.properties).toMatchObject({
      on: { type: "boolean" },
      shadePlot: { enum: ["as-displayed", "wireframe", "hidden", "rendered"] },
      snapEnabled: { type: "boolean" },
      gridEnabled: { type: "boolean" },
      ucsIconVisible: { type: "boolean" },
      ucsIconAtOrigin: { type: "boolean" },
    });

    document.layouts[1]!.viewports[0]!.shadePlot = "conceptual" as "wireframe";
    document.layouts[1]!.viewports[0]!.gridEnabled = "yes" as unknown as boolean;
    const issues = validateKDrawDocumentV1(document).issues;
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.layouts[1].viewports[0].shadePlot", code: "INVALID_VALUE" }));
    expect(issues).toContainEqual(expect.objectContaining({ path: "$.layouts[1].viewports[0].gridEnabled", code: "INVALID_VALUE" }));
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

  it("preserves validated AutoCAD-compatible control and fit spline contracts", () => {
    const document = fixture();
    document.entities.push(
      {
        kind: "spline", handle: "20", layerId: "0", definitionMethod: "control-vertices", degree: 2,
        controlPoints: [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }],
        knots: [0, 0, 0, 1, 1, 1], weights: [1, 0.75, 1], closed: false, periodic: false,
      },
      {
        kind: "spline", handle: "21", layerId: "0", definitionMethod: "fit-points", degree: 3,
        fitPoints: [{ x: 0, y: 200 }, { x: 50, y: 300 }, { x: 100, y: 200 }],
        fitTolerance: 1e-7, startTangent: { x: 50, y: 100 }, endTangent: { x: 50, y: -100 },
        knotParameterization: "sqrt-chord",
        controlPoints: [{ x: 0, y: 200 }, { x: 20, y: 240 }, { x: 80, y: 240 }, { x: 100, y: 200 }],
        knots: [0, 0, 0, 0, 1, 1, 1, 1], closed: false, periodic: false,
      },
    );
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
    const splineBranch = publicJsonSchema.$defs.entity.allOf.flatMap((part) => part.oneOf ?? [])
      .find((part) => part.properties?.kind?.const === "spline");
    expect(splineBranch?.properties).toMatchObject({
      definitionMethod: { enum: ["control-vertices", "fit-points"] },
      knotParameterization: { enum: ["chord", "sqrt-chord", "uniform"] },
    });
  });

  it("keeps legacy schema-version 1 splines as control-vertex definitions", () => {
    const document = fixture();
    document.entities.push({
      kind: "spline", handle: "20", layerId: "0", degree: 2,
      controlPoints: [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }],
      knots: [0, 0, 0, 1, 1, 1], closed: false, periodic: false,
    });
    expect(validateKDrawDocumentV1(document)).toEqual({ valid: true, issues: [] });
  });

  it("rejects inconsistent fit spline topology and metadata", () => {
    const document = fixture();
    document.entities.push({
      kind: "spline", handle: "20", layerId: "0", definitionMethod: "fit-points", degree: 2,
      fitPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }], fitTolerance: -1,
      startTangent: { x: 0, y: 0 }, knotParameterization: "unknown" as "chord",
      controlPoints: [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }],
      knots: [0, 0, 1], weights: [1, -1], closed: "no" as unknown as boolean, periodic: false,
    });
    const paths = validateKDrawDocumentV1(document).issues.map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining([
      "$.entities[2].degree", "$.entities[2].fitPoints", "$.entities[2].fitTolerance",
      "$.entities[2].startTangent", "$.entities[2].knotParameterization", "$.entities[2].knots",
      "$.entities[2].weights", "$.entities[2].closed",
    ]));
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
