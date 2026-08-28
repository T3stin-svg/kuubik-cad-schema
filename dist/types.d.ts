export type CadHandle = string;
export type CadLinearUnit = "unitless" | "mm" | "cm" | "m" | "in" | "ft";
export interface CadUnits {
    linear: CadLinearUnit;
    displayPrecision: number;
    angularPrecision: number;
}
export interface CadPoint2 {
    x: number;
    y: number;
}
export interface CadAppearance {
    color?: string;
    linetypeId?: string;
    lineweightMm?: number;
    transparency?: number;
}
export interface CadEntityBase {
    handle: CadHandle;
    layerId: string;
    appearance?: CadAppearance;
    extensionData?: Record<string, unknown>;
}
export interface CadLine extends CadEntityBase {
    kind: "line";
    start: CadPoint2;
    end: CadPoint2;
}
export interface CadPolylineVertex extends CadPoint2 {
    bulge?: number;
    startWidth?: number;
    endWidth?: number;
}
export interface CadPolyline extends CadEntityBase {
    kind: "polyline";
    vertices: CadPolylineVertex[];
    closed: boolean;
}
export interface CadCircle extends CadEntityBase {
    kind: "circle";
    center: CadPoint2;
    radius: number;
}
export interface CadArc extends CadEntityBase {
    kind: "arc";
    center: CadPoint2;
    radius: number;
    startAngleRad: number;
    endAngleRad: number;
    counterClockwise: boolean;
}
export interface CadEllipse extends CadEntityBase {
    kind: "ellipse";
    center: CadPoint2;
    majorAxis: CadPoint2;
    ratio: number;
    startParameter: number;
    endParameter: number;
}
export interface CadSpline extends CadEntityBase {
    kind: "spline";
    degree: number;
    controlPoints: CadPoint2[];
    knots: number[];
    weights?: number[];
    closed: boolean;
    periodic: boolean;
}
export interface CadText extends CadEntityBase {
    kind: "text" | "mtext";
    position: CadPoint2;
    text: string;
    height: number;
    rotationRad: number;
    styleId?: string;
}
export interface CadLeader extends CadEntityBase {
    kind: "leader";
    vertices: CadPoint2[];
    text?: string;
}
export interface CadDimension extends CadEntityBase {
    kind: "dimension";
    dimensionKind: "linear" | "aligned" | "angular" | "radial" | "diameter" | "ordinate";
    definitionPoints: CadPoint2[];
    styleId: string;
    overrideText?: string;
}
export interface CadHatchLoop {
    vertices: CadPoint2[];
    isHole: boolean;
}
export interface CadHatch extends CadEntityBase {
    kind: "hatch";
    pattern: string;
    associative: boolean;
    loops: CadHatchLoop[];
}
export interface CadBlockReference extends CadEntityBase {
    kind: "blockRef";
    blockId: string;
    insertion: CadPoint2;
    scale: CadPoint2;
    rotationRad: number;
    attributes?: Record<string, string>;
}
export interface CadProxyEntity extends CadEntityBase {
    kind: "proxy";
    originalType: string;
    raw: unknown;
    bounds?: {
        min: CadPoint2;
        max: CadPoint2;
    };
}
export type CadEntity = CadLine | CadPolyline | CadCircle | CadArc | CadEllipse | CadSpline | CadText | CadLeader | CadDimension | CadHatch | CadBlockReference | CadProxyEntity;
export interface CadLayer {
    id: string;
    name: string;
    visible: boolean;
    frozen: boolean;
    locked: boolean;
    plottable: boolean;
    appearance?: CadAppearance;
}
export interface CadLinetype {
    id: string;
    name: string;
    description?: string;
    pattern: number[];
}
export interface CadTextStyle {
    id: string;
    name: string;
    fontFamily: string;
    bigFont?: string;
    widthFactor: number;
    obliqueAngleRad: number;
}
export interface CadDimensionStyle {
    id: string;
    name: string;
    textStyleId?: string;
    textHeight: number;
    arrowSize: number;
    extensionOffset: number;
    scale: number;
    overrides?: Record<string, unknown>;
}
export interface CadBlockDefinition {
    id: string;
    name: string;
    basePoint: CadPoint2;
    entities: CadEntity[];
}
export interface CadViewport {
    id: string;
    center: CadPoint2;
    width: number;
    height: number;
    viewCenter: CadPoint2;
    viewHeight: number;
    twistAngleRad: number;
    locked: boolean;
    clipBoundary?: CadPoint2[];
    layerOverrides?: Record<string, CadAppearance & {
        frozen?: boolean;
    }>;
}
export interface CadPaperRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type CadPlotArea = {
    kind: "layout";
} | {
    kind: "extents";
} | {
    kind: "display";
} | {
    kind: "window";
    window: CadPaperRect;
};
export type CadPlotScale = {
    mode: "fit";
} | {
    mode: "custom";
    paperUnits: number;
    drawingUnits: number;
};
/** Vendor-neutral plot-colour conversion; native CTB/STB files remain external. */
export type CadPlotProfile = "color" | "monochrome" | "grayscale";
export interface CadPlotStyle {
    profile: CadPlotProfile;
    plotLineweights: boolean;
    plotTransparency: boolean;
}
/**
 * Vendor-neutral, per-layout plot contract. Device-specific PC3/CTB/STB data
 * deliberately lives outside v1; mediaName identifies the selected sheet.
 */
