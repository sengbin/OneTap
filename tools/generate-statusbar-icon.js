// ------------------------------------------------------------------------
// 名称：generate-statusbar-icon.js
// 说明：从原始 Logo 生成居中放大的 VS Code 自定义产品图标字体。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：缩放只应用于临时字体输入，不改动原始 Logo 文件。
// ------------------------------------------------------------------------

const path = require('node:path');
const fileSystem = require('node:fs/promises');

/** 相对 Codicon 标准 16px 字格的缩放倍率。 */
const ICON_SCALE = 1.0;
/** Fantasticon 只读取此临时目录中的 Logo 字体输入。 */
const INPUT_DIRECTORY = path.resolve(__dirname, '..', 'out', 'statusbar-icon-source');
/** 用户提供的原始叶片 Logo 文件路径。 */
const SOURCE_ICON_PATH = path.resolve(__dirname, '..', 'resources', 'logo.svg');

// Fantasticon 在 Windows 下构造 glob 时需使用正斜杠，避免扫描不到 SVG 文件。
const originalJoin = path.join;
path.join = (...parts) => originalJoin(...parts).replaceAll('\\', '/');

const { generateFonts } = require('fantasticon');
const configuration = require('../.fantasticonrc.js');

/**
 * 从原始 SVG 的 viewBox 中心构造临时状态栏图标副本。
 * @param sourceSvg 原始 SVG 文本。
 * @returns 带中心缩放变换的临时 SVG 文本。
 * @throws SVG 缺少有效 viewBox 或根元素时抛出错误。
 */
function createScaledIconSvg(sourceSvg) {
  const viewBoxMatch = sourceSvg.match(/\bviewBox=["']([^"']+)["']/i);
  if (!viewBoxMatch) {
    throw new Error('Logo SVG 缺少 viewBox，无法安全缩放。');
  }

  const [left, top, width, height] = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Logo SVG 的 viewBox 数值无效。');
  }

  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const transform = `translate(${centerX} ${centerY}) scale(${ICON_SCALE}) translate(${-centerX} ${-centerY})`;
  const scaledSvg = sourceSvg.replace(/<svg\b/i, `<svg transform="${transform}"`);
  if (scaledSvg === sourceSvg) {
    throw new Error('Logo SVG 缺少根 svg 元素。');
  }

  return scaledSvg;
}

async function generateStatusBarIcon() {
  const originalSvg = await fileSystem.readFile(SOURCE_ICON_PATH, 'utf8');
  const scaledSvg = createScaledIconSvg(originalSvg);
  await fileSystem.mkdir(INPUT_DIRECTORY, { recursive: true });
  await fileSystem.writeFile(path.join(INPUT_DIRECTORY, 'logo.svg'), scaledSvg, 'utf8');

  try {
    await generateFonts({ ...configuration, inputDir: INPUT_DIRECTORY });
    console.log('Generated centered VS Code status bar icon font at the standard 16px scale.');
  } finally {
    await fileSystem.rm(INPUT_DIRECTORY, { recursive: true, force: true });
  }
}

generateStatusBarIcon().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });