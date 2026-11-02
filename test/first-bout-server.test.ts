import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it } from "vitest";

let child: ChildProcessWithoutNullStreams;
let root: string, base: string, report: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "oddbout-measure-"));
  report = join(root, "report.jsonl");
  await writeFile(join(root, "twitch.html"), "<html><head></head><body>fixture</body></html>");
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["scripts/measure-first-bout.mjs", `--ports=${port}`, `--dir=${root}`, `--out=${report}`]);
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => { throw new Error("Measurement server exited before listening"); }),
  ]);
});
afterEach(async () => {
  if (child?.exitCode === null && child.signalCode === null) { child.kill(); await once(child, "exit"); }
  // Only the unique fixture directory created by mkdtemp above is removed.
  if (root) await rm(root, { recursive: true, force: true });
});

it("preserves Korean diagnostics split across UTF-8 request chunks", async () => {
  const message = "경기 준비 실패";
  const payload = Buffer.from(JSON.stringify({ kind: "error", message }));
  const split = payload.indexOf(Buffer.from("경")) + 1;
  const req = request(`${base}/__profile`, { method: "POST", headers: { Origin: base } });
  const response = once(req, "response");
  req.write(payload.subarray(0, split));
  await delay(40);
  req.end(payload.subarray(split));
  const [res] = await response; res.resume();
  expect(res.statusCode).toBe(204);
  expect(JSON.parse(await readFile(report, "utf8")).message).toBe(message);
});

it("survives a collector request aborted while reading its body", async () => {
  const req = request(`${base}/__profile`, { method: "POST", headers: { Origin: base } });
  req.on("error", () => {});
  req.write('{"kind":');
  await delay(40); req.destroy(); await delay(100);
  expect(child.exitCode).toBeNull();
  const res = await fetch(`${base}/twitch.html`);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
});
