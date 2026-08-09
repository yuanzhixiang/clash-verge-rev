# Main Entry

## Remote App Dev Bridge

`main.tsx` calls `setupRemoteBridge()` before `preloadAppData()` so `pnpm web:remote` can install Tauri mocks before runtime `invoke` calls read app config.

This is dev-only and gated by `VITE_VERGE_REMOTE_APP=1`; normal Tauri dev/build behavior is unchanged.

Mihomo websocket cleanup is fire-and-forget with a caught promise so browser-only dev mode does not surface unhandled rejections if cleanup runs before the bridge is ready.
