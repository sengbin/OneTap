# Marketplace 发布检查清单

本仓库已配置 VS Code 扩展清单、中文展示名称、图标、许可证、仓库地址、编译脚本和 VSIX 打包脚本。当前版本为 `0.1.0`，Publisher ID 暂设为 `sengbin`，依据仓库 GitHub 所有者填写；它必须与实际 Marketplace Publisher 账号一致。

## 本地打包

```sh
npm install
npm test
npm run package
```

打包成功后，根目录会生成 `vscode-tools-0.1.0.vsix`。在 VS Code 中运行“Extensions: Install from VSIX...”可进行安装验证。

## 发布前账号准备

1. 在 Visual Studio Marketplace 管理页面创建或确认 Publisher ID `sengbin`，并确认当前账号具有该 Publisher 的发布权限。
2. 确认扩展完整标识 `sengbin.vscode-tools` 可用，并在 Publisher 管理页检查扩展名称、展示名称和图标预览。
3. 复核版本号、README、许可证、更新日志、分类、关键词和 VSIX 文件清单。
4. 完成本地安装验证后，由具备权限的发布者通过 Marketplace 管理页面上传 VSIX，或按 Microsoft 当前推荐的身份认证方式配置自动化发布。

扩展市场搜索结果中已存在其他发布者的 `vscode-tools` 项目。Marketplace 的名称和 ID 校验可能影响首次发布；本项目仍保留用户指定的 manifest `name`，最终可用性以 Publisher 管理页面的校验结果为准。此代码库不保存 Publisher 凭据，也不会自动发布。