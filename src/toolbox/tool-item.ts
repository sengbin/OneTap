// ------------------------------------------------------------------------
// 名称：tool-item.ts
// 说明：定义三类工具项结构，并提供输入和路径安全校验。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：无
// ------------------------------------------------------------------------

import * as path from 'node:path';

/** PowerShell 视为单引号的字符：ASCII 单引号及 U+2018、U+2019、U+201A、U+201B 四种弯引号。 */
const POWERSHELL_SINGLE_QUOTES = /['\u2018\u2019\u201A\u201B]/g;

/** 从资源管理器添加并在终端运行的本地工作区文件工具项。 */
export interface TerminalFileItem {
  /** 跨编辑操作保持不变的工具项标识。 */
  id: string;
  /** 显示在工具箱中的名称。 */
  name: string;
  /** 工具类别标识。 */
  type: 'terminalFile';
  /** 文件所属工作区文件夹的 URI。 */
  workspaceFolderUri: string;
  /** 相对工作区根目录的文件路径，不限制扩展名。 */
  relativePath: string;
}

/** VS Code 命令工具项。 */
export interface VsCodeCommandItem {
  /** 跨编辑操作保持不变的工具项标识。 */
  id: string;
  /** 显示在工具箱中的名称。 */
  name: string;
  /** 工具类别标识。 */
  type: 'vscodeCommand';
  /** 由 VS Code 或扩展注册的命令 ID。 */
  commandId: string;
}

/** Copilot Chat 消息工具项。 */
export interface CopilotMessageItem {
  /** 跨编辑操作保持不变的工具项标识。 */
  id: string;
  /** 显示在工具箱中的名称。 */
  name: string;
  /** 工具类别标识。 */
  type: 'copilotMessage';
  /** 点击后填入 Copilot Chat、等待用户检查的消息正文。 */
  message: string;
}

/** 可由工具箱运行的三类自定义项，按类型收窄执行目标。 */
export type ToolItem = TerminalFileItem | VsCodeCommandItem | CopilotMessageItem;

/** 工具项名称的最大字符数。 */
export const MAX_TOOL_ITEM_NAME_LENGTH = 80;

/**
 * 判断未知存储值是否符合三类工具项结构。
 * @param value 待检查的未知值。
 * @returns 值符合终端文件、VS Code 命令或 Copilot 消息结构时为 true。
 */
export function isToolItem(value: unknown): value is ToolItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || item.id.length === 0 || typeof item.name !== 'string' || item.name.trim().length === 0) {
    return false;
  }

  if (item.type === 'vscodeCommand') {
    return typeof item.commandId === 'string' && item.commandId.trim().length > 0;
  }

  if (item.type === 'terminalFile') {
    return typeof item.workspaceFolderUri === 'string'
      && item.workspaceFolderUri.length > 0
      && typeof item.relativePath === 'string'
      && item.relativePath.length > 0;
  }

  if (item.type === 'copilotMessage') {
    return typeof item.message === 'string' && item.message.trim().length > 0;
  }

  return false;
}

/**
 * 检查工具项名称是否合法。
 * @param name 用户输入的工具名称。
 * @returns 输入有效时返回 undefined，否则返回错误说明。
 */
export function validateToolName(name: string): string | undefined {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) {
    return '请输入工具名称。';
  }

  if (normalizedName.length > MAX_TOOL_ITEM_NAME_LENGTH) {
    return `名称不能超过 ${MAX_TOOL_ITEM_NAME_LENGTH} 个字符。`;
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
 * @param filePath 待编码的文件或目录路径。
 * @returns 可直接嵌入 PowerShell 命令的带引号路径。
 */
export function quotePowerShellPath(filePath: string): string {
  // PowerShell 把弯引号也当作单引号，必须与 ASCII 单引号一样重复一次，否则 “’” 会提前结束字符串。
  return `'${filePath.replace(POWERSHELL_SINGLE_QUOTES, (quote) => `${quote}${quote}`)}'`;
}