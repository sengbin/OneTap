// ------------------------------------------------------------------------
// 名称：tool-executor.ts
// 说明：运行从资源管理器添加的工作区文件、VS Code 命令或预填 Copilot 消息。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-09
// 备注：文件必须位于本地工作区内，不限制扩展名。
// ------------------------------------------------------------------------

import * as vscode from 'vscode';
import { ToolItem, quotePowerShellPath } from './tool-item';
import { resolveFileInWorkspace } from './workspace-file';

/** 扩展创建的 PowerShell 集成终端名称。 */
const TERMINAL_NAME = '工具箱 PowerShell';

/** 执行工具箱中的三类工具项。 */
export class ToolExecutor {
  /** 本实例创建的终端引用，用于避免误用用户创建的同名终端。 */
  private terminal: vscode.Terminal | undefined;

  /**
   * 根据工具类别执行目标。
   * @param item 要执行的工具项。
   * @returns 执行调度完成后的异步操作。
   * @throws 命令、聊天或工作区文件执行失败时抛出错误，由 Webview 显示。
   */
  public async execute(item: ToolItem): Promise<void> {
    if (item.type === 'vscodeCommand') {
      await vscode.commands.executeCommand(item.commandId);
      return;
    }

    if (item.type === 'copilotMessage') {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: item.message,
        isPartialQuery: true,
      });
      return;
    }

    await this.executeWorkspaceFile(item);
  }

  /** 校验工作区文件位置后，将调用发送至专用终端，不按扩展名拒绝。 */
  private async executeWorkspaceFile(item: Extract<ToolItem, { type: 'terminalFile' }>): Promise<void> {
    // 通过 URI 精确定位文件所属工作区，不依赖当前活动编辑器或工作区顺序。
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      (folder) => folder.uri.toString() === item.workspaceFolderUri,
    );
    if (!workspaceFolder || workspaceFolder.uri.scheme !== 'file') {
      throw new Error('文件所属的本地工作区文件夹已不可用。');
    }

    // 运行前重新校验文件仍位于工作区内，阻止借符号链接或被替换的路径越界。
    const { realFilePath } = await resolveFileInWorkspace(workspaceFolder.uri.fsPath, item.relativePath);

    // 终端被多个工作区或多次运行复用，先切回所属工作区根目录，保证脚本的相对路径稳定；发送调用不代表文件已成功结束。
    const terminal = this.getTerminal();
    terminal.show(true);
    terminal.sendText(
      `Set-Location -LiteralPath ${quotePowerShellPath(workspaceFolder.uri.fsPath)}; & ${quotePowerShellPath(realFilePath)}`,
      true,
    );
  }

  /** 查找扩展终端；不存在时按当前平台启动 PowerShell。 */
  private getTerminal(): vscode.Terminal {
    // 仅复用本实例持有且仍打开的终端，不按可冲突的显示名称查找用户终端。
    if (this.terminal && vscode.window.terminals.includes(this.terminal)) {
      return this.terminal;
    }

    this.terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      shellPath: process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
      shellArgs: ['-NoLogo'],
    });
    return this.terminal;
  }
}