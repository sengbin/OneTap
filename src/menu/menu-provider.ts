// ------------------------------------------------------------------------
// 名称：menu-provider.ts
// 说明：呈现状态栏菜单和原生管理流程，并协调存储与工具执行。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：无
// ------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CustomMenuItem, isPathWithinFolder, validateMenuItemName } from './menu-item';
import { MenuExecutor } from './menu-executor';
import { MenuStore } from './menu-store';

interface ManagementChoice extends vscode.QuickPickItem {
  /** 选择后要执行的列表管理动作。 */
  action: 'add' | 'select';
  /** 进入管理流程的已有工具项。 */
  menuItem?: CustomMenuItem;
}

interface ScriptTarget {
  /** 所选脚本所属工作区文件夹的 URI 字符串。 */
  workspaceFolderUri: string;
  /** 相对工作区根目录的脚本路径。 */
  relativePath: string;
}

/** 提供自定义工具项管理交互，并协调存储与执行。 */
export class MenuProvider {
  /**
   * 创建菜单提供器。
   * @param store 工作区菜单存储。
   * @param executor 菜单项执行器。
   */
  constructor(
    private readonly store: MenuStore,
    private readonly executor: MenuExecutor,
  ) {}

  /**
   * 打开管理列表并处理新增、编辑、运行和删除操作。
   * @returns 用户退出管理流程后的异步操作。
   */
  public async manageItems(): Promise<void> {
    // 每次操作后重新读取列表，确保增加、编辑或删除结果立即反映在菜单中。
    while (true) {
      const items = this.readItemsOrNotify();
      if (!items) {
        return;
      }

      const choices: ManagementChoice[] = [
        { label: '$(add) 新增工具...', action: 'add' },
        ...items.map((item) => ({
          label: item.name,
          description: item.type === 'script' ? 'PowerShell 脚本' : item.commandId,
          action: 'select' as const,
          menuItem: item,
        })),
      ];
      const selected = await vscode.window.showQuickPick(choices, {
        placeHolder: '选择工具项进行管理',
        title: '管理自定义工具',
      });

      if (!selected) {
        return;
      }

      if (selected.action === 'add') {
        await this.createItem();
        continue;
      }

      if (selected.menuItem && !(await this.manageItem(selected.menuItem))) {
        return;
      }
    }
  }

  /**
   * 直接打开指定菜单项的运行、编辑和删除操作。
   * @param itemId 菜单项的稳定标识。
   * @returns 管理操作结束后的异步流程。
   */
  public async manageItemById(itemId: string): Promise<void> {
    const item = this.readItemsOrNotify()?.find((storedItem) => storedItem.id === itemId);
    if (!item) {
      void vscode.window.showWarningMessage('该工具项已不存在，请刷新工具菜单。');
      return;
    }

    await this.manageItem(item);
  }

  /** 显示管理动作；返回 false 表示用户取消整个管理流程。 */
  private async manageItem(item: CustomMenuItem): Promise<boolean> {
    const action = await vscode.window.showQuickPick(['运行', '编辑', '删除'], {
      placeHolder: `管理“${item.name}”`,
      title: '工具项操作',
    });
    if (!action) {
      return false;
    }

    // 编辑沿用原 ID 和列表位置，删除仅在显式确认后写入存储。
    if (action === '运行') {
      await this.executor.execute(item);
    } else if (action === '编辑') {
      await this.createItem(item);
    } else if (action === '删除') {
      const confirmation = await vscode.window.showWarningMessage(
        `确定删除“${item.name}”吗？`,
        { modal: true },
        '删除',
      );
      if (confirmation === '删除') {
        await this.runStoreAction(() => this.store.removeItem(item.id));
      }
    }

    return true;
  }

  /** 收集并保存一项新的工具，或替换已有工具。 */
  private async createItem(existingItem?: CustomMenuItem): Promise<void> {
    // 名称在输入阶段校验，阻止空名称和忽略大小写后的重复名称。
    const name = await vscode.window.showInputBox({
      title: existingItem ? '编辑工具名称' : '新建工具',
      prompt: '输入菜单项名称',
      value: existingItem?.name,
      validateInput: (value) => {
        const error = validateMenuItemName(value);
        if (error) {
          return error;
        }

        let storedItems: CustomMenuItem[];
        try {
          storedItems = this.store.getItems();
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }

        const duplicate = storedItems.some((item) =>
          item.id !== existingItem?.id && item.name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
        );
        return duplicate ? '该名称已被其他工具项使用。' : undefined;
      },
    });
    if (name === undefined) {
      return;
    }

    // 取消任何一步都会提前返回，因此不会保存只有部分字段的菜单项。
    const typeChoices = [
      { label: '工作区 PowerShell 脚本', type: 'script' as const },
      { label: 'VS Code 命令', type: 'command' as const },
    ];
    const selectedType = await vscode.window.showQuickPick(typeChoices, {
      title: '选择工具类型',
      placeHolder: '选择工具项要执行的操作',
    });
    if (!selectedType) {
      return;
    }

    let item: CustomMenuItem;
    if (selectedType.type === 'script') {
      const scriptTarget = await this.chooseScriptTarget();
      if (!scriptTarget) {
        return;
      }

      item = {
        id: existingItem?.id ?? randomUUID(),
        name: name.trim(),
        type: 'script',
        script: scriptTarget,
      };
    } else {
      const commandId = await this.chooseCommandId(existingItem);
      if (!commandId) {
        return;
      }

      item = {
        id: existingItem?.id ?? randomUUID(),
        name: name.trim(),
        type: 'command',
        commandId,
      };
    }

    const saved = await this.runStoreAction(() => existingItem
      ? this.store.updateItem(item)
      : this.store.addItem(item));
    if (saved) {
      void vscode.window.showInformationMessage(`已保存工具“${item.name}”。`);
    }
  }

