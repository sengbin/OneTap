// ------------------------------------------------------------------------
// 名称：menu-store.ts
// 说明：通过 VS Code 工作区状态保存、迁移和维护三类工具项。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：无
// ------------------------------------------------------------------------

import type { Memento } from 'vscode';
import {
  CopilotMessageItem,
  CustomMenuItem,
  TerminalFileItem,
  VsCodeCommandItem,
  isCustomMenuItem,
} from './menu-item';

/** 当前版本的工作区工具数据键。 */
const STORE_KEY = 'vscodeTools.tools.v2';
/** 上一版本平铺菜单项的工作区存储键。 */
const LEGACY_STORE_KEY = 'vscodeTools.customMenuItems.v1';

/** 当前版本按类别保存的工具集合。 */
interface StoredTools {
  /** 存储格式版本。 */
  version: 2;
  /** 从资源管理器添加并在终端运行的文件工具及其类别内顺序。 */
  terminalFiles: TerminalFileItem[];
  /** VS Code 命令工具及其类别内顺序。 */
  vscodeCommands: VsCodeCommandItem[];
  /** Copilot 消息工具及其类别内顺序。 */
  copilotMessages: CopilotMessageItem[];
}

/** 旧版可迁移的脚本或命令工具项。 */
type LegacyItem = LegacyScriptItem | LegacyCommandItem;

/** 旧版工作区脚本工具项。 */
interface LegacyScriptItem {
  id: string;
  name: string;
  type: 'script';
  script: {
    workspaceFolderUri: string;
    relativePath: string;
  };
}

/** 旧版 VS Code 命令工具项。 */
interface LegacyCommandItem {
  id: string;
  name: string;
  type: 'command';
  commandId: string;
}

/** 管理当前工作区的三类自定义工具项。 */
export class MenuStore {
  /**
  * 创建工作区工具存储。
  * @param workspaceState VS Code 工作区状态存储。
   */
  constructor(private readonly workspaceState: Memento) {}

  /**
   * 读取并校验当前工作区的所有工具项。
   * @returns 按类别及类别内顺序排列的工具项副本。
   * @throws 存储数据损坏或包含重复项时抛出错误。
   */
  public getItems(): CustomMenuItem[] {
    const storedTools = this.readStoredTools();
    return [...storedTools.terminalFiles, ...storedTools.vscodeCommands, ...storedTools.copilotMessages];
  }

  /**
   * 将旧版平铺的脚本和命令数据迁移并等待新版数据写入完成。
   * @returns 迁移完成或无需迁移时完成的异步操作。
   * @throws 旧版或当前存储数据无效时抛出错误。
   */
  public async migrateLegacyItems(): Promise<void> {
    if (this.workspaceState.get<unknown>(STORE_KEY) !== undefined) {
      this.readStoredTools();
      return;
    }

    if (this.workspaceState.get<unknown>(LEGACY_STORE_KEY) === undefined) {
      return;
    }

    await this.workspaceState.update(STORE_KEY, this.readStoredTools());
  }

  /**
   * 新增或更新工具项并持久化。
   * @param item 要保存的完整工具项。
   * @returns 写入完成的异步操作。
   * @throws 名称或 ID 重复、数据无效时抛出错误。
   */
  public async saveItem(item: CustomMenuItem): Promise<void> {
    const storedTools = this.readStoredTools();
    const existingItems = this.getItemsFrom(storedTools);
    this.ensureItemIsUnique(item, existingItems);

    const nextTools = this.cloneStoredTools(storedTools);
    const existingItem = existingItems.find((storedItem) => storedItem.id === item.id);
    if (existingItem && existingItem.type !== item.type) {
      throw new Error('不能通过编辑将工具项移动到其他类别。');
    }

    switch (item.type) {
      case 'terminalFile':
        nextTools.terminalFiles = this.upsertItem(nextTools.terminalFiles, item);
        break;
      case 'vscodeCommand':
        nextTools.vscodeCommands = this.upsertItem(nextTools.vscodeCommands, item);
        break;
      case 'copilotMessage':
        nextTools.copilotMessages = this.upsertItem(nextTools.copilotMessages, item);
        break;
    }

    await this.workspaceState.update(STORE_KEY, nextTools);
  }

