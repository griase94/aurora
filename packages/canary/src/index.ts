/**
 * The canary's one function: a greeting. A consumer proof imports and calls
 * it to show that an installed release tarball resolves and runs.
 */
export function chirp(name: string): string {
  const who = name.trim() || "world";
  return `Aurora canary says hello once more, ${who}.`;
}
