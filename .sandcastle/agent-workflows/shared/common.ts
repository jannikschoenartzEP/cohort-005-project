import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";

export const outputDir = (): string => process.env.OUTPUT_DIR ?? "/tmp";

export const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
};

export const writeJson = (filename: string, value: unknown): void => {
  fs.mkdirSync(outputDir(), { recursive: true });
  fs.writeFileSync(
    path.join(outputDir(), filename),
    JSON.stringify(value, null, 2)
  );
};

// The one agent every factory workflow runs. It authenticates with a Claude
// subscription. To bill the API instead, pass ANTHROPIC_API_KEY here and in
// the workflow's env in place of CLAUDE_CODE_OAUTH_TOKEN.
//
// Sandcastle would run the agent with its permission checks skipped, but the
// org's managed Claude Code settings disable bypass mode, so that flag is
// ignored. In --print mode nobody can approve anything, so every action that
// needs approval is denied. `acceptEdits` approves file edits inside the
// working directory. The org policy also forces Claude Code's sandbox on,
// which auto-approves Bash commands that stay inside it. Anything the agent
// needs to read or write must therefore sit in the checkout: see .factory/.
export const claudeAgent = () =>
  sandcastle.claudeCode("claude-opus-5-5", {
    permissionMode: "acceptEdits",
    env: {
      CLAUDE_CODE_OAUTH_TOKEN: required("CLAUDE_CODE_OAUTH_TOKEN"),
    },
  });
