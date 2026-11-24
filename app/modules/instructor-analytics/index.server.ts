import { db as appDb } from "~/db";
import {
  getInstructorAnalytics as compute,
  type AnalyticsViewer,
  type Db,
} from "./lib/instructor-analytics.server";

export type {
  AnalyticsViewer,
  CourseCountryRevenue,
  CourseFunnel,
  CourseProgressSummary,
  FunnelLesson,
  InstructorAnalytics,
  QuizPassRate,
  RefundExposure,
  RevenueSeries,
} from "./lib/instructor-analytics.server";

/**
 * Every figure on the instructor analytics page, for this viewer, these
 * search params and this moment.
 *
 * Reads the app database unless handed another one; tests pass their own.
 * Never throws on bad params: an unknown range, tab, instructor or course
 * falls back to its default.
 */
export function getInstructorAnalytics(
  viewer: AnalyticsViewer,
  params: URLSearchParams,
  now: Date,
  db: Db = appDb
) {
  return compute(db, viewer, params, now);
}
