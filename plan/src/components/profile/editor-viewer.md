# Profile Editor Viewer

## Tauri Window Access

`EditorViewer` resolves `getCurrentWebviewWindow()` inside the component instead of at module top level.

This keeps normal Tauri behavior unchanged while allowing browser-only dev modes and tests to install Tauri mocks before the component reads window metadata.
