import { HrmsPage } from "./HrmsPage";

/**
 * LeavePage integrates seamlessly into the unified HRMS workspace
 * by mounting HrmsPage with the 'leave' tab as the active portal.
 */
export function LeavePage() {
  return <HrmsPage defaultTab="leave" />;
}
