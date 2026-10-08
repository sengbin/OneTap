# 开发者工具箱

`vscode-tools` 是一个 VS Code 扩展，可从底部状态栏快速运行工作区 PowerShell 脚本和 VS Code 命令。

## 功能

- 在状态栏统一访问自定义工具。
- 使用 VS Code 原生菜单管理工具项，支持新增、编辑、运行和删除。
- 从当前工作区选择 `.ps1` 脚本并在专用 PowerShell 终端运行。
- 通过命令 ID 调用 VS Code 内置命令或其他扩展注册的命令。
- 按工作区保存菜单项，并支持多根工作区。

## 开发

环境要求：Node.js 22 或更高版本。

```sh
npm install
npm test
```

在 VS Code 中按 F5，或运行“开发者工具箱：启动扩展”启动 Extension Development Host。

## 打包

```sh
npm run package
```

该命令会在仓库根目录生成 `.vsix` 安装包。发布到 Marketplace 还需要具备 `sengbin` Publisher 的发布权限；发布前请参考[发布检查清单](docs/marketplace-release.md)。

## 设计文档

- [自定义状态栏工具菜单设计](docs/custom-status-menu-design.md)

## 许可

本项目采用 Apache-2.0 许可证，详见 [LICENSE](LICENSE)。
