// ------------------------------------------------------------------------
// 名称：tool-view-provider.ts
// 说明：承载底部 Panel WebviewView，并校验资源管理器文件、工具管理和执行消息。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-09
// 备注：页面只能按工具项 ID 请求宿主执行已有工具。
// ------------------------------------------------------------------------

import { randomBytes, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  ToolItem,
  MAX_TOOL_ITEM_NAME_LENGTH,
  TerminalFileItem,
  isToolItem,
  validateToolName,
} from './tool-item';
import { ToolExecutor } from './tool-executor';
import { ToolStore } from './tool-store';
import { resolveFileInWorkspace } from './workspace-file';

/** 自动生成重名后缀时尝试的最大序号（不含）。 */
const MAX_NAME_SUFFIX_INDEX = 1000;

/** 发给 Webview 的工具项只读视图。 */
interface ToolItemViewModel {
  /** 工具项的稳定标识。 */
  id: string;
  /** 工具箱中显示的名称。 */
  name: string;
  /** 工具类别。 */
  type: ToolItem['type'];
  /** 工具箱中显示的执行目标摘要。 */
  detail: string;
}

/** 管理底部 Panel WebviewView 的页面和受限消息。 */
export class ToolViewProvider implements vscode.WebviewViewProvider {
  /** 当前已解析且未销毁的面板视图。 */
  private view: vscode.WebviewView | undefined;

