// ------------------------------------------------------------------------
// 名称：menu-view.js
// 说明：渲染底部工具面板列表，并通过受限消息请求扩展宿主执行操作。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：不在 Webview 中执行任意命令或脚本。
// ------------------------------------------------------------------------

const vscode = acquireVsCodeApi();
const toolList = document.getElementById('tool-list');
const itemCount = document.getElementById('item-count');
const emptyState = document.getElementById('empty-state');
const statusMessage = document.getElementById('status-message');
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Tabler Outline 图标路径，集中维护于单一脚本文件。 */
const ICON_PATHS = {
  play: ['M7 4v16l13 -8l-13 -8'],
  settings: [
    'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065',
    'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
  ],
  more: [
    'M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  ],
  add: ['M12 5l0 14', 'M5 12l14 0'],
};

// 用同一图标工厂初始化静态按钮中的图标占位节点。
document.querySelectorAll('[data-icon]').forEach((placeholder) => {
  placeholder.replaceWith(createIcon(placeholder.dataset.icon));
});

document.getElementById('manage-all').addEventListener('click', () => {
  vscode.postMessage({ type: 'manage' });
});

document.getElementById('add-first-tool').addEventListener('click', () => {
  vscode.postMessage({ type: 'manage' });
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'items' && Array.isArray(message.items)) {
    renderItems(message.items);
    showStatus(message.message);
  } else if (message.type === 'error') {
    showStatus(message.message);
  }
});

/** 将宿主提供的已保存菜单项渲染为可访问的原生按钮列表。 */
function renderItems(items) {
  toolList.replaceChildren();
  itemCount.textContent = `${items.length} 个工具`;
  emptyState.hidden = items.length > 0;
  toolList.hidden = items.length === 0;

  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.detail !== 'string') {
      continue;
    }

    const row = document.createElement('div');
    row.className = 'tool-row';

    const runButton = document.createElement('button');
    runButton.className = 'tool-main-button';
    runButton.type = 'button';
    runButton.setAttribute('aria-label', `运行 ${item.name}`);
    runButton.title = `运行 ${item.name}`;

    const runIcon = createIcon('play');

    const textGroup = document.createElement('span');
    textGroup.className = 'tool-text';
    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = item.name;
    const detail = document.createElement('span');
    detail.className = 'tool-detail';
    detail.textContent = item.detail;
    textGroup.append(name, detail);
    runButton.append(runIcon, textGroup);
    runButton.addEventListener('click', () => vscode.postMessage({ type: 'run', itemId: item.id }));
    bindPressState(runButton, row, 'main');

    const manageButton = document.createElement('button');
    manageButton.className = 'tool-action-button';
    manageButton.type = 'button';
    manageButton.setAttribute('aria-label', `管理 ${item.name}`);
    manageButton.title = `管理 ${item.name}`;
    const manageIcon = createIcon('more');
    manageButton.append(manageIcon);
    manageButton.addEventListener('click', () => vscode.postMessage({ type: 'manageItem', itemId: item.id }));
    bindPressState(manageButton, row, 'action');

    row.append(runButton, manageButton);
    toolList.append(row);
  }
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
  if (iconName === 'play' || iconName === 'more') {
    icon.classList.add(`icon-${iconName}`);
  }
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

/** 在主操作和尾部操作各自的边界内维护鼠标按压状态。 */
function bindPressState(button, row, action) {
  const pressedClass = action === 'main' ? 'main-pressed' : 'action-pressed';
  const clearPress = () => {
    row.classList.remove(pressedClass);
    button.classList.remove('pressed');
  };

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    button.setPointerCapture(event.pointerId);
    if (action === 'main') {
      row.classList.add(pressedClass);
    } else {
      button.classList.add('pressed');
    }
  });
  button.addEventListener('pointerup', clearPress);
  button.addEventListener('pointercancel', clearPress);
  button.addEventListener('lostpointercapture', clearPress);
}

/** 在面板内显示错误或操作状态，空消息时清除旧提示。 */
function showStatus(message) {
  statusMessage.hidden = !message;
  statusMessage.textContent = message || '';
}

vscode.postMessage({ type: 'ready' });