  /**
   * 删除指定菜单项。
   * @param itemId 要删除的菜单项 ID。
   * @returns 写入完成的异步操作。
   */
  public async removeItem(itemId: string): Promise<void> {
    const storedTools = this.cloneStoredTools(this.readStoredTools());
    storedTools.terminalFiles = storedTools.terminalFiles.filter((item) => item.id !== itemId);
    storedTools.vscodeCommands = storedTools.vscodeCommands.filter((item) => item.id !== itemId);
    storedTools.copilotMessages = storedTools.copilotMessages.filter((item) => item.id !== itemId);
    await this.workspaceState.update(STORE_KEY, storedTools);
  }

  /**
   * 在同一类别内按稳定 ID 调整工具顺序并持久化。
   * @param type 要调整顺序的工具类别。
   * @param itemIds 类别内每个现有工具 ID 恰好出现一次的新顺序。
   * @returns 顺序写入工作区状态后的异步操作。
   * @throws ID 集合与类别当前内容不一致或存储数据无效时抛出错误。
   */
  public async reorderItems(type: CustomMenuItem['type'], itemIds: string[]): Promise<void> {
    const storedTools = this.cloneStoredTools(this.readStoredTools());
    switch (type) {
      case 'terminalFile':
        storedTools.terminalFiles = this.reorderCategory(storedTools.terminalFiles, itemIds);
        break;
      case 'vscodeCommand':
        storedTools.vscodeCommands = this.reorderCategory(storedTools.vscodeCommands, itemIds);
        break;
      case 'copilotMessage':
        storedTools.copilotMessages = this.reorderCategory(storedTools.copilotMessages, itemIds);
        break;
    }

    await this.workspaceState.update(STORE_KEY, storedTools);
  }

  /** 读取新版数据，或将旧脚本与命令项转换为新版类别结构。 */
  private readStoredTools(): StoredTools {
    const storedTools = this.workspaceState.get<unknown>(STORE_KEY);
    if (storedTools !== undefined) {
      if (!this.isStoredTools(storedTools)) {
        throw new Error('已保存的工具箱数据无效，未覆盖原数据。');
      }

      this.assertNoDuplicateItems(this.getItemsFrom(storedTools));
      return storedTools;
    }

    const legacyItems = this.workspaceState.get<unknown>(LEGACY_STORE_KEY);
    if (legacyItems === undefined) {
      return this.createEmptyStore();
    }

    if (!Array.isArray(legacyItems) || !legacyItems.every((item) => this.isLegacyItem(item))) {
      throw new Error('旧版工具数据无效，未覆盖原数据。');
    }

    const migratedTools = this.createEmptyStore();
    for (const legacyItem of legacyItems) {
      if (legacyItem.type === 'script') {
        migratedTools.terminalFiles.push({
          id: legacyItem.id,
          name: legacyItem.name,
          type: 'terminalFile',
          workspaceFolderUri: legacyItem.script.workspaceFolderUri,
          relativePath: legacyItem.script.relativePath,
        });
      } else {
        migratedTools.vscodeCommands.push({
          id: legacyItem.id,
          name: legacyItem.name,
          type: 'vscodeCommand',
          commandId: legacyItem.commandId,
        });
      }
    }

    this.assertNoDuplicateItems(this.getItemsFrom(migratedTools));
    return migratedTools;
  }

  /** 校验新版存储结构及全部工具项。 */
  private isStoredTools(value: unknown): value is StoredTools {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const storedTools = value as Record<string, unknown>;
    return storedTools.version === 2
      && Array.isArray(storedTools.terminalFiles)
      && storedTools.terminalFiles.every((item) => isCustomMenuItem(item) && item.type === 'terminalFile')
      && Array.isArray(storedTools.vscodeCommands)
      && storedTools.vscodeCommands.every((item) => isCustomMenuItem(item) && item.type === 'vscodeCommand')
      && Array.isArray(storedTools.copilotMessages)
      && storedTools.copilotMessages.every((item) => isCustomMenuItem(item) && item.type === 'copilotMessage');
  }

