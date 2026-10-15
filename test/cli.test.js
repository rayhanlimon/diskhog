import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function run(bin, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [bin, ...args], { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ code: (err && err.code != null) ? err.code : 0, out: String(stdout), errText: String(stderr) });
    });
  });
}
const BIN = new URL("../bin/diskhog.js", import.meta.url).pathname;
async function mkRoot() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dhcli-"));
  await fs.promises.mkdir(path.join(root, "proj", "node_modules"), { recursive: true });
  await fs.promises.writeFile(path.join(root, "proj", "node_modules", "a.js"), "x".repeat(3000));
  return root;
}
test("scan reports reclaimable and exits 0", async () => {
  const root = await mkRoot();
  const r = await run(BIN, [root, "--min", "1KB"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /reclaimable/);
  assert.match(r.out, /node_modules/);
});
test("scan --json is valid JSON with totalBytes", async () => {
  const root = await mkRoot();
  const r = await run(BIN, [root, "--json", "--min", "1B"]);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.ok(j.totalBytes >= 3000);
  assert.equal(j.entries.length, 1);
});
test("clean dry-run moves nothing", async () => {
  const root = await mkRoot();
  const r = await run(BIN, ["clean", root, "--older-than", "0h", "--min", "1B"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /dry-run/);
  assert.ok(fs.existsSync(path.join(root, "proj", "node_modules")));
});
test("clean requires --older-than", async () => {
  const root = await mkRoot();
  const r = await run(BIN, ["clean", root]);
  assert.equal(r.code, 2);
  assert.match(r.errText, /requires --older-than/);
});
test("clean --apply quarantines and restores", async () => {
  const root = await mkRoot();
  const q = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dhq-"));
  const r = await run(BIN, ["clean", root, "--older-than", "0h", "--apply", "--quarantine", q, "--min", "1B"]);
  assert.equal(r.code, 0);
  assert.ok(!fs.existsSync(path.join(root, "proj", "node_modules")));
  assert.ok((await fs.promises.readdir(q)).length >= 1);
});
test("empty dir says nothing found", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dhempty-"));
  const r = await run(BIN, [root]);
  assert.equal(r.code, 0);
  assert.match(r.out, /nothing reclaimable/);
});
test("--help and --version", async () => {
  const h = await run(BIN, ["--help"]);
  assert.equal(h.code, 0);
  assert.match(h.out, /diskhog/);
  const v = await run(BIN, ["--version"]);
  assert.match(v.out.trim(), /^\d+\.\d+\.\d+$/);
});
test("unknown option exits 2", async () => {
  const r = await run(BIN, ["--bogus"]);
  assert.equal(r.code, 2);
});
test("unwritable quarantine exits 2 with helpful message", async () => {
  const root = await mkRoot();
  const r = await run(BIN, ["clean", root, "--older-than", "0h", "--apply", "--quarantine", "/sys/nope-dh", "--min", "1B"]);
  assert.equal(r.code, 2);
  assert.match(r.errText, /quarantine/);
  assert.ok(fs.existsSync(path.join(root, "proj", "node_modules")));
});
