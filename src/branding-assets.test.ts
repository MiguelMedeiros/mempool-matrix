import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(repositoryRoot, "public");
const appDir = path.join(repositoryRoot, "src/app");
const generatedFiles = [
  "public/icon-192.png",
  "public/icon-512.png",
  "public/icon-maskable-512.png",
  "public/og.jpg",
  "src/app/icon.png",
  "src/app/apple-icon.png",
  "src/app/favicon.ico",
] as const;
const temporaryDirectories: string[] = [];

async function expectImage(pathname: string, width: number, height: number, format: string) {
  const metadata = await sharp(pathname).metadata();
  expect(metadata).toMatchObject({ width, height, format });
}

async function rgbaAt(pathname: string, x: number, y: number) {
  const { data } = await sharp(pathname)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [...data];
}

function parseIco(buffer: Buffer) {
  expect([...buffer.subarray(0, 6)]).toEqual([0, 0, 1, 0, 3, 0]);
  return Array.from({ length: buffer.readUInt16LE(4) }, (_, index) => {
    const cursor = 6 + index * 16;
    const width = buffer[cursor] || 256;
    const height = buffer[cursor + 1] || 256;
    const planes = buffer.readUInt16LE(cursor + 4);
    const bitDepth = buffer.readUInt16LE(cursor + 6);
    const length = buffer.readUInt32LE(cursor + 8);
    const offset = buffer.readUInt32LE(cursor + 12);
    return { width, height, planes, bitDepth, length, offset, data: buffer.subarray(offset, offset + length) };
  });
}

async function sha256(pathname: string) {
  return createHash("sha256").update(await readFile(pathname)).digest("hex");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("branding and install assets", () => {
  it("declares a valid standalone manifest without invented screenshots", async () => {
    const manifest = JSON.parse(await readFile(path.join(publicDir, "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({
      name: "mempool.matrix — Bitcoin Transaction Rain",
      short_name: "mempool.matrix",
      description: "An interactive visualization of Bitcoin mempool activity as transaction rain.",
      start_url: "/",
      display: "standalone",
      background_color: "#010302",
      theme_color: "#010302",
      categories: ["bitcoin", "finance", "visualization"],
    });
    expect(manifest).not.toHaveProperty("screenshots");
    expect(manifest.icons).toEqual([
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
    await Promise.all(manifest.icons.map(({ src }: { src: string }) => readFile(path.join(publicDir, src.slice(1)))));
  });

  it("exports every referenced raster with the expected MIME and dimensions", async () => {
    await Promise.all([
      expectImage(path.join(publicDir, "icon-192.png"), 192, 192, "png"),
      expectImage(path.join(publicDir, "icon-512.png"), 512, 512, "png"),
      expectImage(path.join(publicDir, "icon-maskable-512.png"), 512, 512, "png"),
      expectImage(path.join(publicDir, "og.jpg"), 1200, 630, "jpeg"),
      expectImage(path.join(appDir, "icon.png"), 512, 512, "png"),
      expectImage(path.join(appDir, "apple-icon.png"), 180, 180, "png"),
    ]);
  });

  it("keeps launcher corners opaque and maskable accents inside a practical safe zone", async () => {
    for (const filename of ["icon-512.png", "icon-maskable-512.png"]) {
      const corner = await rgbaAt(path.join(publicDir, filename), 0, 0);
      expect(corner[0]).toBeLessThanOrEqual(8);
      expect(corner[1]).toBeLessThanOrEqual(16);
      expect(corner[2]).toBeLessThanOrEqual(10);
      expect(corner[3]).toBe(255);
    }

    const { data, info } = await sharp(path.join(publicDir, "icon-maskable-512.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let brightOutsideSafeZone = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * 4;
        const bright = data[offset] > 90 || data[offset + 1] > 100 || data[offset + 2] > 90;
        if (bright && (x < 80 || x >= 432 || y < 80 || y >= 432)) brightOutsideSafeZone += 1;
      }
    }
    expect(brightOutsideSafeZone).toBe(0);
  });

  it("packages pixel-aligned 16, 32, and 48 pixel PNG favicon entries", async () => {
    const favicon = await readFile(path.join(appDir, "favicon.ico"));
    const entries = parseIco(favicon);
    expect(entries.map(({ width, height }) => [width, height])).toEqual([[16, 16], [32, 32], [48, 48]]);
    for (const entry of entries) {
      expect(entry).toMatchObject({ planes: 1, bitDepth: 32 });
      expect(entry.offset + entry.length).toBeLessThanOrEqual(favicon.length);
      expect([...entry.data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const metadata = await sharp(entry.data).metadata();
      expect(metadata).toMatchObject({ width: entry.width, height: entry.height, format: "png" });
    }
  });

  it("keeps only intentional source and route assets", async () => {
    await Promise.all([
      readFile(path.join(repositoryRoot, "assets/brand-mark.svg")),
      readFile(path.join(repositoryRoot, "assets/favicon-mark.svg")),
      readFile(path.join(repositoryRoot, "assets/icon-maskable-source.svg")),
      readFile(path.join(repositoryRoot, "docs/assets/og.jpg")),
    ]);
    await expect(readFile(path.join(publicDir, "icon.svg"))).rejects.toThrow();
    await expect(readFile(path.join(publicDir, "apple-touch-icon.png"))).rejects.toThrow();
    await expect(readFile(path.join(appDir, "opengraph-image.jpg"))).rejects.toThrow();
  });

  it("generates committed outputs deterministically into an optional output root", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "mempool-matrix-branding-"));
    temporaryDirectories.push(outputRoot);
    await execFileAsync(process.execPath, [path.join(repositoryRoot, "scripts/generate-assets.mjs"), outputRoot], {
      cwd: os.tmpdir(),
    });
    for (const filename of generatedFiles) {
      expect(await sha256(path.join(outputRoot, filename))).toBe(await sha256(path.join(repositoryRoot, filename)));
    }
  });

  it("does not encode private absolute paths in the portable generator", async () => {
    const generator = await readFile(path.join(repositoryRoot, "scripts/generate-assets.mjs"), "utf8");
    expect(generator).not.toMatch(/\/home\/|\/tmp\/|mempool-matrix-branding-draft/);
    expect(generator).toContain('from "sharp"');
    expect(generator).toContain("import.meta.url");
  });
});
