---
name: clash-verge-vergectl
description: Use the installed `vergectl` command to inspect and control a running Clash Verge app. Use when an agent needs to read Clash Verge status, locate config/log paths, inspect Verge/Clash/runtime config, patch Verge or Clash config through the app backend, read app/core logs, restart the core, create a local backup, or install this skill for future agent sessions.
---

# Clash Verge CLI

## Quick Start

Use `vergectl` instead of editing Clash Verge YAML files directly. It talks to the running app, so config changes go through the same backend side effects as the UI.

Start with:

```bash
vergectl status --json
vergectl paths --json
```

If `vergectl` cannot reach the app, start Clash Verge first. For dev builds, set `VERGECTL_PORT=11233` if auto-detection fails.

## Safe Workflow

1. Read state with `vergectl status --json`.
2. Create a backup before config changes:

```bash
vergectl backup create --json
```

3. Read config before patching:

```bash
vergectl config get verge --json
vergectl config get clash --json
vergectl config get runtime --format yaml
```

4. Patch through the app backend:

```bash
vergectl config patch verge --json '{"enable_system_proxy":true}'
vergectl config patch clash --json '{"mode":"rule"}'
vergectl core restart
```

Do not modify `verge.yaml`, `config.yaml`, or `profiles.yaml` directly unless the app is not running and the user explicitly asks for offline repair.

## Commands

- `vergectl status --json`: app/core status, current Clash ports, version.
- `vergectl paths --json`: config, log, and backup-relevant paths.
- `vergectl config get verge|clash|runtime --format json|yaml`: inspect saved or runtime config.
- `vergectl config patch verge|clash --json '{...}'`: apply a small config patch.
- `vergectl config patch verge|clash --file patch.json|patch.yaml`: apply a patch from a file.
- `vergectl logs app|core --lines 200`: read recent app or core logs.
- `vergectl logs path --json`: get log file locations.
- `vergectl core mode|start|stop|restart`: inspect or control the core.
- `vergectl backup create --json`: create a local backup.
- `vergectl skill install`: install this skill into `${CODEX_HOME:-~/.codex}/skills`.

## Output Rules

Prefer `--json` when another tool or script will consume output. Exit codes:

- `0`: success.
- `2`: Clash Verge is not reachable.
- `3`: invalid CLI arguments or patch input.
- `4`: app/backend error.
