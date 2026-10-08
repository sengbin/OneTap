// ------------------------------------------------------------------------
// 名称：menu-store.test.ts
// 说明：验证三类工具的工作区存储、迁移、更新顺序与损坏数据保护。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：使用 Node.js 内置测试运行器。
// ------------------------------------------------------------------------

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Memento } from 'vscode';
import { MenuStore } from '../src/menu/menu-store';

/** 建立可在单元测试中检查写入结果的工作区状态替身。 */
function createWorkspaceState(initialValues: Record<string, unknown> = {}): {
  state: Memento;
  values: Map<string, unknown>;
} {
  const values = new Map(Object.entries(initialValues));
  const state = {
    get<T>(key: string, defaultValue?: T): T | undefined {
      return values.has(key) ? values.get(key) as T : defaultValue;
    },
    async update(key: string, value: unknown): Promise<void> {
      if (value === undefined) {
        values.delete(key);
      } else {
        values.set(key, value);
      }
    },
    keys(): readonly string[] {
      return [...values.keys()];
    },
  } as Memento;

  return { state, values };
}

test('migrates legacy scripts and commands into separate categories', async () => {
  const { state, values } = createWorkspaceState({
    'vscodeTools.customMenuItems.v1': [
      {
        id: 'script-1',
        name: '构建',
        type: 'script',
        script: { workspaceFolderUri: 'file:///project', relativePath: 'build.ps1' },
      },
      { id: 'command-1', name: '重载', type: 'command', commandId: 'workbench.action.reloadWindow' },
    ],
  });
  const store = new MenuStore(state);

  await store.migrateLegacyItems();

  assert.deepEqual(store.getItems().map((item) => item.type), ['terminalFile', 'vscodeCommand']);
  assert.deepEqual(values.get('vscodeTools.tools.v2'), {
    version: 2,
    terminalFiles: [{
      id: 'script-1',
      name: '构建',
      type: 'terminalFile',
      workspaceFolderUri: 'file:///project',
      relativePath: 'build.ps1',
    }],
    vscodeCommands: [{
      id: 'command-1',
      name: '重载',
      type: 'vscodeCommand',
      commandId: 'workbench.action.reloadWindow',
    }],
    copilotMessages: [],
  });
});

test('updates an item in place and deletes it from its category', async () => {
  const { state } = createWorkspaceState();
  const store = new MenuStore(state);
  await store.saveItem({ id: 'first', name: '第一项', type: 'vscodeCommand', commandId: 'first.command' });
  await store.saveItem({ id: 'second', name: '第二项', type: 'vscodeCommand', commandId: 'second.command' });
  await store.saveItem({ id: 'first', name: '修改后', type: 'vscodeCommand', commandId: 'updated.command' });

  assert.deepEqual(store.getItems().map((item) => item.name), ['修改后', '第二项']);
  await store.removeItem('first');
  assert.deepEqual(store.getItems().map((item) => item.id), ['second']);
});

test('reorders items within a category and rejects incomplete ID sequences', async () => {
  const { state } = createWorkspaceState();
  const store = new MenuStore(state);
  await store.saveItem({ id: 'first', name: '第一项', type: 'vscodeCommand', commandId: 'first.command' });
  await store.saveItem({ id: 'second', name: '第二项', type: 'vscodeCommand', commandId: 'second.command' });
  await store.saveItem({ id: 'message', name: '消息', type: 'copilotMessage', message: '说明' });

  await store.reorderItems('vscodeCommand', ['second', 'first']);

  assert.deepEqual(store.getItems().map((item) => item.id), ['second', 'first', 'message']);
  await assert.rejects(store.reorderItems('vscodeCommand', ['second']), /顺序无效/);
  await assert.rejects(store.reorderItems('vscodeCommand', ['second', 'second']), /顺序无效/);
  await assert.rejects(store.reorderItems('vscodeCommand', ['second', 'message']), /顺序无效/);
  assert.deepEqual(store.getItems().map((item) => item.id), ['second', 'first', 'message']);
});

test('keeps corrupt stored values untouched and rejects duplicate names per category', async () => {
  const corrupt = { version: 2, terminalFiles: 'invalid' };
  const { state, values } = createWorkspaceState({ 'vscodeTools.tools.v2': corrupt });
  const store = new MenuStore(state);

  assert.throws(() => store.getItems(), /未覆盖原数据/);
  assert.equal(values.get('vscodeTools.tools.v2'), corrupt);

  const healthyStore = new MenuStore(createWorkspaceState().state);
  await healthyStore.saveItem({ id: 'first', name: 'Build', type: 'vscodeCommand', commandId: 'first.command' });
  await assert.rejects(
    healthyStore.saveItem({ id: 'second', name: ' build ', type: 'vscodeCommand', commandId: 'second.command' }),
    /已存在名称/,
  );
  await healthyStore.saveItem({ id: 'third', name: 'Build', type: 'copilotMessage', message: '解释' });
});