export interface CadPageSetup {
    mediaName: string;
    orientation: "portrait" | "landscape";
    plotArea: CadPlotArea;
    plotScale: CadPlotScale;
    centerPlot: boolean;
    plotOriginMm: CadPoint2;
    /** Optional for backwards-compatible v1 documents; the core supplies defaults. */
    plotStyle?: CadPlotStyle;
    /** AutoCAD-compatible on-screen plot-style preview; plotting always uses plotStyle. */
    displayPlotStyles?: boolean;
}
export interface CadLayout {
    id: string;
    name: string;
    kind: "model" | "paper";
    paper?: {
        widthMm: number;
        heightMm: number;
        marginsMm: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
    };
    pageSetup?: CadPageSetup;
    viewports: CadViewport[];
    /** Paper-space entities owned by this layout. Omitted by older v1 documents. */
    entities?: CadEntity[];
}
export interface CadAttachmentRef {
    id: string;
    mediaType: string;
    sha256: string;
    fileName: string;
    role: "underlay" | "xref" | "font" | "image" | "other";
}
export interface CadDocumentMetadata {
    title?: string;
    author?: string;
    createdAt: string;
    updatedAt: string;
    source?: string;
    extensions?: Record<string, unknown>;
}
export interface KDrawDocumentV1 {
    schemaVersion: 1;
    documentId: string;
    revision: number;
    units: CadUnits;
    currentLayerId: string;
    entities: CadEntity[];
    layers: CadLayer[];
    linetypes: CadLinetype[];
    textStyles: CadTextStyle[];
    dimensionStyles: CadDimensionStyle[];
    blocks: CadBlockDefinition[];
    layouts: CadLayout[];
    attachments: CadAttachmentRef[];
    metadata: CadDocumentMetadata;
}
export interface CadOperation {
    opId: string;
    baseRevision: number;
    commandId: string;
    args: unknown;
    targetHandles: CadHandle[];
    resultHandles: CadHandle[];
}
export interface KDrawContainerEntry {
    path: string;
    mediaType: string;
    byteLength: number;
    sha256: string;
}
export interface KDrawContainerManifestV1 {
    containerVersion: 1;
    documentPath: "document.json";
    createdAt: string;
    entries: KDrawContainerEntry[];
}
export interface EvidenceRef {
    kind: "autocad-live" | "browser" | "file-readback" | "test" | "source";
    uri: string;
    sha256?: string;
    observedAt: string;
    note?: string;
}
export interface OracleReportRef {
    oracle: "librecad" | "freecad" | string;
    version: string;
    status: "PASS" | "FAIL" | "NOT_RUN";
    certificationAuthority: false;
    report: EvidenceRef;
}
export interface ParityEvidence {
    rowId: `F-${string}`;
    autoCadEvidence: EvidenceRef;
    kuubikEvidence: EvidenceRef;
    outputReadback: EvidenceRef;
    oracleReports: OracleReportRef[];
    score: 0 | 0.25 | 0.5 | 0.75 | 1;
}
//# sourceMappingURL=types.d.ts.map