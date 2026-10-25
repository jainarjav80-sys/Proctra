/** Interview status helpers shared by recruiter and candidate pages (client-safe, no server imports). */

export const INTERVIEW_STATUSES = ["DRAFT", "READY", "ONBOARDING", "IN_PROGRESS", "PAUSED", "COMPLETED", "EVALUATING", "EVALUATED", "EXPIRED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/** The candidate is done: the recruiter review page applies and the invite no longer works. */
export const FINISHED_STATUSES: readonly string[] = ["COMPLETED", "EVALUATING", "EVALUATED", "EXPIRED"];
export const isFinished = (status: string) => FINISHED_STATUSES.includes(status);

/** Where a recruiter goes for an interview: the review once it's finished, otherwise its setup page. */
export const recruiterHref = (id: string, status: string) => (isFinished(status) ? `/dashboard/interviews/${id}` : `/interviews/${id}`);

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  ONBOARDING: "Onboarding",
  IN_PROGRESS: "In progress",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  EVALUATING: "Evaluating",
  EVALUATED: "Evaluated",
  EXPIRED: "Expired",
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status.replaceAll("_", " ").toLowerCase();

export type StatusTone = "neutral" | "info" | "active" | "success" | "danger";
export const STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  READY: "info",
  ONBOARDING: "active",
  IN_PROGRESS: "active",
  PAUSED: "active",
  COMPLETED: "success",
  EVALUATING: "success",
  EVALUATED: "success",
  EXPIRED: "danger",
};
