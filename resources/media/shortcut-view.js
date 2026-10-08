// ------------------------------------------------------------------------
// 名称：shortcut-view.js
// 说明：渲染三类工具列表和表单，运行文件通过资源管理器右键菜单添加。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-09
// 备注：不在 Webview 中执行任意命令或脚本。
// ------------------------------------------------------------------------

/** SVG 元素的命名空间。 */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** 三个固定工具类别及其页签顺序。 */
const SHORTCUT_TYPES = ['terminalFile', 'vscodeCommand', 'copilotMessage'];
/** 面板使用的工具类别显示名称。 */
const TYPE_LABELS = {
  terminalFile: '运行',
  vscodeCommand: '命令',
  copilotMessage: '消息',
};
/** 面板中的所有状态消息保留的秒数。 */
const STATUS_COUNTDOWN_SECONDS = 3;
/** Tabler Outline 图标路径，集中维护于单一脚本文件。 */
const ICON_PATHS = {
  add: ['M12 5v14', 'M5 12h14'],
  edit: ['M7 7h-1a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-1', 'M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z', 'M16 5l3 3'],
  delete: ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
  message: ['M8 9h8', 'M8 13h6', 'M3 20l1.65-4.65a8 8 0 1 1 3.4 3.4L3 20'],
};

/** VS Code 提供的 Webview 宿主通信接口。 */
const vscode = acquireVsCodeApi();
const statusMessage = document.getElementById('status-message');
const statusText = document.getElementById('status-text');
/** 视觉倒计时文本，屏幕阅读器忽略每秒变化。 */
const statusCountdown = document.getElementById('status-countdown');
const statusIconContainer = document.getElementById('status-icon');
const shortcutDialog = document.getElementById('shortcut-dialog');
const confirmDialog = document.getElementById('confirm-dialog');
const shortcutForm = document.getElementById('shortcut-form');
const formError = document.getElementById('form-error');
const confirmError = document.getElementById('confirm-error');
const commandSuggestions = document.getElementById('command-suggestions');
const filePathDisplay = document.getElementById('file-path');
/** 各类别工具胶囊的容器，按类别标识索引。 */
const shortcutOptions = Object.fromEntries(SHORTCUT_TYPES.map((type) => [
  type,
  document.getElementById(`shortcuts-${type}`),
]));

/** 宿主最近一次推送的全部工具项。 */
let currentItems = [];
/** 正在编辑的工具项 ID；新增时为空。 */
let editingItemId;
/** 表单当前对应的工具类别。 */
let currentShortcutType = 'terminalFile';
/** 等待删除确认的工具项 ID。 */
let pendingDeleteId;
/** 打开对话层前获得焦点的控件，关闭后用于恢复焦点。 */
let previousFocus;
/** 编辑运行项时只读展示的相对文件路径。 */
let existingRelativePath = '';
/** 状态消息的自动隐藏计时器。 */
let statusCountdownTimer;
/** 当前正在拖动的同类别工具项。 */
let draggedShortcut;
/** 键盘调整顺序后需要恢复焦点的工具项 ID。 */
let pendingReorderFocusId;

const statusIcon = createIcon('message');
statusIcon.classList.add('status-icon');
statusIconContainer.append(statusIcon);
document.querySelectorAll('.category-add-button').forEach((button) => {
  button.append(createIcon('add'));
  button.addEventListener('click', () => openShortcutDialog(undefined, button.dataset.shortcutType));
});
document.getElementById('cancel-edit').addEventListener('click', closeShortcutDialog);
document.getElementById('cancel-delete').addEventListener('click', closeConfirmDialog);
document.getElementById('confirm-delete').addEventListener('click', () => {
  if (!pendingDeleteId) {
    return;
  }

  setButtonBusy(document.getElementById('confirm-delete'), true, '正在删除...');
  vscode.postMessage({ type: 'delete', itemId: pendingDeleteId });
});

shortcutForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveShortcut();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && (!shortcutDialog.hidden || !confirmDialog.hidden)) {
    trapDialogFocus(event);
    return;
  }

  if (event.key !== 'Escape') {
    return;
  }

  if (!shortcutDialog.hidden) {
    closeShortcutDialog();
  } else if (!confirmDialog.hidden) {
    closeConfirmDialog();
  }
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'state' && Array.isArray(message.items)) {
    currentItems = message.items;
    renderItems();
    restoreReorderFocus();
    showStatus(message.message, message.level);
    // 只有错误级反馈才写入对话层，否则其他操作的成功提示会被当作表单错误显示。
    if (message.message && message.level === 'error' && !message.operation && !shortcutDialog.hidden) {
      showFormError(message.message);
    }
    if (message.message && message.level === 'error' && !message.operation && !confirmDialog.hidden) {
      showConfirmError(message.message);
    }
    if (message.operation === 'save') {
      closeShortcutDialog();
    } else if (message.operation === 'delete') {
      closeConfirmDialog();
    }
  } else if (message.type === 'commands' && Array.isArray(message.commands)) {
    renderCommands(message.commands);
  } else if (message.type === 'editItem' && message.item) {
    openShortcutDialog(message.item);
  } else if (message.type === 'error') {
    // 状态推送失败时不会再有排序结果，需解除排序等待标记，否则后续键盘排序会被一直忽略。
    restoreReorderFocus();
    showStatus(message.message, 'error');
    if (!shortcutDialog.hidden) {
      showFormError(message.message);
    }
    if (!confirmDialog.hidden) {
      showConfirmError(message.message);
    }
  }
});

/** 同时渲染三类工具，每个类别独立横向排列。 */
function renderItems() {
  const groupedItems = Object.fromEntries(SHORTCUT_TYPES.map((type) => [
    type,
    currentItems.filter((item) => item && item.type === type),
  ]));
  SHORTCUT_TYPES.forEach((type) => {
    const container = shortcutOptions[type];
    container.replaceChildren();

    groupedItems[type].forEach((item) => {
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.detail !== 'string') {
        return;
      }

      const option = document.createElement('div');
      option.className = 'shortcut-option';
      option.setAttribute('role', 'listitem');
      bindShortcutReordering(option, type, item.id);

      const runButton = document.createElement('button');
      runButton.className = 'shortcut-option-run';
      runButton.dataset.itemId = item.id;
      if (item.name.length > 14) {
        runButton.classList.add('long-label');
      }
      if (item.name.length > 24) {
        runButton.classList.add('very-long-label');
      }
      runButton.type = 'button';
      const actionLabel = type === 'copilotMessage' ? '填入 Copilot Chat' : `运行${TYPE_LABELS[type]}`;
      runButton.setAttribute('aria-label', `${actionLabel}：${item.name}`);
      runButton.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');
      runButton.title = `${item.name}：${item.detail}`;
      runButton.textContent = item.name;
      runButton.addEventListener('click', () => vscode.postMessage({ type: 'run', itemId: item.id }));
      runButton.addEventListener('keydown', (event) => reorderShortcutWithKeyboard(event, type, item.id));
      bindPressState(runButton);

      const actions = document.createElement('span');
      actions.className = 'shortcut-actions';
      actions.append(
        createActionButton('edit', `编辑 ${item.name}`, () => vscode.postMessage({ type: 'getItem', itemId: item.id })),
        createActionButton('delete', `删除 ${item.name}`, () => openConfirmDialog(item)),
      );
      actions.querySelectorAll('button').forEach((button) => bindPressState(button));

      option.append(runButton, actions);
      container.append(option);
    });
  });
}

