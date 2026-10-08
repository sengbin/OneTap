// ------------------------------------------------------------------------
// 名称：menu-item.ts
// 说明：定义自定义工具项结构，并提供输入和路径安全校验。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：无
// ------------------------------------------------------------------------

import * as path from 'node:path';

/** 工作区脚本工具项。 */
export interface ScriptMenuItem {
  /** 跨编辑操作保持不变的菜单项标识。 */
  id: string;
  /** 显示在状态栏菜单中的名称。 */
  name: string;
  /** 用于区分脚本运行和命令调用的数据类型。 */
  type: 'script';
  /** 脚本所属工作区及相对路径。 */
  script: {
    /** 工作区文件夹的 URI 字符串。 */
    workspaceFolderUri: string;
    /** 相对工作区根目录的 PowerShell 脚本路径。 */
    relativePath: string;
  };
}

/** VS Code 命令工具项。 */
export interface CommandMenuItem {
  /** 跨编辑操作保持不变的菜单项标识。 */
  id: string;
  /** 显示在状态栏菜单中的名称。 */
  name: string;
  /** 用于区分脚本运行和命令调用的数据类型。 */
  type: 'command';
  /** 由 VS Code 或扩展注册的命令 ID。 */
  commandId: string;
}

/** 可由状态栏工具菜单运行的自定义项，按类型收窄其执行目标。 */
export type CustomMenuItem = ScriptMenuItem | CommandMenuItem;

/** 自定义菜单项名称的最大字符数。 */
export const MAX_MENU_ITEM_NAME_LENGTH = 80;

/**
 * 判断未知存储值是否符合菜单项结构。
 * @param value 待检查的未知值。
 * @returns 值符合脚本项或命令项结构时为 true。
 */
export function isCustomMenuItem(value: unknown): value is CustomMenuItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || item.id.length === 0 || typeof item.name !== 'string' || item.name.trim().length === 0) {
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

/**
 * 检查菜单名称是否合法。
 * @param name 用户输入的菜单名称。
 * @returns 输入有效时返回 undefined，否则返回错误说明。
 */
export function validateMenuItemName(name: string): string | undefined {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) {
    return '请输入菜单项名称。';
  }

  if (normalizedName.length > MAX_MENU_ITEM_NAME_LENGTH) {
    return `名称不能超过 ${MAX_MENU_ITEM_NAME_LENGTH} 个字符。`;
  }

  return undefined;
}

/**
 * 判断候选路径是否位于指定目录内。
 * @param folderPath 根目录的绝对路径。
 * @param candidatePath 候选文件的绝对路径。
 * @returns 候选路径位于根目录或其子目录时为 true。
 */
export function isPathWithinFolder(folderPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(folderPath), path.resolve(candidatePath));
  // 按相对路径段判断包含关系，避免同名前缀目录被误认为工作区子目录。
  return relativePath === ''
    || (relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
}

/**
 * 将路径编码为 PowerShell 单引号字符串字面量。
 * @param filePath 待编码的文件路径。
 * @returns 可直接嵌入 PowerShell 命令的带引号路径。
 */
export function quotePowerShellPath(filePath: string): string {
  // PowerShell 单引号字面量用两个连续单引号表示路径中的单引号。
  return `'${filePath.replace(/'/g, "''")}'`;
}