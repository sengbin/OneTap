// ------------------------------------------------------------------------
// 名称：menu-view-provider.ts
// 说明：承载底部 Panel WebviewView，并在扩展宿主与工具菜单页面间转发安全消息。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：页面只能按菜单项 ID 请求宿主执行已有工具。
// ------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { CustomMenuItem } from './menu-item';
import { MenuExecutor } from './menu-executor';
import { MenuStore } from './menu-store';

/** 面板管理流程的宿主回调。 */
export interface MenuViewActions {
  /** 打开全部工具项的管理流程。 */
  manageItems(): Promise<void>;
  /** 打开一个工具项的管理操作。 */
  manageItem(itemId: string): Promise<void>;
}

/** 发送给 Webview 的菜单项只读视图。 */
interface MenuItemViewModel {
  /** 菜单项的稳定标识。 */
  id: string;
  /** 面板中显示的名称。 */
  name: string;
  /** 面板中显示的类型和执行目标。 */
  detail: string;
}

/** 管理底部 Panel WebviewView 的内容和消息。 */
export class MenuViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  /**
   * 创建底部工具面板提供器。
   * @param extensionContext VS Code 扩展上下文。
   * @param store 当前工作区的菜单项存储。
   * @param executor 已有菜单项执行器。
   * @param actions 由宿主菜单提供器实现的管理回调。
   */
  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly store: MenuStore,
    private readonly executor: MenuExecutor,
    private readonly actions: MenuViewActions,
  ) {}

  /**
   * 解析并初始化清单中声明的 WebviewView。
   * @param webviewView VS Code 创建的面板视图。
   * @param _viewContext VS Code 提供的视图恢复上下文。
   * @param _token 视图解析的取消令牌。
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _viewContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.title = '工具菜单';
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'media')],
    };
    webviewView.webview.html = this.createHtml(webviewView.webview);

    this.extensionContext.subscriptions.push(
      webviewView.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
      }),
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          void this.sendItems();
        }
      }),
    );
  }

  /** 展开并聚焦底部工具视图。 */
  public show(): void {
    this.view?.show(false);
  }

  /** 构造仅加载扩展本地脚本与样式的安全页面。 */
  private createHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const mediaDirectory = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'media');
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDirectory, 'menu-view.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDirectory, 'menu-view.js'));

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>开发者工具箱</title>
</head>
<body>
  <main class="panel-content">
    <header class="panel-header">
      <div class="heading-group">
        <h1>开发者工具箱</h1>
        <p id="item-count" class="description">正在加载工具...</p>
      </div>
      <button id="manage-all" class="icon-button primary-button" type="button" aria-label="管理工具" title="管理工具">
        <span data-icon="settings"></span>
      </button>
    </header>
    <p id="status-message" class="status-message" role="status" aria-live="polite" hidden></p>
    <section id="tool-list" class="tool-list" aria-label="自定义工具"></section>
    <section id="empty-state" class="empty-state" hidden>
      <p>还没有自定义工具</p>
      <button id="add-first-tool" class="icon-button secondary-button" type="button" aria-label="添加工具" title="添加工具">
        <span data-icon="add"></span>
      </button>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /** 只接受面板约定的有限动作，再委托给宿主管理器或执行器。 */
  private async handleMessage(message: unknown): Promise<void> {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const request = message as Record<string, unknown>;
    try {
      if (request.type === 'ready') {
        await this.sendItems();
        return;
      }

      if (request.type === 'manage') {
        await this.actions.manageItems();
        await this.sendItems();
        return;
      }

      if (typeof request.itemId !== 'string') {
        return;
      }

      const item = this.findItem(request.itemId);
      if (!item) {
        await this.sendItems('该工具项已不存在，请刷新列表。');
        return;
      }

      if (request.type === 'run') {
        await this.executor.execute(item);
        await this.sendItems();
      } else if (request.type === 'manageItem') {
        await this.actions.manageItem(item.id);
        await this.sendItems();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.sendItems(`操作失败：${detail}`);
    }
  }

  /** 从当前工作区存储中查找菜单项，不信任 Webview 传回的目标内容。 */
  private findItem(itemId: string): CustomMenuItem | undefined {
    return this.store.getItems().find((item) => item.id === itemId);
  }

  /** 将当前列表或错误状态发送给已打开的 Webview。 */
  private async sendItems(message?: string): Promise<void> {
    if (!this.view) {
      return;
    }

    try {
      const items: MenuItemViewModel[] = this.store.getItems().map((item) => ({
        id: item.id,
        name: item.name,
        detail: item.type === 'script' ? item.script.relativePath : item.commandId,
      }));
      await this.view.webview.postMessage({ type: 'items', items, message });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.view.webview.postMessage({ type: 'error', message: detail });
    }
  }
}