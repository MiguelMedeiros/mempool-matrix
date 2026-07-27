import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = process.argv[2] ? path.resolve(process.argv[2]) : repositoryRoot;
const source = (...segments) => path.join(repositoryRoot, ...segments);
const output = (...segments) => path.join(outputRoot, ...segments);

async function png(input, destination, size) {
  await sharp(input)
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9, palette: false })
    .toFile(destination);
}

function icoFromPngEntries(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;
  entries.forEach(({ size, data }, index) => {
    const cursor = index * 16;
    directory[cursor] = size;
    directory[cursor + 1] = size;
    directory.writeUInt16LE(1, cursor + 4);
    directory.writeUInt16LE(32, cursor + 6);
    directory.writeUInt32LE(data.length, cursor + 8);
    directory.writeUInt32LE(offset, cursor + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...entries.map(({ data }) => data)]);
}

async function main() {
  await Promise.all([
    mkdir(output("public"), { recursive: true }),
    mkdir(output("src/app"), { recursive: true }),
  ]);

  const brandMark = source("assets/brand-mark.svg");
  const faviconMark = source("assets/favicon-mark.svg");
  const maskableMark = source("assets/icon-maskable-source.svg");

  await Promise.all([
    png(brandMark, output("public/icon-192.png"), 192),
    png(brandMark, output("public/icon-512.png"), 512),
    png(brandMark, output("src/app/icon.png"), 512),
    png(brandMark, output("src/app/apple-icon.png"), 180),
    png(maskableMark, output("public/icon-maskable-512.png"), 512),
    sharp(source("docs/assets/og.jpg"))
      .resize(1200, 630, { fit: "cover" })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4", progressive: true })
      .toFile(output("public/og.jpg")),
  ]);

  const faviconEntries = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      data: await sharp(faviconMark)
        .resize(size, size, { fit: "fill", kernel: sharp.kernel.nearest })
        .png({ compressionLevel: 9, palette: false })
        .toBuffer(),
    })),
  );
  await writeFile(output("src/app/favicon.ico"), icoFromPngEntries(faviconEntries));

  // Read all outputs before success so truncated writes fail the command immediately.
  await Promise.all([
    "public/icon-192.png",
    "public/icon-512.png",
    "public/icon-maskable-512.png",
    "public/og.jpg",
    "src/app/icon.png",
    "src/app/apple-icon.png",
    "src/app/favicon.ico",
  ].map((filename) => readFile(output(filename))));
}

await main();
