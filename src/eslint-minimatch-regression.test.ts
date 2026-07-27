import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ESLint } from "eslint";
import { afterEach, describe, expect, it } from "vitest";

const fixtureDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtureDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("ESLint minimatch compatibility", () => {
  it("runs react/jsx-pascal-case glob ignores on a temporary TSX fixture", async () => {
    const fixtureDirectory = await mkdtemp(
      join(process.cwd(), ".eslint-minimatch-regression-"),
    );
    fixtureDirectories.push(fixtureDirectory);

    const fixturePath = join(fixtureDirectory, "fixture.tsx");
    await writeFile(
      fixturePath,
      "const _badComponent = () => null;\nexport const fixture = <_badComponent />;\n",
    );

    const eslint = new ESLint({
      overrideConfig: {
        rules: {
          "react/jsx-pascal-case": ["error", { ignore: ["_bad*"] }],
        },
      },
    });
    const [result] = await eslint.lintFiles([fixturePath]);

    expect(result.errorCount).toBe(0);
  });
});
