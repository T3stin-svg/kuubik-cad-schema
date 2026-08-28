import { describe, expect, it } from "vitest";
import {
  assertKDrawDocumentV1,
  type KDrawDocumentV1,
  validateKDrawDocumentV1,
} from "../src/index.js";

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

  it("requires unsupported entities to use the proxy discriminator", () => {
    const document = fixture() as unknown as Record<string, unknown>;
    (document.entities as unknown[]).push({ kind: "vendorThing", handle: "12", layerId: "0" });
    const result = validateKDrawDocumentV1(document);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "$.entities[2].kind", code: "INVALID_ENTITY_KIND" }),
    );
  });
});
