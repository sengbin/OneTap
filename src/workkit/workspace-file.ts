// ------------------------------------------------------------------------
// 名称：workspace-file.ts
// 说明：解析并校验工作区内的文件，供添加运行项和执行运行项共用。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-09
// 备注：不依赖 vscode 模块，可在单元测试中直接运行。
// ------------------------------------------------------------------------

import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import { isPathWithinFolder } from './shortcut-item';

/** 已通过工作区边界校验的文件位置。 */
export interface ResolvedWorkspaceFile {
  /** 工作区根目录解析符号链接后的真实路径。 */
  rootPath: string;
  /** 文件解析符号链接后的真实路径。 */
  realFilePath: string;
}

/**
 * 校验相对路径指向工作区内的普通文件，并返回解析后的真实位置。
 * @param workspaceRoot 工作区根目录的本地路径。
 * @param relativePath 相对工作区根目录的文件路径，不能为空。
 * @returns 工作区根目录与文件的真实路径。
 * @throws 工作区或文件不可读、路径越界（含借符号链接越界）或目标不是文件时抛出错误。
 */
export async function resolveFileInWorkspace(workspaceRoot: string, relativePath: string): Promise<ResolvedWorkspaceFile> {
  let rootPath: string;
  try {
    rootPath = await fileSystem.realpath(workspaceRoot);
  } catch {
    throw new Error('文件所属的工作区文件夹不存在，或无法读取。');
  }

  // 先校验词法路径，再解析符号链接后的真实路径，防止文件借链接逃离工作区。
  const candidatePath = path.resolve(rootPath, relativePath);
  if (!isPathWithinFolder(rootPath, candidatePath)) {
    throw new Error('文件路径超出了工作区范围。');
  }

  let realFilePath: string;
  try {
    realFilePath = await fileSystem.realpath(candidatePath);
  } catch {
    throw new Error('文件不存在，或无法读取。');
  }

  if (!isPathWithinFolder(rootPath, realFilePath)) {
    throw new Error('文件实际位置位于工作区之外。');
  }

  const fileInfo = await fileSystem.stat(realFilePath);
  if (!fileInfo.isFile()) {
    throw new Error('目标不是工作区中的文件，不能使用文件夹。');
  }

  return { rootPath, realFilePath };
}
