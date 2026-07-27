import { spawnSync } from "node:child_process";

export interface TrackedTextFinding {
  file: string;
  line: number;
  text: string;
}

export function grepTrackedText(cwd: string, patterns: readonly string[]): TrackedTextFinding[] {
  if (patterns.length === 0) return [];

  const patternArgs = patterns.flatMap((pattern) => ["-e", pattern]);
  const result = spawnSync(
    "git",
    ["grep", "-I", "-i", "-n", "--null", "-F", ...patternArgs, "--"],
    { cwd, encoding: "utf8" },
  );

  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git grep failed with status ${result.status}`);
  }

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((output) => {
      const match = /^([^\0]+)\0(\d+)\0(.*)$/.exec(output);
      if (!match) throw new Error(`Unexpected git grep output: ${output}`);
      return { file: match[1], line: Number(match[2]), text: match[3] };
    });
}
