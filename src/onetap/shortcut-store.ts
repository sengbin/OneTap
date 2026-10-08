// ------------------------------------------------------------------------
// 名称：shortcut-store.ts
// 说明：通过 VS Code 工作区状态保存和维护三类工具项。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：无
// ------------------------------------------------------------------------

import type { Memento } from 'vscode';
import {
  CopilotMessageItem,
  ShortcutItem,
  TerminalFileItem,
  VsCodeCommandItem,
  isShortcutItem,
} from './shortcut-item';

/** 当前版本的工作区工具数据键。 */
const STORE_KEY = 'oneTap.shortcuts.v1';

/** 当前版本按类别保存的工具集合。 */
interface StoredShortcuts {
  /** 存储格式版本。 */
  version: 1;
  /** 从资源管理器添加并在终端运行的文件工具及其类别内顺序。 */
  terminalFiles: TerminalFileItem[];
  /** VS Code 命令工具及其类别内顺序。 */
  vscodeCommands: VsCodeCommandItem[];
  /** Copilot 消息工具及其类别内顺序。 */
  copilotMessages: CopilotMessageItem[];
}

/** 管理当前工作区的三类自定义工具项。 */
export class ShortcutStore {
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
  public getItems(): ShortcutItem[] {
    const storedShortcuts = this.readStoredShortcuts();
    return [...storedShortcuts.terminalFiles, ...storedShortcuts.vscodeCommands, ...storedShortcuts.copilotMessages];
  }

  /**
   * 新增或更新工具项并持久化。
   * @param item 要保存的完整工具项。
   * @returns 写入完成的异步操作。
   * @throws 名称或 ID 重复、数据无效时抛出错误。
   */
  public async saveItem(item: ShortcutItem): Promise<void> {
    const storedShortcuts = this.readStoredShortcuts();
    const existingItems = this.getItemsFrom(storedShortcuts);
    this.ensureItemIsUnique(item, existingItems);

    const nextShortcuts = this.cloneStoredShortcuts(storedShortcuts);
    switch (item.type) {
      case 'terminalFile':
        nextShortcuts.terminalFiles = this.upsertItem(nextShortcuts.terminalFiles, item);
        break;
      case 'vscodeCommand':
        nextShortcuts.vscodeCommands = this.upsertItem(nextShortcuts.vscodeCommands, item);
        break;
      case 'copilotMessage':
        nextShortcuts.copilotMessages = this.upsertItem(nextShortcuts.copilotMessages, item);
        break;
    }

    await this.workspaceState.update(STORE_KEY, nextShortcuts);
  }

  /**
   * 删除指定工具项。
   * @param itemId 要删除的工具项 ID。
   * @returns 写入完成的异步操作。
   */
  public async removeItem(itemId: string): Promise<void> {
    const storedShortcuts = this.cloneStoredShortcuts(this.readStoredShortcuts());
    storedShortcuts.terminalFiles = storedShortcuts.terminalFiles.filter((item) => item.id !== itemId);
    storedShortcuts.vscodeCommands = storedShortcuts.vscodeCommands.filter((item) => item.id !== itemId);
    storedShortcuts.copilotMessages = storedShortcuts.copilotMessages.filter((item) => item.id !== itemId);
    await this.workspaceState.update(STORE_KEY, storedShortcuts);
  }

  /**
   * 在同一类别内按稳定 ID 调整工具顺序并持久化。
   * @param type 要调整顺序的工具类别。
   * @param itemIds 类别内每个现有工具 ID 恰好出现一次的新顺序。
   * @returns 顺序写入工作区状态后的异步操作。
   * @throws ID 集合与类别当前内容不一致或存储数据无效时抛出错误。
   */
  public async reorderItems(type: ShortcutItem['type'], itemIds: string[]): Promise<void> {
    const storedShortcuts = this.cloneStoredShortcuts(this.readStoredShortcuts());
    switch (type) {
      case 'terminalFile':
        storedShortcuts.terminalFiles = this.reorderCategory(storedShortcuts.terminalFiles, itemIds);
        break;
      case 'vscodeCommand':
        storedShortcuts.vscodeCommands = this.reorderCategory(storedShortcuts.vscodeCommands, itemIds);
        break;
      case 'copilotMessage':
        storedShortcuts.copilotMessages = this.reorderCategory(storedShortcuts.copilotMessages, itemIds);
        break;
    }

    await this.workspaceState.update(STORE_KEY, storedShortcuts);
  }

