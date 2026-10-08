# 开发者工具箱

`vscode-tools` 是一个 VS Code 扩展，可从底部状态栏打开工具面板，快速运行工作区 PowerShell 脚本和 VS Code 命令。

## 功能

- 从状态栏打开底部 Panel 工具视图，查看并运行自定义工具。
- 在工具面板查看并运行工具项，使用 VS Code 原生控件新增、编辑和删除。
- 从当前工作区选择 `.ps1` 脚本并在专用 PowerShell 终端运行。
- 通过命令 ID 调用 VS Code 内置命令或其他扩展注册的命令。
- 按工作区保存菜单项，并支持多根工作区。

## 开发

环境要求：Node.js 22 或更高版本。

```sh
npm install
npm test
```

## 设计文档

- [自定义状态栏工具菜单设计](docs/custom-status-menu-design.md)

## 许可

本项目采用 Apache-2.0 许可证，详见 [LICENSE](LICENSE)。
