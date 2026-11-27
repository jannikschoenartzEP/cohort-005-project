import { db } from "~/db";
import { getLanding, type Db } from "./lib/landing";

/**
 * The landing page's data bound to a database. The app uses `landing`, which
 * reads the app database; tests build their own against a test database.
 */
export function createLanding(database: Db) {
  return {
    /**
     * The newest published course as the spotlight, with its first modules
     * as an outline; the next three newest as featured cards; and counts of
     * published courses, their lessons, instructors and categories.
     */
    get() {
      return getLanding(database);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const landing = /* @__PURE__ */ createLanding(db);