/** 使用 Alt+左右方向键调整工具顺序，并保留键盘焦点。 */
function reorderShortcutWithKeyboard(event, shortcutType, itemId) {
  if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
    return;
  }

  event.preventDefault();
  if (pendingReorderFocusId) {
    return;
  }

  const categoryItems = currentItems.filter((item) => item && item.type === shortcutType);
  const currentIndex = categoryItems.findIndex((item) => item.id === itemId);
  const destinationIndex = currentIndex + (event.key === 'ArrowLeft' ? -1 : 1);
  if (currentIndex === -1 || destinationIndex < 0 || destinationIndex >= categoryItems.length) {
    return;
  }

  const itemIds = categoryItems.map((item) => item.id);
  const [movingId] = itemIds.splice(currentIndex, 1);
  itemIds.splice(destinationIndex, 0, movingId);
  pendingReorderFocusId = itemId;
  vscode.postMessage({ type: 'reorder', shortcutType, itemIds });
}

/** 列表重绘后将焦点还给刚完成排序的主按钮。 */
function restoreReorderFocus() {
  if (!pendingReorderFocusId) {
    return;
  }

  const itemId = pendingReorderFocusId;
  pendingReorderFocusId = undefined;
  const button = [...document.querySelectorAll('.shortcut-option-run')]
    .find((candidate) => candidate.dataset.itemId === itemId);
  button?.focus();
}

/** 绑定胶囊的同类别拖放排序与插入位置指示。 */
function bindShortcutReordering(option, shortcutType, itemId) {
  option.draggable = true;
  option.addEventListener('dragstart', (event) => {
    const dragOrigin = document.elementFromPoint(event.clientX, event.clientY);
    if (dragOrigin?.closest('.shortcut-actions')) {
      event.preventDefault();
      return;
    }

    draggedShortcut = { id: itemId, type: shortcutType };
    option.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', itemId);
    }
  });

  option.addEventListener('dragover', (event) => {
    if (!draggedShortcut || draggedShortcut.type !== shortcutType || draggedShortcut.id === itemId) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const bounds = option.getBoundingClientRect();
    const insertAfter = event.clientX >= bounds.left + bounds.width / 2;
    option.classList.toggle('drop-before', !insertAfter);
    option.classList.toggle('drop-after', insertAfter);
  });

  option.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && option.contains(event.relatedTarget)) {
      return;
    }
    option.classList.remove('drop-before', 'drop-after');
  });

  option.addEventListener('drop', (event) => {
    if (!draggedShortcut) {
      return;
    }

    event.preventDefault();
    if (draggedShortcut.type !== shortcutType || draggedShortcut.id === itemId) {
      resetShortcutDrag();
      return;
    }

    const categoryItems = currentItems.filter((item) => item && item.type === shortcutType);
    const orderedIds = categoryItems.map((item) => item.id);
    const movingIndex = orderedIds.indexOf(draggedShortcut.id);
    if (movingIndex === -1 || !orderedIds.includes(itemId)) {
      resetShortcutDrag();
      return;
    }

    const [movingId] = orderedIds.splice(movingIndex, 1);
    const targetIndex = orderedIds.indexOf(itemId);
    const bounds = option.getBoundingClientRect();
    const insertAfter = event.clientX >= bounds.left + bounds.width / 2;
    orderedIds.splice(targetIndex + (insertAfter ? 1 : 0), 0, movingId);
    const orderChanged = orderedIds.some((id, index) => id !== categoryItems[index].id);
    resetShortcutDrag();

    if (orderChanged) {
      vscode.postMessage({ type: 'reorder', shortcutType, itemIds: orderedIds });
    }
  });

  option.addEventListener('dragend', resetShortcutDrag);
}

/** 清理拖动状态与插入位置指示线。 */
function resetShortcutDrag() {
  draggedShortcut = undefined;
  document.querySelectorAll('.shortcut-option.dragging, .shortcut-option.drop-before, .shortcut-option.drop-after')
    .forEach((option) => option.classList.remove('dragging', 'drop-before', 'drop-after'));
}

