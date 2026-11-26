/**
 * Fails when a tracked file is over the token limit in CODING_STANDARDS.md
 * ("Keep files under 5000 tokens").
 *
 * Tokens are estimated as bytes / 4. That is cheap and close enough for code.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const MAX_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;

// Generated or vendored files nobody edits by hand.
const IGNORED = [
  /(^|\/)package-lock\.json$/,
  /^skills-lock\.json$/,
  /^drizzle\//,
  /^\.agents\//,
  /^public\//,
  /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|db)$/,
];

// Files that were already over the limit when this check was added.
// Split each one and remove it from this list. Do not add new entries.
const ALLOWLIST = new Set([
  "scripts/seed.ts",
  "app/routes/instructor.$courseId.tsx",
  "app/routes/courses.$slug.lessons.$lessonId.tsx",
  "request-logger/agents.ts",
  "request-logger/agents.test.ts",
  "app/routes/instructor.analytics.tsx",
  "app/modules/instructor-analytics/tests/instructor-analytics.test.ts",
  "app/routes/instructor.$courseId.lessons.$lessonId.quiz.tsx",
  "app/routes/courses.$slug.tsx",
  "app/modules/instructor-analytics/lib/instructor-analytics.ts",
  "request-logger/render.ts",
  "app/lib/refunds.server.ts",
  "app/lib/refunds.server.test.ts",
  "request-logger/proxy.ts",
  "request-logger/README.md",
]);

const estimateTokens = (path: string) =>
  Math.ceil(statSync(path).size / BYTES_PER_TOKEN);

// With file arguments (from lint-staged), check only those files.
// Without, check every tracked file.
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const requestedFiles = process.argv.slice(2);
const candidateFiles =
  requestedFiles.length > 0
    ? requestedFiles.map((path) => relative(repoRoot, resolve(path)))
    : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0");

process.chdir(repoRoot);

const trackedFiles = candidateFiles
  .filter(Boolean)
  .filter((path) => !IGNORED.some((pattern) => pattern.test(path)))
  .filter((path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false; // deleted but not yet staged
    }
  });

const tooLong = trackedFiles
  .filter((path) => !ALLOWLIST.has(path))
  .map((path) => ({ path, tokens: estimateTokens(path) }))
  .filter(({ tokens }) => tokens > MAX_TOKENS);

const nowShortEnough = trackedFiles.filter(
  (path) => ALLOWLIST.has(path) && estimateTokens(path) <= MAX_TOKENS
);

const exportCount = (path: string) =>
  (readFileSync(path, "utf8").match(/^export /gm) ?? []).length;

if (tooLong.length > 0) {
  console.error(
    `\n✖ ${tooLong.length} file(s) over ${MAX_TOKENS} tokens (estimated as bytes / ${BYTES_PER_TOKEN}):\n`
  );
  for (const { path, tokens } of tooLong) {
    console.error(
      `  ${path}: ~${tokens} tokens, ${exportCount(path)} top-level exports`
    );
  }
  console.error(`
How to split a file that is too long:

  1. Read the whole file and list its responsibilities. Each group of
     functions, types and components that change together is one candidate.
  2. Move each group into its own file next to the original, named after what
     it does (for example \`refunds.validation.ts\`, \`lesson-sidebar.tsx\`).
     Do not create \`utils.ts\` or \`helpers.ts\` dumping grounds.
  3. Route files (app/routes/*): keep the loader, action and default component
     in the route. Move sub-components into app/components/ and data access
     into the relevant module in app/modules/.
  4. Modules (app/modules/*): keep the public interface in the module's entry
     file and move internals into lib/. Read app/modules/README.md first; the
     module's public interface must not change.
  5. Test files: split by the behaviour under test (one file per describe
     block is a good default). Move shared setup into a fixtures file.
  6. Move code; do not rewrite it. Update imports, then run \`npm run check\`.

Aim for each new file to be well under ${MAX_TOKENS} tokens, not just under it.
`);
}

if (nowShortEnough.length > 0) {
  console.error(
    `\n✖ These files are now under ${MAX_TOKENS} tokens. Remove them from ALLOWLIST in scripts/check-file-tokens.ts:\n`
  );
  for (const path of nowShortEnough) console.error(`  ${path}`);
}

if (tooLong.length > 0 || nowShortEnough.length > 0) process.exit(1);

console.log(`✔ All checked files are under ${MAX_TOKENS} tokens.`);
