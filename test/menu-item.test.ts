// ------------------------------------------------------------------------
// 名称：menu-item.test.ts
// 说明：验证工具项数据、名称规则、路径边界和 PowerShell 引号转义。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：使用 Node.js 内置测试运行器。
// ------------------------------------------------------------------------

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as path from 'node:path';
import {
  isCustomMenuItem,
  isPathWithinFolder,
  quotePowerShellPath,
  validateMenuItemName,
} from '../src/menu/menu-item';

test('accepts valid script and command menu items', () => {
  assert.equal(isCustomMenuItem({
    id: 'script-1',
    name: '构建',
    type: 'script',
    script: { workspaceFolderUri: 'file:///project', relativePath: 'build.ps1' },
  }), true);
  assert.equal(isCustomMenuItem({
    id: 'command-1',
    name: '重载窗口',
    type: 'command',
    commandId: 'workbench.action.reloadWindow',
  }), true);
});

test('rejects malformed menu items and invalid names', () => {
  assert.equal(isCustomMenuItem({ id: 'bad', name: '脚本', type: 'script', script: {} }), false);
  assert.equal(validateMenuItemName('   '), '请输入菜单项名称。');
  assert.match(validateMenuItemName('x'.repeat(81)) ?? '', /不能超过/);
  assert.equal(validateMenuItemName(' 构建 '), undefined);
});

test('checks path containment by path segments', () => {
  const rootPath = path.resolve('workspace');
  assert.equal(isPathWithinFolder(rootPath, path.join(rootPath, 'build.ps1')), true);
  assert.equal(isPathWithinFolder(rootPath, path.resolve('workspace-other', 'build.ps1')), false);
  assert.equal(isPathWithinFolder(rootPath, path.resolve('outside', 'build.ps1')), false);
});

test('escapes apostrophes in PowerShell path literals', () => {
  assert.equal(quotePowerShellPath("C:\\work\\author's build.ps1"), "'C:\\work\\author''s build.ps1'");
});