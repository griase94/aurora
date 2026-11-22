/**
 * Device selectors: the kiosks' clocks and deliveries (rule 11). Filled by the
 * kiosk lane (F.7).
 */
import type { IssueSource } from "./issues.ts";

/** A kiosk whose clock is off by the tenant's threshold or more. Not built: the kiosk lane fills it. */
export const clockSkewIssues: IssueSource = () => [];

/** A kiosk whose last delivery failed. Not built: the kiosk lane fills it. */
export const syncFailedIssues: IssueSource = () => [];
