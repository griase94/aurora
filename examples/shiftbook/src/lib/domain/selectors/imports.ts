/**
 * Import selectors. Filled when the import area is built.
 */
import type { IssueSource } from "./issues.ts";

/** Imported rows without a person. Not built: the import lane fills it. */
export const unassignedImportIssues: IssueSource = () => [];
