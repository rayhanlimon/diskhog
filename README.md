# diskhog

Zero-dependency dev disk cleanup scanner: find `node_modules`, Rust `target/`, Python venvs and build caches eating your disk — then quarantine-clean them with safety rails.

Developers keep asking where their disk space went ([maccleaner.io](https://maccleaner.io/blog/node-modules-npm-cache-cleanup.html), [cluttered.dev](https://www.cluttered.dev/blog/developer-disk-space), [burrow.computer](https://burrow.computer/blog/node-modules-eating-your-disk)): forgotten `node_modules` in archived projects, stale `target/` dirs, old venvs. Generic tools (`ncdu`) show blobs; `npkill` only handles node. diskhog is project-aware, multi-ecosystem, and safe by default.

## What it does

- `scan` (default) — REPORTS reclaimable dirs sorted by size, with project idle age; never deletes
- `clean --older-than 30d` — moves stale dirs to quarantine (never `rm -rf`)
- `--apply` required to move anything; without it every clean is a dry-run
- 12 target kinds: `node_modules`, `target` (guard: Cargo.toml), `__pycache__`, `.venv`/`venv`, `.next`, `dist`, `build`, `coverage`, `.pytest_cache`, `.turbo`, `.parcel-cache`
- `--min SIZE`, `--older-than AGE`, `--max-depth`, `--json` for scripts
- Skips `.git`, never follows symlinks

## Install

Requires Node 18+. No dependencies.

```sh
npm install -g diskhog
# or from source:
git clone https://github.com/rayhanlimon/diskhog && cd diskhog
node bin/diskhog.js --help
```

## Usage

```sh
# where did my disk go?
diskhog ~/code
# diskhog: 8.4 GB reclaimable in 23 directorie(s) under /home/you/code
#   1.2 GB  /home/you/code/old-app/node_modules  [node_modules, idle ~210d]

# preview the clean (moves nothing)
diskhog clean ~/code --older-than 90d

# actually quarantine them (restore = move back)
diskhog clean ~/code --older-than 90d --apply

# scripting
diskhog ~/code --json | jq .totalBytes
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | ok |
| 1 | a move failed mid-clean |
| 2 | usage error (incl. clean without `--older-than`) |

## Safety model

- Scan never touches the filesystem beyond reading.
- clean REQUIRES `--older-than` (no bulk delete of active projects by accident).
- Moves to quarantine (`~/.cache/diskhog-quarantine`), never deletes — restore by moving back, purge with `rm` when sure.
- Skips `.git` dirs, never follows symlinks.

## Limitations

- TCP of disk tools: sizes are summed file bytes (not `du` blocks); APFS/sparse files may differ.
- No Docker overlay / Xcode DerivedData scanning yet (roadmap).
- `project idle` = parent dir mtime heuristic, not git activity.

## Roadmap

- [ ] Docker overlay + buildx cache entries
- [ ] Xcode DerivedData + Gradle caches
- [ ] `restore` command (move back from quarantine by id)

## Development

```sh
npm test   # node --test test/*.test.js (15 tests, zero deps)
```

## License

MIT — see [LICENSE](LICENSE).
