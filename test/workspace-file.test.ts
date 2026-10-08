// ------------------------------------------------------------------------
// 名称：workspace-file.test.ts
// 说明：验证工作区文件解析对越界路径、缺失文件和文件夹的拦截。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-09
// 备注：使用 Node.js 内置测试运行器和系统临时目录。
// ------------------------------------------------------------------------

import assert from 'node:assert/strict';
import { promises as fileSystem } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { resolveFileInWorkspace } from '../src/toolbox/workspace-file';

/** 创建含一个脚本文件和一个子文件夹的临时工作区，并在回调结束后删除。 */
async function withWorkspace(run: (root: string, outsideFile: string) => Promise<void>): Promise<void> {
  const base = await fileSystem.mkdtemp(path.join(os.tmpdir(), 'workspace-toolbox-'));
  try {
    const root = path.join(base, 'workspace');
    await fileSystem.mkdir(path.join(root, 'folder'), { recursive: true });
    await fileSystem.writeFile(path.join(root, 'build.ps1'), '');
    const outsideFile = path.join(base, 'outside.ps1');
    await fileSystem.writeFile(outsideFile, '');
    await run(root, outsideFile);
  } finally {
    await fileSystem.rm(base, { recursive: true, force: true });
  }
}

test('resolves a regular file inside the workspace', async () => {
  await withWorkspace(async (root) => {
    const resolved = await resolveFileInWorkspace(root, 'build.ps1');

    assert.equal(path.basename(resolved.realFilePath), 'build.ps1');
    assert.equal(path.relative(resolved.rootPath, resolved.realFilePath), 'build.ps1');
  });
});

test('rejects parent traversal, missing files and folders', async () => {
  await withWorkspace(async (root) => {
    await assert.rejects(resolveFileInWorkspace(root, path.join('..', 'outside.ps1')), /超出了工作区范围/);
    await assert.rejects(resolveFileInWorkspace(root, 'missing.ps1'), /不存在/);
    await assert.rejects(resolveFileInWorkspace(root, 'folder'), /不是工作区中的文件/);
    await assert.rejects(resolveFileInWorkspace(path.join(root, 'absent'), 'build.ps1'), /工作区文件夹/);
  });
});

test('rejects a symbolic link that points outside the workspace', async (context) => {
  await withWorkspace(async (root, outsideFile) => {
    const linkPath = path.join(root, 'link.ps1');
    try {
      await fileSystem.symlink(outsideFile, linkPath, 'file');
    } catch {
      // 无权限创建符号链接的环境（如未开启开发者模式的 Windows）无法验证此场景。
      context.skip('当前环境不能创建符号链接');
      return;
    }

    await assert.rejects(resolveFileInWorkspace(root, 'link.ps1'), /位于工作区之外/);
  });
});
