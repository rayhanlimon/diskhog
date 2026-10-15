import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dirSize, scan, formatBytes, ageDays } from "../src/scan.js";
async function mkproj(files) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dh-"));
  for (const [rel, content] of Object.entries(files)) {
    await fs.promises.mkdir(path.join(dir, path.dirname(rel)), { recursive: true });
    await fs.promises.writeFile(path.join(dir, rel), content);
  }
  return dir;
}
test("dirSize sums bytes and counts files", async () => {
  const d = await mkproj({ "a.txt": "hello", "sub/b.txt": "world!" });
  const r = await dirSize(d);
  assert.equal(r.bytes, 11);
  assert.equal(r.files, 2);
  assert.equal(r.truncated, false);
});
test("dirSize ignores symlinks", async () => {
  const d = await mkproj({ "a.txt": "x" });
  try { await fs.promises.symlink(path.join(d, "a.txt"), path.join(d, "link.txt")); } catch {}
  const r = await dirSize(d);
  assert.equal(r.files, 1);
});
test("scan finds node_modules sorted by size", async () => {
  const root = await mkproj({});
  const p1 = path.join(root, "projA"); const p2 = path.join(root, "projB");
  await fs.promises.mkdir(path.join(p1, "node_modules"), { recursive: true });
  await fs.promises.mkdir(path.join(p2, "node_modules"), { recursive: true });
  await fs.promises.writeFile(path.join(p1, "node_modules", "big.js"), "x".repeat(5000));
  await fs.promises.writeFile(path.join(p2, "node_modules", "small.js"), "x");
  const hits = await scan(root, { maxDepth: 4 });
  assert.equal(hits.length, 2);
  assert.ok(hits[0].bytes >= hits[1].bytes);
  assert.equal(hits[0].target.name, "node_modules");
});
test("scan skips .git contents", async () => {
  const root = await mkproj({});
  await fs.promises.mkdir(path.join(root, ".git", "node_modules"), { recursive: true });
  await fs.promises.writeFile(path.join(root, ".git", "node_modules", "x.js"), "x".repeat(100));
  const hits = await scan(root);
  assert.equal(hits.length, 0);
});
test("scan finds python and rust targets", async () => {
  const root = await mkproj({});
  await fs.promises.mkdir(path.join(root, "py", "__pycache__"), { recursive: true });
  await fs.promises.mkdir(path.join(root, "rs", "target"), { recursive: true });
  await fs.promises.writeFile(path.join(root, "rs", "Cargo.toml"), "[package]");
  await fs.promises.writeFile(path.join(root, "py", "__pycache__", "c.pyc"), "12345");
  await fs.promises.writeFile(path.join(root, "rs", "target", "o"), "1234567890");
  const names = (await scan(root)).map((h) => h.target.name).sort();
  assert.deepEqual(names, ["__pycache__", "target"]);
});
test("formatBytes units", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(5 * 1048576), "5.0 MB");
  assert.equal(formatBytes(3 * 1073741824), "3.0 GB");
});
test("ageDays math", () => {
  const now = Date.now();
  assert.equal(ageDays(now - 86400000 * 5, now), 5);
  assert.equal(ageDays(now + 1000, now), 0);
});
