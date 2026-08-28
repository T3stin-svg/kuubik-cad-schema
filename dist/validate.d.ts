import type { KDrawDocumentV1 } from "./types.js";
export interface ValidationIssue {
    path: string;
    code: "INVALID_ROOT" | "INVALID_SCHEMA_VERSION" | "INVALID_NUMBER" | "INVALID_ENTITY_KIND" | "DUPLICATE_ID" | "MISSING_REFERENCE" | "INVALID_VALUE";
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}
export declare function validateKDrawDocumentV1(candidate: unknown): ValidationResult;
export declare function assertKDrawDocumentV1(candidate: unknown): asserts candidate is KDrawDocumentV1;
//# sourceMappingURL=validate.d.ts.map