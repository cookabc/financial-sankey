# 可复用的财务输入格式

[English](financial-format.md) · **简体中文**

`src/core/financial-data.js` 是一个纯 ES 模块。它不依赖 UI、网络、存储、公司示例、渲染、颜色或布局。它接受普通 JavaScript 对象，并导出：

```js
import {
  normalizeFinancialGraph,
  buildIncomeStatement,
  normalizeInput,
} from './src/core/financial-data.js';

const graph = normalizeInput(JSON.parse(jsonText));
```

- `normalizeFinancialGraph(input)` 校验下文所述的规范图格式。
- `buildIncomeStatement(input)` 将下文所述的有序利润表格式编译为规范图。
- `normalizeInput(input)` 依据显式的 `schema` 字段进行分派。它不解析 JSON 文本、不推断公司、不识别报告，也不猜测 schema。

每个函数都保持其输入不变，并返回一个新对象。没有 ID、标签、公司名称、来源 URL 或金额会选中特殊样式或特殊会计处理。渲染器应使用显式的 role 和 `mainChain`，绝不要使用名称匹配。本模块不会把利润桥接解释为现金流量表。

## 1. 共享元数据与金额

两种格式都要求：

```json
{
  "metadata": {
    "title": "User-supplied statement title",
    "company": "Optional user-supplied company name",
    "period": "User-supplied reporting period",
    "currency": "USD",
    "unit": "million",
    "source": {
      "title": "User-supplied reference title",
      "url": "https://example.org/report",
      "publishedAt": "2026-01-31",
      "notes": "Optional source note",
      "links": [{ "label": "Reference table", "url": "https://example.org/table" }],
      "footnotes": ["Optional original footnote"]
    }
  }
}
```

`title`、`period`、`currency` 和 `unit` 是必填的非空字符串。`company` 和 `source` 是可选的。如果提供了 `source`，则其 `title` 和 HTTP(S) 的 `url` 为必填，其余所示字段为可选。这些字段仅属于溯源内容。本模块不会抓取或验证任何内容。省略 source 绝不会添加默认或虚构的报告归属。

所有金额必须是有限的 JSON 数字，绝对值至多 `1e15`。如有必要，请使用更大的通用展示单位。数字字符串、`null`、缺失金额、`NaN` 和无穷大都是错误，而不是零。不存在单位换算、汇率换算、货币符号解析或百分比解析。

每条图链接、报表收入/分组、报表阶段或调整项都可以选择性地重复 `currency` 和 `unit`。任何提供的值必须与对应的元数据值完全相等。混用货币或混用单位的数据会被拒绝。对规范节点上的不受支持货币/单位标注也会进行检查，而不是静默允许冲突的计价单位。

十进制表示在返回普通 JavaScript 数字之前使用十进制运算求和。例如，收入 `0.1` 与 `0.2` 合计为 `0.3`；它们不会产生虚假的浮点损失。报告的总计必须与计算出的数字完全相等。不会插入舍入调整或无法解释的平衡分录。每个精确的十进制和都必须能通过其返回的 JavaScript 数字往返。例如，如果 `1 + 1e-17` 会变成 `1`，模块会以明确的精度错误拒绝该输入。这适用于收入总计、阶段余额和规范节点总计，即使两侧原本会舍入到同一个数字。小额贡献绝不会被静默丢弃。如果经过舍入的公布总计无法核对，请提供有明确来源的舍入调整，或使用能暴露该不平衡的规范数据；不要编造精度。带有极小小数部分的极大金额可能需要更合适的通用单位，或显式舍入且有来源的输入，才能由数值渲染器表示。

在同一个输入内，ID 必须是唯一的非空字符串，包括所有收入组成部分、调整项、阶段余额以及收入总计。标签是独立的展示字符串，可以重复。前导/尾随空白会被裁剪。空标签和空 ID 会被拒绝。

## 2. 规范图

```json
{
  "schema": "liuzhang.financial",
  "version": 1,
  "metadata": {
    "title": "Synthetic canonical example",
    "period": "Test period",
    "currency": "USD",
    "unit": "million"
  },
  "nodes": [
    { "id": "r1", "label": "Revenue component", "role": "source", "signedValue": 100 },
    { "id": "r", "label": "Revenue", "role": "main", "stage": 0, "metric": "revenue", "signedValue": 100 },
    { "id": "c", "label": "Cost", "role": "expense", "signedValue": 60 },
    { "id": "g", "label": "Result", "role": "main", "stage": 1, "signedValue": 40 }
  ],
  "links": [
    { "source": "r1", "target": "r", "value": 100 },
    { "source": "r", "target": "c", "value": 60 },
    { "source": "r", "target": "g", "value": 40 }
  ],
  "mainChain": ["r", "g"],
  "order": ["r1", "r", "c", "g"],
  "notes": ["Synthetic example only, not a real-company statement."]
}
```

### 字段

