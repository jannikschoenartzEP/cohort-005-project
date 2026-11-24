// Private to the example module: reachable only through ../index.ts.
export function buildGreeting(name: string): string {
  const trimmed = name.trim();
  return `Hello, ${trimmed.length > 0 ? trimmed : "stranger"}!`;
}
