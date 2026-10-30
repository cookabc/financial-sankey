# 流账 · 财报桑基图生成器

纯静态工作台与独立 JavaScript API。界面默认英文，顶栏可切换到中文。数据只在本机处理，没有外部 API、账号连接、分析追踪或 CDN。输入规范化后的任意公司财报，或三列流向数据；不自动读取 PDF、OCR 或散乱自然语言。

<p align="center">
  <img src="docs/images/workspace.png" width="880" alt="工作台：左侧粘贴三列流向数据，右侧 SpaceX 2026 Q3 利润流向桑基图，底部标注来源与守恒校验结果">
</p>

上图是载入 SpaceX 2026 Q3 官方财报后的默认状态：营收从左汇入，成本与费用向下流出，净利润靠右；绿色是额外收益。图下注明数据来源与口径，底部状态条给出「流向平衡 · 17 个节点 · 16 条流向」的守恒结论。

- [财报数据规范](docs/financial-format.md)：显式 role / stage / mainChain 与利润表阶段定义。
- [API、CLI 与模块边界](docs/api.zh-CN.md)（[English](docs/api.md)）：无需打开页面即可输出 SVG。
- [本地运行与源码说明](docs/local-setup.zh-CN.md)（[English](docs/local-setup.md)）：版本溯源、离线运行，以及已保存项目不随源码迁移的边界。
- [外置官方样例](examples/)：SpaceX 2026 Q3、Meta 2026 Q3 与 Anthropic 2026 H1（S-1）。来源与计算说明随图导出，不参与核心逻辑。

界面默认英文，可在页首切换中文。按钮、校验提示、内置示例标签、来源说明及导出的 SVG/PNG 均跟随所选语言。用户导入的名称、ID、金额与自定义备注原样保留；原始数据编辑器和主链字段显示原始 ID。切换语言不会改写保存的项目。

## 使用

Node.js 24.x（完整支持范围见 `package.json` 的 `engines`）：`npm ci`、`npm test`、`npm run build`。静态产物在 `dist/`。
`npm run verify:labels` 会在无头 Chrome 里加载构建后的 `dist/`，验证九种状态下标签
既不相撞也不越出画布；运行前需先在 8123 端口起一个静态服务。

```sh
node scripts/render-financial.mjs examples/spacex-2026-q3.json --output chart.svg
```

页面支持 CSV / TSV 粘贴上传、XLSX 多工作表、两种结构化财报 JSON、本地项目保存、SVG / PNG 导出、纯色与渐变、显示增强最小线宽及关闭选项。

## 诚实的数据边界

三列表只接受非负无环流向。规范化财报可明确建模税收收益、负调整与经营/净亏损；亏损使用有说明的非现金会计差额桥，不是额外收入。缺失、混币种/单位、无法精确保留的十进制总和均明确报错，不取绝对值掩盖问题，不偷偷补数或换汇。不平衡可预览，必须修正后才能导出。

项目保存在浏览器 localStorage 里，打开或导入都不会上传内容。项目文件记录自己的 schema 版本，版本不符会明确报错，不会被悄悄改写。

## 验证

几何快照覆盖上沿输出、窄直角矩形、真实比例、自然左右分支和细线显示。测试包括多种合成财报结构、重命名语义不变、亏损恢复、小数、零值、混合币种、异常守恒、恶意文本、项目读写、CSV/XLSX、CLI 和 UI。合成数据只在 `fixtures/` 用于测试，不作为页面公司示例；`fixtures/us/` 收录六份经 SEC EDGAR XBRL 渲染报表逐行核验的真实美股财报（Apple、Microsoft、NVIDIA、Alphabet、Amazon、Intel），同样只作测试输入，派生/残差行项在各文件 notes 中明确标注。

`src/core/index.js` 是唯一的公共 API。源码与构建产物按小步提交并同步远端，静态包与保存版本使用相同 commit。

## 许可

MIT，见 [LICENSE](LICENSE)。

English readme: [README.md](README.md).

## 开发与浏览器检查

使用 Node.js 24.x 和 npm；本机版本由 `.nvmrc` 记录。

```sh
npm ci
npm run dev
```

打开 **http://127.0.0.1:4183/**。Vite 自动刷新源码修改。`npm run check` 依次执行 ESLint、Node 测试和生产构建检查；`npm run preview` 预览已构建的 `dist/`。开发和预览服务均可用 Ctrl+C 停止。

JavaScript、CSS 和按需加载的 Excel 模块使用内容哈希文件名。中英文指南在开发环境可下载，并随生产构建输出。独立 API 与 CLI 继续使用不依赖浏览器的源码模块。

```sh
npx playwright install chromium
npm run test:e2e
```

浏览器测试先构建页面，再在 **127.0.0.1:4283** 启动独立预览。桌面和手机尺寸的 Chromium 测试覆盖建图、流量守恒校验、SVG 下载、本地导入与刷新恢复、指南下载、键盘页签及系统文件选择器。CI 自动安装 Chromium，并在测试失败时上传轨迹和截图。本机已有 Chrome 时，可运行 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。该套件未覆盖 Safari 和 Firefox。

`src/browser/import.js` 负责文件读取与校验；只有最近一次导入可以替换当前项目，编辑会取消待完成的导入。替换失败时保留当前项目及已保存的数据。PNG 转换期间禁止重复导出，结束时按当前图表状态恢复按钮。
