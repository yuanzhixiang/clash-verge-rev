---
name: clash-verge-vergectl
description: Use the installed `vergectl` command to inspect and control a running Clash Verge app. Use when an agent needs Clash Verge status, paths, logs, profiles, proxies, connections, rules, DNS, runtime config, backups, diagnostics, service/core control, or safe config changes through the app backend.
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

1. Prefer read-only commands first: `status`, `paths`, `profiles list`, `proxies list`, `connections list`, `rules list`.
2. Create a backup before config changes:

```bash
vergectl backup local create --json
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

Ask for explicit user intent before destructive or disruptive commands: `delete`, `restore`, `restart`, `exit`, `service install|uninstall|repair|reinstall`, `config patch`, `profiles patch|save-file`, `connections close-all`, and WebDAV/local backup restore.

Do not modify `verge.yaml`, `config.yaml`, or `profiles.yaml` directly unless the app is not running and the user explicitly asks for offline repair.

## Commands

- `vergectl status --json`: app/core status, current Clash ports, version.
- `vergectl paths --json`: config, profile, runtime, and log paths.
- `vergectl app info|paths|restart|exit|diagnostics export|open app|core|logs`: app metadata, diagnostics, lifecycle, and folders.
- `vergectl system hostname|interfaces|interfaces-info|proxy get|auto-proxy get|port-in-use <port>|auto-launch get`: local system state.
- `vergectl service status|install|uninstall|repair|reinstall`: service/sidecar management.
- `vergectl config get verge|clash|runtime --format json|yaml`: inspect saved or runtime config.
- `vergectl config patch verge|clash --json '{...}'` or `--file patch.json|patch.yaml`: apply a small config patch.
- `vergectl clash info|mode get|mode set <mode>|core get|core set <core>|delay <url>`: Clash core config and checks.
- `vergectl clash dns get|save|apply|validate|exists`: DNS config file flow.
- `vergectl runtime get|yaml|exists|logs|proxy-chain get <node>|proxy-chain set --file <yaml|json>`: runtime helpers.
- `vergectl profiles list|import|create|update|delete|reorder|patch|read-file|save-file|enhance|next-update`: profile management.
- `vergectl proxies list|groups|providers|group <name>|node <name>|provider <name>|select <group> <node>|delay <node>|delay-group <group>|healthcheck-provider <name>|update-provider <name>`: proxy and provider management.
- `vergectl connections list|close <id>|close-all`: connection inspection and closure.
- `vergectl rules list|providers|update-provider <name|--all>`: rules and rule providers.
- `vergectl unlock list|check`: streaming unlock items and checks.
- `vergectl backup create` and `vergectl backup local create|list|delete|restore|import|export`: local backups.
- `vergectl backup webdav config|create|list|delete|restore`: WebDAV backups.
- `vergectl validate script --file <path>`: script validation.
- `vergectl watch traffic|memory|logs|connections [--interval 1]`: line-delimited JSON polling; stop with Ctrl-C.
- `vergectl skill install`: install this skill into `${CODEX_HOME:-~/.codex}/skills`.

## Output Rules

Prefer `--json` when another tool or script will consume output. Exit codes:

- `0`: success.
- `2`: Clash Verge is not reachable.
- `3`: invalid CLI arguments or patch input.
- `4`: app/backend error.
