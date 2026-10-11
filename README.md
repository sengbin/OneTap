# OneTap

OneTap 是一个 VS Code 扩展，在底部 Panel 提供工作区文件运行、VS Code 命令和 Copilot Chat 提示词工具箱。

## 功能

- 在底部工具箱按“运行”“消息”“命令”三行管理工具。
- 点击状态栏工具箱图标可打开面板；面板已显示时再次点击可隐藏。
- 在工具箱页面内新增命令和消息、编辑或删除各类别条目，点击条目直接执行。
- 在本地工作区文件上点击右键，选择“添加到工具箱运行项”，即可在专用终端运行；支持多选，不限制文件扩展名，运行时先切换到该文件所属的工作区根目录；同一文件不能重复添加。
- 拖动同一类别中的工具胶囊，或聚焦名称后使用 `Alt+←/→` 可调整顺序，重载后保留。
- 每个类别最多显示两行胶囊；更多条目暂时不显示。
- 通过命令 ID 调用 VS Code 内置命令或其他扩展注册的命令。
- 点击 Copilot 消息后打开聊天并将内容追加到输入框已有内容之后，不自动发送；用户可检查或编辑后自行发送。
- 操作状态显示在三行下方，统一使用绿色消息图标，并在 3 秒倒计时后自动消失。
- 按工作区保存工具项，并支持多根工作区。

## 开发

环境要求：Node.js 22 或更高版本。

```sh
npm install
npm test
```

## 设计文档

- [工具箱三类工具设计](docs/onetap-design.md)

## 许可

本项目采用 Apache-2.0 许可证，详见 [LICENSE](LICENSE)。

## 第三方声明

### Tabler Icons

本扩展 `resources/media/shortcut-view.js` 中的消息、添加、编辑和删除图标路径来自 Tabler Icons（https://github.com/tabler/tabler-icons），按 MIT License 分发。

```text
Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
