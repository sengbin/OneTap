// ------------------------------------------------------------------------
// 名称：.fantasticonrc.js
// 说明：将扩展资源中的 SVG 图标生成 VS Code 可注册的 WOFF 产品图标字体。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-10-08
// 备注：logo 图标固定映射到 U+E001。
// ------------------------------------------------------------------------

const path = require('node:path');

module.exports = {
  inputDir: path.resolve(__dirname, 'resources'),
  outputDir: path.resolve(__dirname, 'resources'),
  name: 'vscode-tools-icons',
  fontTypes: ['woff'],
  assetTypes: [],
  fontHeight: 1000,
  formatOptions: {
    svg: {
      fixedWidth: true,
      centerHorizontally: true,
      centerVertically: true,
    },
  },
  codepoints: {
    logo: 0xe001,
  },
};
