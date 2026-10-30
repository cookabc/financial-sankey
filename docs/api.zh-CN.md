# 流账：可复用财报桑基图

[English](api.md) · **简体中文**

此工具处理任何公司**按规范整理的结构化财报**，不是 PDF/OCR 或自然语言识别器。运行与渲染都在本地，不需要外部 API。公司名称、节点显示文字及具体金额不参与布局选择；语义由显式 role、mainChain、metric 和 metadata 提供。

## 模块边界

- `src/core/financial-data.js`：规范化、币种单位一致性、会计等式校验、利润桥构建。纯函数，不改变输入。
- `src/core/table-data.js`：三列 CSV/TSV 解析、通用 DAG 分析、CSV 序列化。
- `src/core/layout.js` / `top-layout.js`：d3-sankey 自动布局；符合条件的显式主链采用上沿对齐财务布局。无法应用则返回原因，使用自动布局。
- `src/core/theme.js`：role 驱动的配色，不匹配节点名称。
- `src/core/render-svg.js`：纯 SVG 字符串输出，无 DOM、文件系统或网络依赖。
- `src/core/trace.js`：路径追踪与收入占比。给定节点返回其上下游完整因果路径（节点集合 + 流向集合），以及该节点占收入的百分比。纯函数，供页面交互使用，不参与布局。
- `src/browser/project.js`：项目文件读写、页面速填和三列表适配；不覆盖原数据及自定义配色。
- `src/browser/session.js`：与页面无关的会话策略——换数据源时的抬头重置规则、节点兄弟列与排序数学。纯函数，可脱离页面测试。
- `src/browser/panels.js`：来源卡与数据明细表的渲染。
- `src/browser/feedback.js`：toast 与悬停提示等瞬时反馈。
- `src/browser/export.js`：仅浏览器的下载、PNG 画布转换与导出编排（按钮态、结果播报）。
- `src/app.js`：页面状态与事件接线；策略在 `session.js`，渲染在 `panels.js`。
- `examples/`：可核验的外置真实样例。`fixtures/` 全是明确标注的合成测试数据，不展示为公司财报。

## 安装与命令行

要求 Node.js 22+。在源码目录执行 `npm ci`。

```sh
node scripts/render-financial.mjs examples/spacex-2026-q3.json --output chart.svg
node scripts/render-financial.mjs fixtures/tax-benefit-income.json --output chart.svg --gradient
```

`--strict-width` 关闭最小可见线宽。CLI 不读取浏览器存储，不发网络请求，也不自动校验来源网页。PNG 是页面的浏览器导出能力；CLI 原生输出 SVG。

## JavaScript 调用

```js
import { readFile, writeFile } from 'node:fs/promises';
import { normalizeInput, layoutFinancialGraph, renderSvg, generateSvg } from './src/core/index.js';

const input = JSON.parse(await readFile('report.json', 'utf8'));
const svg = generateSvg(input, { palette: 'clear', ribbon: 'solid', minWidth: 4 });
await writeFile('report.svg', svg);

// 分步骤使用，允许展示不平衡诊断但不得伪装为已核验导出：
const report = normalizeInput(input);
const diagram = layoutFinancialGraph(report, { layout: 'financial' });
console.log(diagram.model.warnings, diagram.rail?.reason);
if (diagram.model.balanced) console.log(renderSvg(diagram));
```

格式详情见 [financial-format.md](./financial-format.md)。两种显式 schema：`liuzhang.financial` 自定义 DAG，或 `liuzhang.income-statement` 分阶段利润表。页面上传和打开项目均可接收这两种 JSON。

## 渲染约定与边界

- 矩形真实高度与流值同比例。主链从源节点右边顶端输出；收益从目标左侧合流允许自然弯曲。
- 最小线宽默认 4 画布像素，是独立显示增强，不会改写金额。显示流宽与节点高度共同调整，显示端口也保持守恒；说明保留在使用指南和样式帮助，图表不添加绘图说明脚注。0 为严格比例。
- 结构化输入使用明确的公司、期间、币种与单位；混合币种/单位拒绝，绝不自动换算。
- 亏损使用明确标注的**非现金会计差额桥**并回退自动布局，不把差额当收入。不应将全部源节点之和称为营收。
- 缺失项目必须明确填写 0 或从结构中省略；不能留空后自动当零。全零数据有效但没有可绘制宽度，绘图会给出错误。
- 原始三列表仅表达非负、无环流向，未知语义不猜财务指标。明确主链可在样式中设置节点 ID；不能匹配则回退。
- 结构化 JSON 会保留自定义显示名和来源；直接编辑三列表会清除原结构化语义/来源关联，避免把修改值仍标成官方原数据。
- 项目文件只接受当前格式（`liuzhang.sankey` 版本 2）；其他版本会明确报错，不会静默改写或猜测。
- 导出前需解决中间节点不平衡。循环、非数、无法精确保留的十进制总和会明确报错，不加隐藏差额。
- 来源是调用者提供的说明，不代表工具独立审计或验证。生成图属于会计构成桥，并非现金流量表。