  /** 判断旧版本的脚本或命令结构是否可以无损迁移。 */
  private isLegacyItem(value: unknown): value is LegacyItem {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name.trim()) {
      return false;
    }

    if (item.type === 'command') {
      return typeof item.commandId === 'string' && item.commandId.trim().length > 0;
    }

    if (item.type === 'script' && typeof item.script === 'object' && item.script !== null) {
      const script = item.script as Record<string, unknown>;
      return typeof script.workspaceFolderUri === 'string'
        && script.workspaceFolderUri.length > 0
        && typeof script.relativePath === 'string'
        && script.relativePath.length > 0;
    }

    return false;
  }

  /** 检查名称按类别唯一，且 ID 在全部类别中唯一。 */
  private ensureItemIsUnique(item: CustomMenuItem, existingItems: CustomMenuItem[]): void {
    if (!isCustomMenuItem(item)) {
      throw new Error('工具项数据无效，无法保存。');
    }

    const matchingId = existingItems.find((existingItem) => existingItem.id === item.id);
    if (matchingId && matchingId.type !== item.type) {
      throw new Error('不能通过编辑将工具项移动到其他类别。');
    }

    const normalizedName = item.name.trim().toLocaleLowerCase();
    if (existingItems.some((existingItem) =>
      existingItem.id !== item.id
      && existingItem.type === item.type
      && existingItem.name.trim().toLocaleLowerCase() === normalizedName,
    )) {
      throw new Error(`该类别中已存在名称“${item.name.trim()}”。`);
    }
  }

  /** 校验迁移数据没有重复 ID 或类别内重名。 */
  private assertNoDuplicateItems(items: CustomMenuItem[]): void {
    const seenIds = new Set<string>();
    for (const item of items) {
      if (seenIds.has(item.id)) {
        throw new Error('旧版工具数据包含重复 ID，未覆盖原数据。');
      }

      seenIds.add(item.id);
      this.ensureItemIsUnique(item, items.filter((candidate) => candidate.id !== item.id));
    }
  }

  /** 创建空的版本二工具集合。 */
  private createEmptyStore(): StoredTools {
    return { version: 2, terminalFiles: [], vscodeCommands: [], copilotMessages: [] };
  }

  /** 复制各类别列表，避免在工作区状态对象上原地修改。 */
  private cloneStoredTools(storedTools: StoredTools): StoredTools {
    return {
      version: 2,
      terminalFiles: [...storedTools.terminalFiles],
      vscodeCommands: [...storedTools.vscodeCommands],
      copilotMessages: [...storedTools.copilotMessages],
    };
  }

  /** 将分类存储展开为统一的只读遍历列表。 */
  private getItemsFrom(storedTools: StoredTools): CustomMenuItem[] {
    return [...storedTools.terminalFiles, ...storedTools.vscodeCommands, ...storedTools.copilotMessages];
  }

  /** 按稳定 ID 替换原项或将新项追加至类别末尾。 */
  private upsertItem<T extends CustomMenuItem>(items: T[], item: T): T[] {
    const itemIndex = items.findIndex((storedItem) => storedItem.id === item.id);
    if (itemIndex === -1) {
      return [...items, item];
    }

    const updatedItems = [...items];
    updatedItems[itemIndex] = item;
    return updatedItems;
  }

  /** 只接受该类别中每个现有 ID 恰好出现一次的完整顺序。 */
  private reorderCategory<T extends CustomMenuItem>(items: T[], itemIds: string[]): T[] {
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const uniqueIds = new Set(itemIds);
    if (itemIds.length !== items.length
      || uniqueIds.size !== itemIds.length
      || itemIds.some((itemId) => !itemsById.has(itemId))) {
      throw new Error('工具项顺序无效，未保存。');
    }

    return itemIds.map((itemId) => itemsById.get(itemId)!);
  }
}