/** 打开新增或编辑工具表单。运行文件路径由资源管理器右键命令确定。 */
function openShortcutDialog(item, requestedType) {
  previousFocus = document.activeElement;
  editingItemId = item?.id;
  const type = item?.type ?? requestedType ?? 'terminalFile';
  currentShortcutType = type;
  document.getElementById('dialog-title').textContent = item ? '编辑工具' : `新增${TYPE_LABELS[type]}`;
  document.getElementById('shortcut-name').value = item?.name ?? '';
  document.getElementById('command-id').value = item?.commandId ?? '';
  document.getElementById('copilot-message').value = item?.message ?? '';
  existingRelativePath = item?.type === 'terminalFile' ? item.relativePath ?? '' : '';
  filePathDisplay.textContent = existingRelativePath || '请从资源管理器文件右键菜单添加';
  filePathDisplay.title = existingRelativePath;
  formError.hidden = true;
  setShortcutFields(type);
  shortcutDialog.hidden = false;
  document.getElementById('shortcut-name').focus();
}

/** 根据当前类别控制表单字段的显示、必填及可提交状态。 */
function setShortcutFields(type) {
  const fieldGroups = [
    ['terminalFile', document.getElementById('terminal-fields')],
    ['vscodeCommand', document.getElementById('command-fields')],
    ['copilotMessage', document.getElementById('message-fields')],
  ];
  fieldGroups.forEach(([fieldType, group]) => {
    const isVisible = fieldType === type;
    group.hidden = !isVisible;
    group.querySelectorAll('input, select, textarea').forEach((field) => {
      field.disabled = !isVisible;
      field.required = isVisible;
    });
  });
}

/** 向宿主提交当前完整表单；失败时保留输入内容供用户修正。 */
function saveShortcut() {
  const name = document.getElementById('shortcut-name').value.trim();
  if (!name) {
    showFormError('请输入工具名称。');
    document.getElementById('shortcut-name').focus();
    return;
  }

  const request = { type: 'save', shortcutType: currentShortcutType, itemId: editingItemId, name };
  if (currentShortcutType === 'terminalFile') {
    // 运行项的文件目标由宿主按 ID 取自存储，页面只提交名称。
    if (!editingItemId) {
      showFormError('请从资源管理器文件右键菜单添加运行项。');
      return;
    }
  } else if (currentShortcutType === 'vscodeCommand') {
    request.commandId = document.getElementById('command-id').value.trim();
  } else {
    request.message = document.getElementById('copilot-message').value.trim();
  }

  setButtonBusy(document.getElementById('save-shortcut'), true, '正在保存...');
  vscode.postMessage(request);
}

/** 关闭表单并将焦点还给打开表单的控件。 */
function closeShortcutDialog() {
  shortcutDialog.hidden = true;
  editingItemId = undefined;
  setButtonBusy(document.getElementById('save-shortcut'), false, '保存');
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  } else {
    document.querySelector(`[data-shortcut-type="${currentShortcutType}"]`)?.focus();
  }
}

/** 打开页面内删除确认层。 */
function openConfirmDialog(item) {
  previousFocus = document.activeElement;
  pendingDeleteId = item.id;
  document.getElementById('confirm-message').textContent = `确定删除“${item.name}”吗？此操作无法撤销。`;
  confirmError.hidden = true;
  confirmDialog.hidden = false;
  document.getElementById('cancel-delete').focus();
}

/** 关闭删除确认层并将焦点还给原操作按钮。 */
function closeConfirmDialog() {
  confirmDialog.hidden = true;
  pendingDeleteId = undefined;
  setButtonBusy(document.getElementById('confirm-delete'), false, '删除');
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  } else {
    document.querySelector('.category-add-button').focus();
  }
}