## 验证

`npm test` 包括几何快照、任意 ID/标签变换、正/负利润、税收收益、零值、小数、币种单位、项目读写、CLI、CSV/XLSX、导出与 UI 错误流；`npm run build` 打包静态站。

### 已知支持范围

这不是对任意公司、任意财报的无条件保证。利润表需按上面的阶段与增减项目规范化；资产负债表和现金流量表不自动转换为利润桥，需要调用者先建模成守恒 DAG。最多 80 个节点；三列表入口最多 200 条流向。财务主链要求 2–12 个连续节点、独立加项来源及直接扣减终点；复杂网络或亏损桥回退自动布局。密集来源会扩大画布，不丢弃项目，但拥挤图仍应人工复核标签。

极小数值导致尺度溢出、金额跨度导致正流量低于浮点坐标精度，均会明确报错而非生成 NaN/Infinity 图。可按提示选择合适的统一单位；若比例本身过大，应拆图或由调用者明确舍入，不会静默补数或取绝对值。最小线宽只增强可见部分：整条流带在源、目标两端使用同一个显示宽度，上下边界各是一条标准三次贝塞尔，不做局部收口或锥形收边；相邻流带按显示端口依次铺满节点高度，因此不会互相覆盖。

节点标签在绘制前统一排版：先钳制在页眉与脚注之间，再对水平范围重叠的标签做垂直避让；若避让后超出画布，画布向下扩展而不是把标签压回邻标签之上。与流带相交的标签行会获得不透明纸色底衬。文字折行按字符宽度（中文 1 格、拉丁约 0.55 格）计算并保持拉丁词完整。

测试覆盖多结构合成样例和已知反例，不等同所有图形的视觉质量保证。

图表交互：悬停任一节点或流带会把它的完整因果路径高亮、其余淡出，并在图表上方显示该节点的金额与**占收入百分比**——一个原始数字无法说明它是否要紧，「研发费用占收入 31.5%」才能。追踪只切换 CSS 类，不重建 SVG，因此悬停零重绘；导出时追踪不会进入 SVG（导出从布局结果渲染，不读实时 DOM）。

标签避让在渲染前按字宽估算计算。为避免“估算正确、真实字体却碰撞”，`npm run verify:labels` 会在无头 Chrome 中加载构建产物，用 canvas `measureText` 取真实字形墨迹范围，逐对比较九种状态（三个官方示例的财务/自动布局、亏损桥、英文 CSV、单流向速填、同宽标签堆叠、80 节点长链）并检查是否越出画布；当前结果为 0 碰撞、0 出界。它需要本地 HTTP 服务：

```sh
python3 -m http.server 8123 --bind 127.0.0.1 --directory dist
npm run verify:labels
```

该脚本只覆盖这六种状态。极端密集或全新的数据结构仍建议目视复核一次。

### Display-width solver

Monetary `value` and proportional `actualWidth` never change. `width` is the
rendered vertical band width, including at both node endpoints. Each internal
node independently packs incoming and outgoing ports to its displayed height.

For minimum m, solve min sum(delta_e² / (2(1 + actualWidth_e))) subject to
delta_e >= max(0, m - actualWidth_e) and B delta = 0. Weighted Dykstra has a
2,000-iteration bound; acceptance requires iterate change < 1e-9 px and
conservation residual < 1e-8 px. A nonconverged iterate is never rendered.
The bounded fallback extends every deficit to whole source-to-sink paths using
the original flow proportions; it is feasible, deterministic, and not claimed
to be least-change. It takes O(V+E). Final residual must be <= 1e-7 px or an
explicit error is returned. Graph diagnostics expose method, iterations,
residual and objective. No labels or IDs enter the optimization. Repeated
layout starts from actual widths, so enhancements do not accumulate.

Minimum 0 disables all display additions. Minimum is measured vertically in
SVG canvas pixels, not perpendicular to strongly sloping bands or in CSS
viewport pixels. No output can guarantee arbitrary label collision freedom.