  /** 选择本地工作区和其中的 PowerShell 脚本。 */
  private async chooseScriptTarget(): Promise<ScriptTarget | undefined> {
    // 终端执行依赖本地绝对路径，故不把远程或虚拟工作区当作可运行脚本来源。
    const workspaceFolders = vscode.workspace.workspaceFolders?.filter((folder) => folder.uri.scheme === 'file') ?? [];
    if (workspaceFolders.length === 0) {
      void vscode.window.showWarningMessage('请先打开一个本地工作区文件夹，再添加 PowerShell 脚本。');
      return undefined;
    }

    // 多根工作区必须显式选根目录，不能假定第一个工作区就是目标文件的归属。
    let workspaceFolder = workspaceFolders[0];
    if (workspaceFolders.length > 1) {
      const selectedFolder = await vscode.window.showQuickPick(
        workspaceFolders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
        { title: '选择脚本所属工作区' },
      );
      if (!selectedFolder) {
        return undefined;
      }

      workspaceFolder = selectedFolder.folder;
    }

    const selectedFiles = await vscode.window.showOpenDialog({
      title: '选择工作区 PowerShell 脚本',
      defaultUri: workspaceFolder.uri,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { PowerShell: ['ps1'] },
    });
    const selectedFile = selectedFiles?.[0];
    if (!selectedFile) {
      return undefined;
    }

    // 解析真实路径并确认文件存在，使符号链接和文件删除都在保存前被检查。
    let rootPath: string;
    let realScriptPath: string;
    let fileInfo: Awaited<ReturnType<typeof fileSystem.stat>>;
    try {
      rootPath = await fileSystem.realpath(workspaceFolder.uri.fsPath);
      realScriptPath = await fileSystem.realpath(selectedFile.fsPath);
      fileInfo = await fileSystem.stat(realScriptPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`无法读取所选脚本：${detail}`);
      return undefined;
    }

    // 文件选择器的初始目录不是安全边界，仍需做真实路径包含校验。
    if (!isPathWithinFolder(rootPath, realScriptPath)) {
      void vscode.window.showErrorMessage('只能选择位于所选工作区文件夹中的脚本。');
      return undefined;
    }

    if (!fileInfo.isFile() || path.extname(realScriptPath).toLocaleLowerCase() !== '.ps1') {
      void vscode.window.showErrorMessage('所选目标不是有效的 PowerShell 脚本文件。');
      return undefined;
    }

    return {
      workspaceFolderUri: workspaceFolder.uri.toString(),
      relativePath: path.relative(rootPath, realScriptPath),
    };
  }

  /** 输入命令 ID，并提示当前 VS Code 尚未注册的命令。 */
  private async chooseCommandId(existingItem?: CustomMenuItem): Promise<string | undefined> {
    const commandId = await vscode.window.showInputBox({
      title: '设置 VS Code 命令',
      prompt: '输入命令 ID，例如 workbench.action.reloadWindow',
      value: existingItem?.type === 'command' ? existingItem.commandId : undefined,
      validateInput: (value) => value.trim().length === 0 ? '命令 ID 不能为空。' : undefined,
    });
    if (commandId === undefined) {
      return undefined;
    }

    // 命令可能由尚未激活的扩展提供；未注册时允许用户确认后保存。
    const normalizedCommandId = commandId.trim();
    const registeredCommands = await vscode.commands.getCommands();
    if (!registeredCommands.includes(normalizedCommandId)) {
      const choice = await vscode.window.showWarningMessage(
        `当前未检测到命令“${normalizedCommandId}”。仍要保存吗？`,
        '仍然保存',
      );
      if (choice !== '仍然保存') {
        return undefined;
      }
    }

    return normalizedCommandId;
  }

  /** 读取菜单项并在数据损坏时显示可理解的错误。 */
  private readItemsOrNotify(): CustomMenuItem[] | undefined {
    try {
      return this.store.getItems();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(detail);
      return undefined;
    }
  }

  /** 执行存储操作并统一反馈失败原因。 */
  private async runStoreAction(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`无法保存工具项：${detail}`);
      return false;
    }
  }
}