// ------------------------------------------------------------------------
// 名称：menu-executor.ts
// 说明：执行 VS Code 命令，或在专用 PowerShell 终端运行工作区脚本。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：脚本必须是本地工作区内的 PowerShell 文件。
// ------------------------------------------------------------------------

import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CustomMenuItem, isPathWithinFolder, quotePowerShellPath } from './menu-item';

/** 扩展创建的 PowerShell 集成终端名称。 */
const TERMINAL_NAME = '开发者工具箱 PowerShell';

/** 执行状态栏菜单中的命令或 PowerShell 脚本。 */
export class MenuExecutor {
  /** 本实例创建的终端引用，用于避免误用用户创建的同名终端。 */
  private terminal: vscode.Terminal | undefined;

  /**
   * 根据菜单项类型执行目标。
   * @param item 要运行的菜单项。
   * @returns 执行调度完成后的异步操作。
  * @remarks 执行失败时通过 VS Code 错误提示反馈，不向扩展宿主抛出异常。
   */
  public async execute(item: CustomMenuItem): Promise<void> {
    try {
      if (item.type === 'command') {
        await vscode.commands.executeCommand(item.commandId);
        return;
      }

      await this.executeScript(item);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`运行“${item.name}”失败：${detail}`);
    }
  }

  /** 校验工作区脚本位置后，将 PowerShell 调用发送至专用终端。 */
  private async executeScript(item: Extract<CustomMenuItem, { type: 'script' }>): Promise<void> {
    // 通过 URI 精确定位脚本所属工作区，不依赖当前活动编辑器或工作区顺序。
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      (folder) => folder.uri.toString() === item.script.workspaceFolderUri,
    );
    if (!workspaceFolder || workspaceFolder.uri.scheme !== 'file') {
      throw new Error('脚本所属的本地工作区文件夹已不可用。');
    }

    // 先校验词法路径，再解析符号链接后的真实路径，防止脚本借链接逃离工作区。
    const rootPath = await fileSystem.realpath(workspaceFolder.uri.fsPath);
    const scriptPath = path.resolve(rootPath, item.script.relativePath);
    if (!isPathWithinFolder(rootPath, scriptPath)) {
      throw new Error('脚本路径超出了工作区范围。');
    }

    const realScriptPath = await fileSystem.realpath(scriptPath);
    if (!isPathWithinFolder(rootPath, realScriptPath)) {
      throw new Error('脚本实际文件位于工作区之外，已阻止运行。');
    }

    // 执行前重新确认目标仍是存在的 PowerShell 文件，覆盖保存后文件被移动或删除的情况。
    const fileInfo = await fileSystem.stat(realScriptPath);
    if (!fileInfo.isFile() || path.extname(realScriptPath).toLocaleLowerCase() !== '.ps1') {
      throw new Error('目标文件不存在，或不是 PowerShell 脚本。');
    }

    // 使用专属终端展示脚本输出；发送命令不代表脚本已成功结束。
    const terminal = this.getTerminal(workspaceFolder.uri.fsPath);
    terminal.show(true);
    terminal.sendText(`& ${quotePowerShellPath(realScriptPath)}`, true);
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