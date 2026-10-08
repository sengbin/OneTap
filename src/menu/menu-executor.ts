// ------------------------------------------------------------------------
// 名称：menu-executor.ts
// 说明：运行从资源管理器添加的工作区文件、VS Code 命令或预填 Copilot 消息。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-09
// 备注：文件必须位于本地工作区内，不限制扩展名。
// ------------------------------------------------------------------------

import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CustomMenuItem, isPathWithinFolder, quotePowerShellPath } from './menu-item';

/** 扩展创建的 PowerShell 集成终端名称。 */
const TERMINAL_NAME = '工具箱 PowerShell';

/** 执行工具箱中的三类工具项。 */
export class MenuExecutor {
  /** 本实例创建的终端引用，用于避免误用用户创建的同名终端。 */
  private terminal: vscode.Terminal | undefined;

  /**
   * 根据工具类别执行目标。
   * @param item 要执行的工具项。
   * @returns 执行调度完成后的异步操作。
  * @throws 命令、聊天或工作区文件执行失败时抛出错误，由 Webview 显示。
   */
  public async execute(item: CustomMenuItem): Promise<void> {
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
  private async executeWorkspaceFile(item: Extract<CustomMenuItem, { type: 'terminalFile' }>): Promise<void> {
    // 通过 URI 精确定位文件所属工作区，不依赖当前活动编辑器或工作区顺序。
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      (folder) => folder.uri.toString() === item.workspaceFolderUri,
    );
    if (!workspaceFolder || workspaceFolder.uri.scheme !== 'file') {
      throw new Error('文件所属的本地工作区文件夹已不可用。');
    }

    // 先校验词法路径，再解析符号链接后的真实路径，防止文件借链接逃离工作区。
    const rootPath = await fileSystem.realpath(workspaceFolder.uri.fsPath);
    const candidatePath = path.resolve(rootPath, item.relativePath);
    if (!isPathWithinFolder(rootPath, candidatePath)) {
      throw new Error('文件路径超出了工作区范围。');
    }

    let realFilePath: string;
    try {
      realFilePath = await fileSystem.realpath(candidatePath);
    } catch {
      throw new Error('目标文件不存在，或无法读取。');
    }
    if (!isPathWithinFolder(rootPath, realFilePath)) {
      throw new Error('文件实际位置位于工作区之外，已阻止运行。');
    }

    const fileInfo = await fileSystem.stat(realFilePath);
    if (!fileInfo.isFile()) {
      throw new Error('目标不是工作区中的文件。');
    }

    // 使用专属终端展示输出；发送调用不代表文件已成功结束。
    const terminal = this.getTerminal(workspaceFolder.uri.fsPath);
    terminal.show(true);
    terminal.sendText(`& ${quotePowerShellPath(realFilePath)}`, true);
  }

  /** 查找扩展终端；不存在时按当前平台启动 PowerShell。 */
  private getTerminal(workingDirectory: string): vscode.Terminal {
    // 仅复用本实例持有且仍打开的终端，不按可冲突的显示名称查找用户终端。
    if (this.terminal && vscode.window.terminals.includes(this.terminal)) {
      return this.terminal;
    }

    this.terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      shellPath: process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
      shellArgs: ['-NoLogo'],
      cwd: workingDirectory,
    });
    return this.terminal;
  }
}