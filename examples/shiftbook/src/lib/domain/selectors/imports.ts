/**
 * Import selectors. Filled by the import lane (F.11).
 */
import type { IssueSource } from "./issues.ts";

/** Imported rows without a person. Not built: the import lane fills it. */
export const unassignedImportIssues: IssueSource = () => [];
