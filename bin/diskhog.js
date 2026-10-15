#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scan, formatBytes, ageDays } from "../src/scan.js";
const VERSION = "0.1.0";
function help() {
  console.log("diskhog " + VERSION + " - find dev disk hogs (node_modules, target, venvs, build caches)");
  console.log("");
  console.log("Usage:");
  console.log("  diskhog [dir] [--json] [--min 100MB] [--older-than 30d] [--max-depth 6]");
  console.log("  diskhog clean [dir] --older-than 30d [--apply] [--quarantine DIR]");
  console.log("");
  console.log("Scan only REPORTS. Nothing is deleted without --apply.");
  console.log("clean moves (never deletes), requires --older-than, skips .git, never follows symlinks.");
}
function fail(msg) { console.error("diskhog: " + msg); process.exit(2); }
function parseSize(s) {
  const m = /^([0-9]+(?:\.[0-9]+)?)\s*([kmgt]?b?)?$/i.exec(String(s).trim());
  if (!m) fail("Bad size: " + JSON.stringify(s) + " (e.g. 100MB)");
  const mult = { "": 1, b: 1, k: 1024, kb: 1024, m: 1048576, mb: 1048576, g: 1073741824, gb: 1073741824 };
  const key = (m[2] || "").toLowerCase();
  if (!(key in mult)) fail("Bad size suffix: " + m[2]);
  return Math.floor(Number(m[1]) * mult[key]);
}
function parseAge(s) {
  const m = /^([0-9]+)\s*([hdwmy]?)$/i.exec(String(s).trim());
  if (!m) fail("Bad age: " + JSON.stringify(s) + " (e.g. 30d)");
  const mult = { "": 24, h: 1, d: 24, w: 168, m: 720, y: 8760 };
  return Number(m[1]) * (mult[(m[2] || "").toLowerCase()] || 24);
}
function parseArgs(argv) {
  const a = { cmd: "scan", dir: process.cwd(), json: false, minBytes: 1048576, olderHours: null, maxDepth: 6, apply: false, quarantine: path.join(os.homedir(), ".cache", "diskhog-quarantine") };
  const rest = [...argv];
  if (rest[0] === "clean" || rest[0] === "scan") a.cmd = rest.shift();
  while (rest.length) {
    const t = rest.shift();
    if (t === "--help" || t === "-h") { help(); process.exit(0); }
    else if (t === "--version" || t === "-v") { console.log(VERSION); process.exit(0); }
    else if (t === "--json") a.json = true;
    else if (t === "--apply") a.apply = true;
    else if (t === "--min") a.minBytes = parseSize(rest.shift());
    else if (t === "--older-than") a.olderHours = parseAge(rest.shift());
    else if (t === "--max-depth") a.maxDepth = Number(rest.shift());
    else if (t === "--quarantine") a.quarantine = rest.shift();
    else if (t.startsWith("--min=")) a.minBytes = parseSize(t.slice(6));
    else if (t.startsWith("--older-than=")) a.olderHours = parseAge(t.slice(13));
    else if (t.startsWith("--max-depth=")) a.maxDepth = Number(t.slice(12));
    else if (t.startsWith("--quarantine=")) a.quarantine = t.slice(13);
    else if (t.startsWith("-")) fail("Unknown option: " + t);
    else a.dir = t;
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const hits = await scan(args.dir, { maxDepth: args.maxDepth });
const now = Date.now();
let rows = hits.filter((h) => h.bytes >= args.minBytes);
if (args.olderHours != null) {
  const cutoff = now - args.olderHours * 3600000;
  rows = rows.filter((h) => (h.projectMtime || 0) <= cutoff);
}
const total = rows.reduce((s, h) => s + h.bytes, 0);
if (args.cmd === "scan") {
  if (args.json) {
    console.log(JSON.stringify({ root: path.resolve(args.dir), totalBytes: total, entries: rows }, null, 2));
  } else if (!rows.length) {
    console.log("diskhog: nothing reclaimable found.");
  } else {
    console.log("diskhog: " + formatBytes(total) + " reclaimable in " + rows.length + " directorie(s) under " + path.resolve(args.dir));
    for (const h of rows) {
      const age = ageDays(h.projectMtime || now, now);
      console.log("  " + formatBytes(h.bytes).padStart(9) + "  " + h.path + "  [" + h.target.name + ", idle ~" + age + "d]");
    }
    console.log("Dry run only - nothing deleted. Clean with: diskhog clean DIR --older-than 30d --apply");
  }
} else {
  if (args.olderHours == null) fail("clean requires --older-than (e.g. --older-than 30d) as a safety rail");
  if (!rows.length) { console.log("diskhog: nothing to clean."); process.exit(0); }
  if (args.apply) await fs.promises.mkdir(args.quarantine, { recursive: true });
  for (const h of rows) {
    const stamp = path.basename(h.project) + "-" + h.target.name + "-" + Date.now();
    const dest = path.join(args.quarantine, stamp);
    if (!args.apply) { console.log("  [dry-run] would move " + h.path + " (" + formatBytes(h.bytes) + ") -> " + dest); continue; }
    try { await fs.promises.rename(h.path, dest); console.log("  moved " + h.path + " -> " + dest); }
    catch (e) { console.error("  FAILED " + h.path + ": " + (e && e.message)); process.exitCode = 1; }
  }
  if (!args.apply) console.log("Dry run only - re-run with --apply to move to quarantine.");
  else console.log("Moved to quarantine: " + args.quarantine);
}
