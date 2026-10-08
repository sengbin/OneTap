// ------------------------------------------------------------------------
// 名称：menu-store.ts
// 说明：通过 VS Code 工作区状态保存和维护自定义工具项。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：无
// ------------------------------------------------------------------------

import * as vscode from 'vscode';
import { CustomMenuItem, isCustomMenuItem } from './menu-item';

/** 工作区状态中的菜单数据键。 */
const STORE_KEY = 'vscodeTools.customMenuItems.v1';

/** 管理当前工作区的自定义工具项。 */
export class MenuStore {
  /**
   * 创建工作区菜单存储。
   * @param context VS Code 扩展上下文。
   */
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * 读取并校验当前工作区的所有菜单项。
   * @returns 按保存顺序排列的菜单项。
   * @throws 存储内容损坏或不符合当前数据结构时抛出错误。
   */
  public getItems(): CustomMenuItem[] {
    const storedItems = this.context.workspaceState.get<unknown>(STORE_KEY);
    if (storedItems === undefined) {
      return [];
    }

    // 保留损坏数据并停止读写，避免把无法识别的设置静默覆盖为空列表。
    if (!Array.isArray(storedItems) || !storedItems.every(isCustomMenuItem)) {
      throw new Error('已保存的工具菜单数据无效。请先备份工作区设置，再重新创建工具项。');
    }

    return storedItems;
  }

  /**
   * 新增菜单项并持久化。
   * @param item 要新增的菜单项。
   * @returns 写入完成的异步操作。
   * @throws 名称或 ID 重复、数据无效时抛出错误。
   */
  public async addItem(item: CustomMenuItem): Promise<void> {
    const items = this.getItems();
    this.ensureItemIsUnique(item, items);
    await this.context.workspaceState.update(STORE_KEY, [...items, item]);
  }

  /**
   * 更新已有菜单项并保留其列表位置。
   * @param item 更新后的菜单项。
   * @returns 写入完成的异步操作。
   * @throws 菜单项不存在、名称重复或数据无效时抛出错误。
   */
  public async updateItem(item: CustomMenuItem): Promise<void> {
    const items = this.getItems();
    const itemIndex = items.findIndex((storedItem) => storedItem.id === item.id);
    if (itemIndex === -1) {
      throw new Error('要编辑的工具项已不存在。');
    }

    this.ensureItemIsUnique(item, items.filter((storedItem) => storedItem.id !== item.id));
    const updatedItems = [...items];
    updatedItems[itemIndex] = item;
    await this.context.workspaceState.update(STORE_KEY, updatedItems);
  }

  /**
   * 删除指定菜单项。
   * @param itemId 要删除的菜单项 ID。
   * @returns 写入完成的异步操作。
   */
  public async removeItem(itemId: string): Promise<void> {
    const remainingItems = this.getItems().filter((item) => item.id !== itemId);
    await this.context.workspaceState.update(STORE_KEY, remainingItems);
  }

  /** 检查新增或更新项的名称与 ID 是否唯一。 */
  private ensureItemIsUnique(item: CustomMenuItem, existingItems: CustomMenuItem[]): void {
    // 在写入前校验联合类型数据，防止调用方存入不完整的执行目标。
    if (!isCustomMenuItem(item)) {
      throw new Error('工具项数据不完整，无法保存。');
    }

    // ID 冲突会覆盖另一项，名称冲突会让 Quick Pick 中的工具难以区分。
    if (existingItems.some((existingItem) => existingItem.id === item.id)) {
      throw new Error('工具项 ID 已存在，请重新创建。');
    }

    const normalizedName = item.name.trim().toLocaleLowerCase();
    if (existingItems.some((existingItem) => existingItem.name.trim().toLocaleLowerCase() === normalizedName)) {
      throw new Error(`名称“${item.name.trim()}”已存在，请使用其他名称。`);
    }
  }
}