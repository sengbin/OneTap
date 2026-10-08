// ------------------------------------------------------------------------
// 名称：extension.ts
// 说明：注册开发者工具箱的状态栏入口和命令面板命令。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：扩展激活时创建状态栏按钮。
// ------------------------------------------------------------------------

import * as vscode from 'vscode';
import { MenuExecutor } from './menu/menu-executor';
import { MenuProvider } from './menu/menu-provider';
import { MenuStore } from './menu/menu-store';
import { MenuViewProvider } from './menu/menu-view-provider';

/** 状态栏入口对应的扩展命令 ID。 */
const OPEN_MENU_COMMAND = 'vscodeTools.openMenu';

/** 命令面板中打开管理流程的命令 ID。 */
const MANAGE_ITEMS_COMMAND = 'vscodeTools.manageItems';

/** 底部 Panel 自定义容器的标识。 */
const PANEL_CONTAINER_ID = 'vscodeToolsPanel';

/** 底部 Panel WebviewView 的标识。 */
const MENU_VIEW_ID = 'vscodeTools.menuView';

/** 使用最大安全整数优先级，使入口尽量靠近右侧状态项组的左端。 */
const STATUS_BAR_PRIORITY = Number.MAX_SAFE_INTEGER;

/**
 * 激活扩展并注册状态栏菜单入口。
 * @param context VS Code 扩展上下文，用于管理扩展资源生命周期。
 * @remarks 创建的状态栏控件和命令订阅会在扩展停用时由上下文统一释放。
 */
export function activate(context: vscode.ExtensionContext): void {
  const store = new MenuStore(context);
  const executor = new MenuExecutor();
  const provider = new MenuProvider(store, executor);
  const menuViewProvider = new MenuViewProvider(context, store, executor, {
    manageItems: () => provider.manageItems(),
    manageItem: (itemId) => provider.manageItemById(itemId),
  });
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, STATUS_BAR_PRIORITY);
  statusBarItem.text = '$(vscode-tools-logo)';
  statusBarItem.name = '开发者工具箱';
  statusBarItem.tooltip = '运行自定义脚本和 VS Code 命令';
  statusBarItem.accessibilityInformation = { label: '开发者工具箱' };
  statusBarItem.command = OPEN_MENU_COMMAND;
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    vscode.window.registerWebviewViewProvider(MENU_VIEW_ID, menuViewProvider),
    vscode.commands.registerCommand(OPEN_MENU_COMMAND, async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${PANEL_CONTAINER_ID}`);
      menuViewProvider.show();
    }),
    vscode.commands.registerCommand(MANAGE_ITEMS_COMMAND, () => provider.manageItems()),
  );
}