import { buildGreeting } from "./lib/impl";

/** Greets someone by name. Copy-me template: the work happens in lib/. */
export function greet(name: string): string {
  return buildGreeting(name);
}
