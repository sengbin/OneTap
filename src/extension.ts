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

/** 状态栏入口对应的扩展命令 ID。 */
const OPEN_MENU_COMMAND = 'vscodeTools.openMenu';

/** 命令面板中打开管理流程的命令 ID。 */
const MANAGE_ITEMS_COMMAND = 'vscodeTools.manageItems';

/** 状态栏入口的优先级，决定其在左侧状态栏中的相对位置。 */
const STATUS_BAR_PRIORITY = 100;

/**
 * 激活扩展并注册状态栏菜单入口。
 * @param context VS Code 扩展上下文，用于管理扩展资源生命周期。
 * @remarks 创建的状态栏控件和命令订阅会在扩展停用时由上下文统一释放。
 */
export function activate(context: vscode.ExtensionContext): void {
  const store = new MenuStore(context);
  const provider = new MenuProvider(store, new MenuExecutor());
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_BAR_PRIORITY);
  statusBarItem.text = '$(tools) 开发者工具箱';
  statusBarItem.tooltip = '运行自定义脚本和 VS Code 命令';
  statusBarItem.command = OPEN_MENU_COMMAND;
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand(OPEN_MENU_COMMAND, () => provider.openMenu()),
    vscode.commands.registerCommand(MANAGE_ITEMS_COMMAND, () => provider.manageItems()),
  );
}