- `schema` 和 `version`：必须分别为 `liuzhang.financial` 和 `1`。
- `nodes`：非空数组，元素为 `{id, label, role, stage?, metric?, signedValue?}`。
  - `role` 为必填项：`source`、`main`、`expense`、`gain`、`loss` 或 `other`。
  - `stage` 是可选的、非空的字符串或非负整数。
  - `metric` 是可选的显式非空字符串。它仅具描述性，不是由名称推导出的分类，也不是样式指令。
  - `signedValue` 是可选的带符号有限数字，用于如实标注。它不是链接宽度，规范化过程不会用其绝对值替换它。对于自定义图，作者仍需对其指标与流量之间的关系负责；规范化不会推断这种关系。
- `links`：数组，元素为 `{source, target, value, currency?, unit?}`。端点是已存在的节点 ID。宽度值必须为非负数。负链接、未知端点、自链接和定向环都是错误，包括由零值链接形成的环。重复链接会被保留，而不是静默聚合。
- `mainChain`：必填，元素为互不相同的已存在 ID 的数组。当没有合适的财务主线时使用 `[]`。相邻节点之间必须存在真实的正值链接。它是显式配置，而不是推断出的选择。
- `order`：可选，元素为互不相同的已存在 ID 的数组。允许部分顺序；渲染器可以按输入顺序把未指定的节点放在后面。
- `notes`：可选的非空字符串数组。

规范化结果保留规范字段，若缺失则添加一个空的 `notes` 数组，并添加：

```js
{
  balanced: true,
  warnings: [/* diagnostic objects, not fabricated graph nodes */]
}
```

对于既有入链又有出链的中间节点，总计不相等会将 `balanced` 设为 `false` 并添加 `{type: 'balance', node, in, out, diff}`。规范中的不平衡会被报告，而不是被填补。当 `balanced` 为 false 时，不要启用按比例的财务主线。

零金额和孤立节点会被保留。零链接、孤立节点以及没有正值流量的数据会产生提示性警告（`zero-links`、`isolated-node`、`no-positive-flow`）。全零数据是有效的会计输入，但没有可渲染的正宽度桑基图。渲染器应如实展示该状态，而不是绘制凭空编造的最小金额。为几何布局移除零链接时，不应从源数据或导出中移除零值指标。

## 3. 利润表便捷格式

```json
{
  "schema": "liuzhang.income-statement",
  "version": 1,
  "metadata": {
    "title": "Synthetic ordered statement",
    "period": "Test period",
    "currency": "USD",
    "unit": "million"
  },
  "revenue": {
    "id": "revenue",
    "label": "Total revenue",
    "items": [
      { "id": "product", "label": "Products", "value": 80 },
      { "id": "service", "label": "Services", "value": 20 }
    ],
    "reportedValue": 100
  },
  "stages": [
    {
      "id": "gross",
      "label": "Gross result",
      "deductions": [{ "id": "cost", "label": "Cost of sales", "value": 60 }],
      "reportedValue": 40
    },
    {
      "id": "net",
      "label": "Net result",
      "additions": [{ "id": "interest", "label": "Interest income", "value": 2 }],
      "deductions": [{ "id": "tax", "label": "Tax benefit", "value": -3 }],
      "reportedValue": 45
    }
  ],
  "notes": ["Synthetic example only, not a real-company statement."]
}
```

### 精确契约

```text
{
  schema: 'liuzhang.income-statement',
  version: 1,
  metadata: SharedMetadata,
  revenue: {
    id: string,
    label: string,
    items: Array<{id: string, label: string, value: nonnegative number,
                  currency?: string, unit?: string}>,
    reportedValue?: nonnegative number,
    currency?: string,
    unit?: string
  },
  stages: Array<{
    id: string,
    label: string,
    additions?: Array<{id: string, label: string, value: signed number,
                       currency?: string, unit?: string}>,
    deductions?: Array<{id: string, label: string, value: signed number,
                        currency?: string, unit?: string}>,
    reportedValue?: signed number,
    currency?: string,
    unit?: string
  }>,
  notes?: string[]
}
```

`revenue.items` 必须至少包含一个项目。收入组成部分不能为负数。抵减收入的调整项应显式建模为后续的扣减项，或使用自行编写的规范图，而不是使用取绝对值的收入。`stages` 为必填项，可以为空。输入顺序即会计顺序。省略 `additions` 或 `deductions` 数组意味着该阶段没有提供该类型的调整项。项目内缺失 `value` 属于错误。

收入是所提供各分组的和。每个阶段按如下方式计算：

```text
current signed balance = previous signed balance
                      + sum(additions.value)
                      - sum(deductions.value)
```

提供的 `reportedValue` 必须与之匹配。可选的报告值只是校验，不是覆盖值。模块只创建所提供的阶段和指标：当毛利润、营业利润、税项或净利润缺失时，它不会凭空编造。

### 带符号调整与利润