/** 将 Tab 焦点限制在打开的 Webview 对话层内。 */
function trapDialogFocus(event) {
  const activeDialog = shortcutDialog.hidden ? confirmDialog : shortcutDialog;
  const focusable = [...activeDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** 将宿主已注册命令作为输入建议，同时保留自由输入。 */
function renderCommands(commands) {
  commandSuggestions.replaceChildren();
  commands.forEach((command) => {
    const option = document.createElement('option');
    option.value = command;
    commandSuggestions.append(option);
  });
}

/** 创建带可访问名称和悬停说明的行内图标操作按钮。 */
function createActionButton(iconName, label, action) {
  const button = document.createElement('button');
  button.className = 'shortcut-action-button';
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createIcon(iconName));
  button.addEventListener('click', action);
  return button;
}

/**
 * 根据集中维护的 Tabler 路径创建主题着色的行内 SVG。
 * @param iconName 已注册的图标名称。
 * @returns 使用 currentColor 描边的装饰性 SVG 节点。
 * @throws 图标名称未注册时抛出错误。
 */
function createIcon(iconName) {
  const iconPaths = ICON_PATHS[iconName];
  if (!iconPaths) {
    throw new Error(`未知图标：${iconName}`);
  }

  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.classList.add('icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');

  for (const pathData of iconPaths) {
    const pathElement = document.createElementNS(SVG_NAMESPACE, 'path');
    pathElement.setAttribute('d', pathData);
    icon.append(pathElement);
  }

  return icon;
}

/** 仅在按钮自身显示按压态，并在按钮外松开时取消点击。 */
function bindPressState(button) {
  // 只抑制按钮外松开后紧随的 click，并在本轮事件结束后清理标记。
  let suppressOutsideClick = false;
  const clearPress = () => {
    button.classList.remove('pressed');
  };

  button.addEventListener('click', (event) => {
    if (!suppressOutsideClick) {
      return;
    }

    suppressOutsideClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    button.setPointerCapture(event.pointerId);
    button.classList.add('pressed');
  });
  button.addEventListener('pointerup', (event) => {
    const bounds = button.getBoundingClientRect();
    suppressOutsideClick = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    clearPress();
    if (suppressOutsideClick) {
      window.setTimeout(() => {
        suppressOutsideClick = false;
      }, 0);
    }
  });
  button.addEventListener('pointercancel', () => {
    suppressOutsideClick = false;
    clearPress();
  });
  button.addEventListener('lostpointercapture', clearPress);
}

/** 在面板底部显示状态消息，并在倒计时结束后自动隐藏。 */
function showStatus(message, level = 'info') {
  if (statusCountdownTimer !== undefined) {
    window.clearInterval(statusCountdownTimer);
    statusCountdownTimer = undefined;
  }

  statusMessage.hidden = !message;
  statusText.textContent = message || '';
  statusCountdown.textContent = '';
  statusMessage.classList.toggle('status-success', level === 'success');
  statusMessage.classList.toggle('status-error', level === 'error');
  statusMessage.classList.toggle('status-info', level === 'info');

  if (!message) {
    return;
  }

  let remainingSeconds = STATUS_COUNTDOWN_SECONDS;
  statusCountdown.textContent = `(${remainingSeconds})`;
  const countdownTimer = window.setInterval(() => {
    if (statusCountdownTimer !== countdownTimer) {
      return;
    }

    remainingSeconds -= 1;
    if (remainingSeconds === 0) {
      window.clearInterval(countdownTimer);
      statusCountdownTimer = undefined;
      statusMessage.hidden = true;
      statusCountdown.textContent = '';
      statusText.textContent = '';
      return;
    }

    statusCountdown.textContent = `(${remainingSeconds})`;
  }, 1000);
  statusCountdownTimer = countdownTimer;
}

/** 在工具表单内展示与输入相关的错误。 */
function showFormError(message) {
  formError.hidden = !message;
  formError.textContent = message || '';
  formError.title = message || '';
  setButtonBusy(document.getElementById('save-shortcut'), false, '保存');
}

/** 在删除确认层内展示操作错误。 */
function showConfirmError(message) {
  confirmError.hidden = !message;
  confirmError.textContent = message || '';
  setButtonBusy(document.getElementById('confirm-delete'), false, '删除');
}

/** 维护提交按钮的忙碌态和防重复提交状态。 */
function setButtonBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

vscode.postMessage({ type: 'ready' });