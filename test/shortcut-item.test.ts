// ------------------------------------------------------------------------
// 名称：shortcut-item.test.ts
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
  isShortcutItem,
  isPathWithinFolder,
  quotePowerShellPath,
  validateShortcutName,
} from '../src/workkit/shortcut-item';

test('accepts valid items from all three shortcut categories', () => {
  assert.equal(isShortcutItem({
    id: 'script-1',
    name: '构建',
    type: 'terminalFile',
    workspaceFolderUri: 'file:///project',
    relativePath: 'build.ps1',
  }), true);
  assert.equal(isShortcutItem({
    id: 'command-1',
    name: '重载窗口',
    type: 'vscodeCommand',
    commandId: 'workbench.action.reloadWindow',
  }), true);
  assert.equal(isShortcutItem({
    id: 'message-1',
    name: '解释代码',
    type: 'copilotMessage',
    message: '请解释当前代码。',
  }), true);
});

test('rejects malformed shortcut items and invalid names', () => {
  assert.equal(isShortcutItem({ id: 'bad', name: '脚本', type: 'terminalFile', relativePath: 'x.ps1' }), false);
  assert.equal(isShortcutItem({ id: 'bad', name: '消息', type: 'copilotMessage', message: ' ' }), false);
  assert.equal(validateShortcutName('   '), '请输入工具名称。');
  assert.match(validateShortcutName('x'.repeat(81)) ?? '', /不能超过/);
  assert.equal(validateShortcutName(' 构建 '), undefined);
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

test('escapes curly quotes that PowerShell treats as single quotes', () => {
  assert.equal(
    quotePowerShellPath('C:\\work\\a\u2018b\u2019c\u201Ad\u201Be.ps1'),
    "'C:\\work\\a\u2018\u2018b\u2019\u2019c\u201A\u201Ad\u201B\u201Be.ps1'",
  );
});