- 正的 addition 作为 `gain` 节点流入。
- 正的 deduction 作为 `expense` 节点流出。
- 负的 addition 会被显式反转为一条流出扣减。
- 负的 deduction（例如所得税收益）会被显式反转为一条流入的 gain。
- 调整节点的 `signedValue` 始终保留原始提供的符号。生成的注释会标明原始方向、带符号金额、生效方向以及幅度。不会对任意负金额应用无法解释的 `abs()`。

对于非负、仅含扣减的转换，成本从先前的指标节点拆分为各项费用与下一个余额。当某个阶段包含 gains 时，一个中性计算池接收上一余额和新增的 gains，然后再分配扣减项与得到的余额。计算池的 `role` 为 `'other'`，`metric` 为 `'calculation-pool'`，并带有描述性标签。它们不是收入或利润指标。因此，先前的收入/利润节点会保留其真实货币值，而不会被后续 gains 抬高。在严格比例模式下，其高度跟随该值；最小宽度模式会单独分配保守的展示像素（参见 API 指南）。必要时，正的 `mainChain` 路径会包含这些计算池。

### 亏损与非现金带符号桥接

负利润不是正收入，不能用负的桑基宽度表示。以亏损开始或结束的阶段使用以下精确恒等式：

```text
previous positive balance + effective additions + current deficit
  = previous deficit carried forward + effective deductions + current positive balance
```

对于任意带符号余额 `B`，其正数部分为 `max(B, 0)`，亏损差额为 `max(-B, 0)`。这些是数学上定义的会计术语，不是猜测的现金流。每个为负的阶段结果保留其带符号金额，使用 role `loss`，并标注为 `亏损差额，非现金`（deficit, non-cash）。先前的亏损差额会在下一阶段作为一个显式标注的 `亏损结转（非现金）`（deficit carried forward, non-cash）汇点出现。一个中性计算池平衡这些项以及所提供的 additions/deductions。亏损差额的这两种视图是彼此独立的节点，因此 DAG 不会获得具有误导性的反向环。

例如，收入 `40` 配成本 `50` 得到结果 `-10`。实际的收入节点仍然是 `40`。一个单独标注的 `10` 非现金亏损差额进入中性计算池，该池向成本发送 `50`。这**不会**把收入变成 `50`，不会凭空创造融资，也不会声称有 `10` 的现金流入。在后续阶段，先前的亏损差额会在带符号桥接等式中被显式结转。

任何亏损都会把 `mainChain` 清为 `[]`，并添加精确说明。对此表示请使用通用 DAG 布局，而不是正的财务主线。主余额为零时也会以零宽度说明清空 `mainChain`。不要把图中所有源的加总当作“总收入”：在亏损桥接中，它既包含有标注的非现金会计项，也包含收入和其他 gains。请改用显式收入指标的 `signedValue`。

## 4. 测试数据与检查

本实现中所有 `fixtures/*.json` 文件都是**合成测试数据**。它们不是真实公司报告、经过验证的示例或默认页面样本。`fixtures/us/` 目录是例外：它包含六份真实美国财报（Apple FQ3 2025、Microsoft FY25 Q4、NVIDIA FQ2 2026、Alphabet Q3 2025、Amazon Q3 2025、Intel Q2 2025），其行项目已对照 SEC EDGAR XBRL 渲染报表（R-files）进行核验。它们仅作为测试输入，而不是页面样本；任何衍生或残差行项目（该期间未直接披露的值）都会在该文件的 `notes` 中标注。`fixtures/us/edge-*.json` 文件则重新属于合成数据：空阶段、深层链路、`1e15` 上限、微小金额、从亏损到零再到盈利的恢复，以及必须被拒绝的输入（精度损失、负收入、定向环）。

- `positive-income.json`：分组收入、有序利润、gain 池。
- `tax-benefit-income.json`：带诚实收益的负税项扣减。
- `loss-income.json`：负的毛利润、营业、税前和净结果。
- `decimal-income.json`：小十进制金额与精确的报告总计。
- `absent-metrics-income.json`：仅提供一个阶段，不编造指标。
- `missing-value-income.json`：无效的缺失金额，而不是静默的零。
- `zero-adjustment-income.json`：显式零调整。
- `all-zero-income.json`：有效的全零会计，没有可绘制的正流量。
- `mixed-currency-income.json`、`mixed-unit-income.json`：无效的计价单位。
- `mismatched-total-income.json`：无效的报告总计，不允许凑数。
- `renamed-income.json`：结构相同，但标签/ID 完全不相关。
- `unbalanced-graph.json`：报告规范不平衡，且不添加边。

使用以下命令运行隔离测试：

```sh
node --test tests/financial-data.test.mjs
```

测试还覆盖负 additions、从亏损到零再到盈利的恢复、ID 冲突、来源保留、格式错误的图、微小不平衡、不可变性、稳定的重复规范化，以及实际的 `d3-sankey` 节点值。