  /** 读取已保存的数据；尚无数据时返回空集合。 */
  private readStoredShortcuts(): StoredShortcuts {
    const storedShortcuts = this.workspaceState.get<unknown>(STORE_KEY);
    if (storedShortcuts !== undefined) {
      if (!this.isStoredShortcuts(storedShortcuts)) {
        throw new Error('已保存的工具箱数据无效，未覆盖原数据。');
      }

      this.assertNoDuplicateItems(this.getItemsFrom(storedShortcuts));
      return storedShortcuts;
    }

    return this.createEmptyStore();
  }

  /** 校验新版存储结构及全部工具项。 */
  private isStoredShortcuts(value: unknown): value is StoredShortcuts {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const storedShortcuts = value as Record<string, unknown>;
    return storedShortcuts.version === 1
      && Array.isArray(storedShortcuts.terminalFiles)
      && storedShortcuts.terminalFiles.every((item) => isShortcutItem(item) && item.type === 'terminalFile')
      && Array.isArray(storedShortcuts.vscodeCommands)
      && storedShortcuts.vscodeCommands.every((item) => isShortcutItem(item) && item.type === 'vscodeCommand')
      && Array.isArray(storedShortcuts.copilotMessages)
      && storedShortcuts.copilotMessages.every((item) => isShortcutItem(item) && item.type === 'copilotMessage');
  }

  /** 检查名称按类别唯一，且 ID 在全部类别中唯一。 */
  private ensureItemIsUnique(item: ShortcutItem, existingItems: ShortcutItem[]): void {
    if (!isShortcutItem(item)) {
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

  /** 校验已保存的数据没有重复 ID 或类别内重名。 */
  private assertNoDuplicateItems(items: ShortcutItem[]): void {
    const seenIds = new Set<string>();
    for (const item of items) {
      if (seenIds.has(item.id)) {
        throw new Error('工具数据包含重复 ID，未覆盖原数据。');
      }

      seenIds.add(item.id);
      this.ensureItemIsUnique(item, items.filter((candidate) => candidate.id !== item.id));
    }
  }

  /** 创建空的版本一工具集合。 */
  private createEmptyStore(): StoredShortcuts {
    return { version: 1, terminalFiles: [], vscodeCommands: [], copilotMessages: [] };
  }

  /** 复制各类别列表，避免在工作区状态对象上原地修改。 */
  private cloneStoredShortcuts(storedShortcuts: StoredShortcuts): StoredShortcuts {
    return {
      version: 1,
      terminalFiles: [...storedShortcuts.terminalFiles],
      vscodeCommands: [...storedShortcuts.vscodeCommands],
      copilotMessages: [...storedShortcuts.copilotMessages],
    };
  }

  /** 将分类存储展开为统一的只读遍历列表。 */
  private getItemsFrom(storedShortcuts: StoredShortcuts): ShortcutItem[] {
    return [...storedShortcuts.terminalFiles, ...storedShortcuts.vscodeCommands, ...storedShortcuts.copilotMessages];
  }

  /** 按稳定 ID 替换原项或将新项追加至类别末尾。 */
  private upsertItem<T extends ShortcutItem>(items: T[], item: T): T[] {
    const itemIndex = items.findIndex((storedItem) => storedItem.id === item.id);
    if (itemIndex === -1) {
      return [...items, item];
    }

    const updatedItems = [...items];
    updatedItems[itemIndex] = item;
    return updatedItems;
  }

  /** 只接受该类别中每个现有 ID 恰好出现一次的完整顺序。 */
  private reorderCategory<T extends ShortcutItem>(items: T[], itemIds: string[]): T[] {
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