  /**
   * 获取工具箱视图的当前可见状态。
   * @returns 视图已解析且当前可见时为 true。
   */
  public get isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  /**
   * 创建底部工具面板提供器。
   * @param extensionContext VS Code 扩展上下文。
   * @param store 当前工作区的工具项存储。
   * @param executor 三类工具项执行器。
   */
  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly store: ToolStore,
    private readonly executor: ToolExecutor,
  ) {
    this.extensionContext.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.sendState();
      }),
    );
  }

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
    webviewView.title = '工具箱';
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'media')],
    };
    webviewView.webview.html = this.createHtml(webviewView.webview);

    // 监听只属于这次解析的视图，视图销毁时一并释放，避免面板反复创建后监听器累积。
    const viewDisposables: vscode.Disposable[] = [];
    viewDisposables.push(
      webviewView.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
        vscode.Disposable.from(...viewDisposables).dispose();
      }),
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          void this.sendState();
        }
      }),
    );
  }

  /** 构造仅加载扩展本地脚本与样式的安全页面。编辑字段在对话层内单行横向排列。 */
  private createHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const mediaDirectory = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'media');
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDirectory, 'tool-view.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDirectory, 'tool-view.js'));

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>工具箱</title>
</head>
<body>
  <main class="panel-content">
    <div class="tool-groups" aria-label="工具类别">
      <section class="tool-category-row" aria-label="运行">
        <h2 class="category-label">运行</h2>
        <div id="tools-terminalFile" class="tool-options" role="list" aria-label="运行工具"></div>
      </section>
      <section class="tool-category-row" aria-label="消息">
        <h2 class="category-label">消息</h2>
        <div id="tools-copilotMessage" class="tool-options" role="list" aria-label="消息工具"></div>
        <button class="category-add-button" type="button" data-tool-type="copilotMessage" aria-label="新增消息工具" title="新增消息工具"></button>
      </section>
      <section class="tool-category-row" aria-label="命令">
        <h2 class="category-label">命令</h2>
        <div id="tools-vscodeCommand" class="tool-options" role="list" aria-label="命令工具"></div>
        <button class="category-add-button" type="button" data-tool-type="vscodeCommand" aria-label="新增命令工具" title="新增命令工具"></button>
      </section>
    </div>
    <p id="status-message" class="status-message" role="status" aria-live="polite" hidden>
      <span id="status-icon" aria-hidden="true"></span>
      <span id="status-text"></span>
      <span id="status-countdown" aria-hidden="true"></span>
    </p>
    <div id="tool-dialog" class="dialog-backdrop" hidden>
      <section class="tool-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <form id="tool-form" novalidate>
          <h2 id="dialog-title">新增工具</h2>
          <div class="form-line">
            <label class="inline-field name-field" for="tool-name"><span>名称</span><input id="tool-name" name="name" type="text" maxlength="80" required autocomplete="off"></label>
            <div id="terminal-fields" class="form-fields" hidden>
              <div class="inline-field">
                <span id="file-path-label">执行文件</span>
                <div id="file-path" class="file-path-display" aria-labelledby="file-path-label" aria-describedby="file-help"></div>
              </div>
              <p id="file-help" class="field-help">通过资源管理器文件右键菜单添加；此处可修改运行项名称。</p>
            </div>
            <div id="command-fields" class="form-fields" hidden>
              <label class="inline-field" for="command-id"><span>命令 ID</span><input id="command-id" name="commandId" type="text" list="command-suggestions" required autocomplete="off" title="可以输入尚未注册的命令 ID。" aria-describedby="command-help"></label>
              <datalist id="command-suggestions"></datalist>
              <p id="command-help" class="field-help">可以输入尚未注册的命令 ID。</p>
            </div>
            <div id="message-fields" class="form-fields" hidden>
              <label class="inline-field message-field" for="copilot-message"><span>消息正文</span><textarea id="copilot-message" name="message" rows="1" required title="点击工具只会填入 Copilot Chat，不会自动发送。" aria-describedby="message-help"></textarea></label>
              <p id="message-help" class="field-help">点击工具只会填入 Copilot Chat，不会自动发送。</p>
            </div>
            <div class="dialog-actions">
              <button id="cancel-edit" class="secondary-button" type="button">取消</button>
              <button id="save-tool" class="primary-button" type="submit">保存</button>
            </div>
          </div>
          <p id="form-error" class="form-error" role="alert" hidden></p>
        </form>
      </section>
    </div>
    <div id="confirm-dialog" class="dialog-backdrop" hidden>
      <section class="tool-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title">删除工具</h2>
        <p id="confirm-message"></p>
        <p id="confirm-error" class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <button id="cancel-delete" class="secondary-button" type="button">取消</button>
          <button id="confirm-delete" class="danger-button" type="button">删除</button>
        </div>
      </section>
    </div>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /** 只接受 Webview 协议中声明的动作，并在宿主校验数据后执行。 */
  private async handleMessage(message: unknown): Promise<void> {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const request = message as Record<string, unknown>;
    try {
      if (request.type === 'ready') {
        await this.sendState();
        await this.sendCommands();
        return;
      }

      if (request.type === 'reorder') {
        const toolType = request.toolType;
        const itemIds = request.itemIds;
        if ((toolType !== 'terminalFile' && toolType !== 'vscodeCommand' && toolType !== 'copilotMessage')
          || !Array.isArray(itemIds)
          || !itemIds.every((itemId): itemId is string => typeof itemId === 'string')) {
          throw new Error('工具项顺序无效，无法保存。');
        }

        await this.store.reorderItems(toolType, itemIds);
        await this.sendState(undefined, 'reorder');
        return;
      }

      if (request.type === 'save') {
        const item = this.buildItem(request);
        await this.store.saveItem(item);
        await this.sendState(`已保存“${item.name}”。`, 'save');
        return;
      }

      if (request.type === 'delete' && typeof request.itemId === 'string') {
        await this.store.removeItem(request.itemId);
        await this.sendState('工具已删除。', 'delete');
        return;
      }

      if ((request.type === 'run' || request.type === 'getItem') && typeof request.itemId === 'string') {
        const item = this.findItem(request.itemId);
        if (!item) {
          await this.sendState('该工具已不存在，请刷新列表。', undefined, 'error');
          return;
        }

        if (request.type === 'getItem') {
          await this.view?.webview.postMessage({ type: 'editItem', item });
          return;
        }

        await this.executor.execute(item);
        const resultMessage = item.type === 'copilotMessage'
          ? '消息已填入 Copilot Chat，请检查后自行发送。'
          : item.type === 'terminalFile'
            ? '已在终端中启动文件。'
            : `已执行命令“${item.commandId}”。`;
        await this.sendState(resultMessage);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.sendState(`操作失败：${detail}`, undefined, 'error');
    }
  }

  /** 从工作区存储中查找工具项，不信任页面回传的执行目标。 */
  private findItem(itemId: string): ToolItem | undefined {
    return this.store.getItems().find((item) => item.id === itemId);
  }

  /** 校验表单字段并组装宿主侧工具项；运行项的文件目标一律取自已保存数据。 */
  private buildItem(request: Record<string, unknown>): ToolItem {
    const name = typeof request.name === 'string' ? request.name.trim() : '';
    const nameError = validateToolName(name);
    if (nameError) {
      throw new Error(nameError);
    }

    const requestedItemId = typeof request.itemId === 'string' ? request.itemId : undefined;
    const existingItem = requestedItemId
      ? this.store.getItems().find((storedItem) => storedItem.id === requestedItemId)
      : undefined;
    if (requestedItemId && !existingItem) {
      throw new Error('要编辑的工具已不存在，请刷新列表。');
    }

    const id = existingItem?.id ?? randomUUID();
    let item: ToolItem;

    if (request.toolType === 'terminalFile') {
      // 运行项只能通过资源管理器添加，编辑时只改名称，不采用页面回传的路径；工作区已关闭的运行项仍可改名或删除。
      if (existingItem?.type !== 'terminalFile') {
        throw new Error('运行项只能通过资源管理器文件右键菜单添加。');
      }
      item = { ...existingItem, name };
    } else if (request.toolType === 'vscodeCommand' && typeof request.commandId === 'string') {
      item = { id, name, type: 'vscodeCommand', commandId: request.commandId.trim() };
    } else if (request.toolType === 'copilotMessage' && typeof request.message === 'string') {
      item = { id, name, type: 'copilotMessage', message: request.message.trim() };
    } else {
      throw new Error('工具类型或表单字段无效。');
    }

    if (!isToolItem(item)) {
      throw new Error('请完整填写工具名称和执行目标。');
    }

    return item;
  }

  /** 将资源管理器提供的文件 URI 解析为当前本地工作区内的相对路径；允许任意扩展名，拒绝目录和越界路径。 */
  private async resolveWorkspaceFile(uri: vscode.Uri): Promise<Pick<TerminalFileItem, 'workspaceFolderUri' | 'relativePath'>> {
    if (uri.scheme !== 'file') {
      throw new Error('只能添加本地工作区中的文件。');
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder || workspaceFolder.uri.scheme !== 'file') {
      throw new Error('请从当前打开的本地工作区添加文件。');
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    const { rootPath, realFilePath } = await resolveFileInWorkspace(workspaceFolder.uri.fsPath, relativePath);
    return {
      workspaceFolderUri: workspaceFolder.uri.toString(),
      relativePath: path.relative(rootPath, realFilePath).replace(/\\/g, '/'),
    };
  }

  /** 为右键添加的文件生成类别内不重复、且不超过名称长度上限的显示名。 */
  private allocateToolName(baseName: string, usedNames: Set<string>): string {
    const trimmed = baseName.trim().slice(0, MAX_TOOL_ITEM_NAME_LENGTH) || '未命名文件';
    if (!usedNames.has(trimmed.toLocaleLowerCase())) {
      return trimmed;
    }

    for (let index = 2; index < MAX_NAME_SUFFIX_INDEX; index += 1) {
      const suffix = ` (${index})`;
      const candidate = `${trimmed.slice(0, Math.max(1, MAX_TOOL_ITEM_NAME_LENGTH - suffix.length))}${suffix}`;
      if (!usedNames.has(candidate.toLocaleLowerCase())) {
        return candidate;
      }
    }

    throw new Error('无法生成不重复的工具名称。');
  }

  /**
   * 将资源管理器提供的本地工作区文件添加为运行项。
   * @param resources 资源管理器右键命令提供的资源 URI。
   * @returns 完成添加并刷新工具列表后的异步操作；部分失败会在状态区反馈。
   */
  public async addWorkspaceFiles(resources: vscode.Uri[]): Promise<void> {
    try {
      if (resources.length === 0) {
        throw new Error('未获取到文件，请从资源管理器文件右键菜单添加。');
      }

      const terminalItems = this.store.getItems().filter((item): item is TerminalFileItem => item.type === 'terminalFile');
      const usedNames = new Set(terminalItems.map((item) => item.name.trim().toLocaleLowerCase()));
      // 以“工作区 + 相对路径”标识文件，值为已有运行项名称，用于拒绝重复添加。
      const knownTargets = new Map(terminalItems.map((item) => [`${item.workspaceFolderUri}|${item.relativePath}`, item.name]));
      const addedNames: string[] = [];
      const failures: string[] = [];
      for (const resource of resources) {
        try {
          const target = await this.resolveWorkspaceFile(resource);
          const targetKey = `${target.workspaceFolderUri}|${target.relativePath}`;
          const existingName = knownTargets.get(targetKey);
          if (existingName !== undefined) {
            throw new Error(`文件“${path.basename(target.relativePath)}”已在运行项“${existingName}”中，不能重复添加。`);
          }

          const name = this.allocateToolName(path.basename(target.relativePath), usedNames);
          usedNames.add(name.toLocaleLowerCase());
          const item: TerminalFileItem = { id: randomUUID(), name, type: 'terminalFile', ...target };
          const nameError = validateToolName(item.name);
          if (nameError) {
            throw new Error(nameError);
          }
          await this.store.saveItem(item);
          knownTargets.set(targetKey, name);
          addedNames.push(name);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }

      if (addedNames.length === 0) {
        throw new Error(failures[0] ?? '没有可添加的文件。');
      }

      const summary = addedNames.length === 1 ? `已添加“${addedNames[0]}”。` : `已添加 ${addedNames.length} 个运行项。`;
      const result = failures.length === 0 ? summary : `${summary}另有 ${failures.length} 个文件未添加：${failures[0]}`;
      await this.sendState(result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.sendState(`操作失败：${detail}`, undefined, 'error');
    }
  }

  /** 将已注册的命令 ID 发送给面板作为输入建议；列表很大，只在页面就绪时发送，不随每次状态刷新重复传输。 */
  private async sendCommands(): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }

    const commands = await vscode.commands.getCommands(true);
    await view.webview.postMessage({ type: 'commands', commands });
  }

  /** 将工具列表和操作反馈发送给面板。 */
  private async sendState(
    message?: string,
    operation?: 'save' | 'delete' | 'reorder',
    level: 'success' | 'error' | 'info' = operation ? 'success' : 'info',
  ): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }

    try {
      const items: ToolItemViewModel[] = this.store.getItems().map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        detail: item.type === 'terminalFile'
          ? item.relativePath
          : item.type === 'vscodeCommand'
            ? item.commandId
            : item.message,
      }));
      await view.webview.postMessage({ type: 'state', items, message, operation, level });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await view.webview.postMessage({ type: 'error', message: detail });
    }
  }
}