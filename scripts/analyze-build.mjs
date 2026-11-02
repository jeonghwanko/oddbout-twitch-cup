import { build } from "vite";
import { gzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { relative } from "node:path";

// Build in memory: module sizes are attribution estimates; chunk bytes/gzip are exact.
const result = await build({ logLevel: "silent", build: { write: false, copyPublicDir: false } });
const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const chunks = outputs.filter(item => item.type === "chunk").map(chunk => ({
  file: chunk.fileName, entry: chunk.facadeModuleId && relative(process.cwd(), chunk.facadeModuleId).replaceAll("\\", "/"),
  bytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code).byteLength,
  imports: chunk.imports, dynamicImports: chunk.dynamicImports,
  modules: Object.entries(chunk.modules).map(([id, details]) => ({
    id: relative(process.cwd(), id).replaceAll("\\", "/"), bytes: details.renderedLength,
  })).sort((a, b) => b.bytes - a.bytes),
})).sort((a, b) => b.bytes - a.bytes);
const report = { chunks };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.table(chunks.slice(0, 8).map(({ file, bytes, gzipBytes, modules }) => ({ file, bytes, gzipBytes, modules: modules.length })));
for (const chunk of chunks.slice(0, 2)) {
  console.log(chunk.file);
  console.table(chunk.modules.slice(0, 12));
}
