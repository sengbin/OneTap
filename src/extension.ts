// ------------------------------------------------------------------------
// 名称：extension.ts
// 说明：注册状态栏快捷入口和工具箱底部 Panel WebviewView。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-09
// 备注：工具箱由扩展贡献的 Panel WebviewView 承载。
// ------------------------------------------------------------------------

import * as vscode from 'vscode';
import { MenuExecutor } from './menu/menu-executor';
import { MenuStore } from './menu/menu-store';
import { MenuViewProvider } from './menu/menu-view-provider';

/** 底部 Panel WebviewView 的标识。 */
const MENU_VIEW_ID = 'workspaceToolbox.menuView';
/** 底部工具箱容器的标识，用于从状态栏打开对应 Panel。 */
const PANEL_CONTAINER_ID = 'workspaceToolboxPanel';
/** 状态栏图标使用的扩展命令 ID。 */
const OPEN_TOOLS_COMMAND_ID = 'workspaceToolbox.openTools';
/** 文件资源管理器右键添加运行项的命令 ID。 */
const ADD_WORKSPACE_FILE_COMMAND_ID = 'workspaceToolbox.addWorkspaceFile';
/** 状态栏入口放在右侧项目组靠前的位置。 */
const STATUS_BAR_PRIORITY = Number.MAX_SAFE_INTEGER;

/**
 * 激活扩展并注册工具箱面板。
 * @param context VS Code 扩展上下文，用于管理扩展资源生命周期。
 * @remarks 面板管理、列表与工具执行均通过 Webview 消息处理。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new MenuStore(context.workspaceState);
  try {
    await store.migrateLegacyItems();
  } catch {
    // 面板读取时会将存储错误显示在 Webview，不阻止工具箱打开。
  }

  const executor = new MenuExecutor();
  const menuViewProvider = new MenuViewProvider(context, store, executor);
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, STATUS_BAR_PRIORITY);
  statusBarItem.text = '$(workspace-toolbox-logo)';
  statusBarItem.name = '工具箱';
  statusBarItem.tooltip = '切换工具箱面板';
  statusBarItem.accessibilityInformation = { label: '切换工具箱面板' };
  statusBarItem.command = OPEN_TOOLS_COMMAND_ID;
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    vscode.window.registerWebviewViewProvider(MENU_VIEW_ID, menuViewProvider),
    vscode.commands.registerCommand(OPEN_TOOLS_COMMAND_ID, async () => {
      if (menuViewProvider.isVisible) {
        await vscode.commands.executeCommand('workbench.action.closePanel');
        return;
      }

      await vscode.commands.executeCommand(`workbench.view.extension.${PANEL_CONTAINER_ID}`);
    }),
    vscode.commands.registerCommand(ADD_WORKSPACE_FILE_COMMAND_ID, async (resource: vscode.Uri | vscode.Uri[] | undefined) => {
      await vscode.commands.executeCommand(`workbench.view.extension.${PANEL_CONTAINER_ID}`);
      const resources = Array.isArray(resource) ? resource : resource ? [resource] : [];
      await menuViewProvider.addWorkspaceFiles(resources);
    }),
  );
}