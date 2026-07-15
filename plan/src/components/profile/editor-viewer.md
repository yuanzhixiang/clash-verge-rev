# Profile Editor Viewer

## Profile 格式

- local/remote 主 Profile 原始编辑器跟随当前实际加载文件格式，支持 YAML 与 Surge-style CONF；编辑器模型路径使用实际文件名。
- CONF Profile 的节点和策略组片段使用单行 Surge 风格语法，结构化编辑后保存回 CONF。
- 原始文本编辑保留用户文本；结构化编辑会重新序列化文档，可能重排键并丢失注释。

## Tauri Window Access

`EditorViewer` resolves `getCurrentWebviewWindow()` inside the component instead of at module top level.

This keeps normal Tauri behavior unchanged while allowing browser-only dev modes and tests to install Tauri mocks before the component reads window metadata.
