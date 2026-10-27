# 流账源码 · 本地运行说明

这是「流账 · 财报桑基图工作台」的完整可编辑源代码，不只是网页构建产物。

## 对应版本

- 线上地址：https://financial-sankey-studio.chuangcius.chatgpt.site
- Sites 最新保存版本：v15；该版本的发布记录状态为 succeeded（2026-10-26 核验）。
- 源码提交：`7504d0c5003cb697d4b2f971fe6bc328a3d9f1a5`。
- 应用源代码、测试、构建配置和 dist 文件与上述提交保持一致；本说明和 SOURCE-PROVENANCE.json 是交付时新增说明。
- 本次仅导出代码，没有修改或重新发布线上网站。

## 方式一：直接运行随附网页（无需安装 npm 依赖）

先解压 ZIP，在 `financial-sankey-source-v15` 文件夹打开终端。若已有 Python 3：

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Windows 若 `python3` 不可用，可改为：

```powershell
py -m http.server 8000 --bind 127.0.0.1 --directory dist
```

打开 http://127.0.0.1:8000 。终端中按 Ctrl+C 停止服务。请不要直接双击 HTML；ES 模块应通过 HTTP 服务访问。

## 方式二：修改源码并重新构建

需要 Node.js 22 或更高版本及 npm。安装依赖需要访问 npm 软件包源；运行应用本身不需要外部 API、账号或密钥。

```sh
npm ci
npm test
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

在浏览器打开 http://127.0.0.1:8000 。修改 `src/` 后重新运行 `npm run build`，再刷新网页。不要把 `dist/` 当作主要编辑入口。

## 文件结构

- `src/`：应用、界面样式、数据校验、布局、SVG 渲染、浏览器导出及 XLSX 处理源代码。
- `scripts/`：构建脚本与命令行 SVG 生成器。
- `tests/`、`fixtures/`：自动化测试与合成测试数据。
- `examples/`：应用随附公开样例，保留其来源说明；不是你的浏览器项目导出。
- `docs/`：财报数据格式与 JavaScript API 文档。
- `dist/`：可直接通过静态 HTTP 服务运行的构建产物。
- `package.json`、`package-lock.json`：依赖清单与锁定版本。
- `README.md`：原项目说明。

## 命令行输出 SVG

```sh
node scripts/render-financial.mjs examples/spacex-2026-q3.json --output chart.svg
```

可选参数：`--gradient`（渐变）和 `--strict-width`（关闭最小显示线宽增强）。

## 数据、安全与许可证

未包含部署平台标识配置 `.openai/hosting.json`（本地运行不需要）、`.git`、`node_modules`、缓存、QA 截图/导出、账号凭据或个人浏览器存储。既有项目数据保存在原浏览器/原网址的 localStorage 中，不随源码迁移；如需迁移，请先在原页面保存项目 JSON，再在本地页面导入。

原仓库未提供独立项目 LICENSE 文件；本包不自行授予新的开源许可。构建产物中的第三方许可注释保留；`npm ci` 安装的依赖各自附带许可证。

## 此次验证

在 Node.js v24.22.1 / npm 11.9.0 环境中：144 项自动化测试全部通过（原 116 项，本轮新增呈现/交互回归与键盘模型测试；移除兼容层后删去 8 条只测旧接口的用例）；构建成功，重复构建的 `dist/` 与仓库内文件逐字节一致；`SOURCE-PROVENANCE.json` 中的 73 个文件哈希已逐一复核。

标签排版另外做了真实字体度量验证。单测按字宽估算判断是否碰撞，但估算是估算；`npm run verify:labels` 会在无头 Chrome 中加载构建后的 `dist/`，用 canvas `measureText` 取真实字形墨迹范围逐对比较。九种状态（SpaceX/Meta 的财务与自动布局、英文 CSV、单流向速填、同宽标签密集堆叠、80 节点长链）结果为 **0 处字形碰撞、0 处越出画布**；每个状态会先自证渲染状态（节点数、平衡标记），生成失败不会冒充通过。

页面行为也在无头 Chrome 里对构建产物做了 13 项检查：启动、标签页往返、粘贴重置抬头、零值说明、键盘焦点、节点重排、SVG 与 PNG 真实导出，以及图表键盘模型（整个图表只占 1 个 Tab 停留点，方向键漫游节点与流带）。

需要先起本地服务：

```sh
python3 -m http.server 8123 --bind 127.0.0.1 --directory dist
npm run verify:labels
```

未验证所有操作系统。

## 移除的兼容层

以下只服务旧接口、生产代码零依赖的代码已删除：

- `src/model.js`、`src/report.js`、`src/financial-layout.js`、`src/semantic-theme.js`：四个兼容门面，唯一消费者是测试。
- `src/legacy/model-v1.js` 与整个 `src/legacy/`：v1 旧入口。
- `project.js` 的 v1 迁移分支，以及 `layoutRevision`、`layoutMigrated`、`restoreProject` 里的旧示例回落逻辑。
- 无消费者的导出：`visibleWidth`、`matchLegacyExample`。
- 所有以旧版本为参照的注释（"earlier build"、"the old build"、"no longer costs" 等），改写为陈述当前约束。

项目文件现在只接受当前格式（`liuzhang.sankey` 版本 2）；其他版本明确报错而不是静默改写。`src/core/index.js` 是唯一公共 API。

保留了一处看似遗留的东西并加了说明：localStorage 键 `liuzhang-project-v1`。它是用户浏览器里已保存项目的真实键，改名会静默丢失数据，所以命名保留、含义写进注释。

## 本轮改动（相对 v15 导出）

线上站点未更新，以下改动仅存在于本地源码。

- 折行按字宽计算（中文 1 格、拉丁约 0.55 格），拉丁单词不再被从中间截断；纯中文折行结果与之前完全一致。
- 净利润在所有配色中取同一个颜色。此前速填表单生成的“净利润”因 metric 不同落到利润色，而示例里同一概念用净利色。
- 零金额流向只有一句说明，并保留在“数据明细”表中；此前数据层说“已保留”、渲染层说“未绘制”，同一面板自相矛盾。
- 表格粘贴容忍行尾多余空单元格（Excel 复制常见），但真正多出的第四列仍然报错。
- 脚注区在布局前就被测量并预留，自动布局不再把节点或标签画到脚注上。
- 节点标签统一排版：先钳制在页眉与脚注之间，再对水平重叠的标签做垂直避让；避让后仍超出则向下扩展画布。与流带相交的标签行获得不透明纸色底衬。六种状态经真实字形度量复核，零碰撞、零出界。
- 切换“流向数据 / 利润表速填”不再把有效图表标记为待更新，也不再抹掉来源徽章。
- 键盘选中节点后焦点回到同一节点，不再掉到 body。
- 粘贴自有数据、导入文件或首次编辑速填表单时重置标题、期间、币种与单位，导出图不再沿用示例公司的抬头。
- 单条流向不再被拉伸成占满画布的色块；布局区按内容量定高并垂直居中。
- **因果路径追踪**：悬停任一节点或流带，它的完整上下游路径高亮、其余淡出，图表上方同时显示该节点的金额与占收入百分比（例如「净利润 · 4,404 百万美元 · 占收入 30.2%」）。追踪只切 CSS 类、不重建 SVG，悬停零重绘；导出时不会带入淡出状态。核心算法在 `src/core/trace.js`，纯函数并有 5 条单测。
- 图表改为「单 Tab 停留点 + 方向键漫游」的组合部件（roving tabindex）。此前 80 节点图有 160 个 Tab 停留点，键盘用户无法越过图表；同时修正 `role="img"` 与可交互子元素的 ARIA 矛盾、校验面板补 `role="status"`。
- `src/app.js` 从 505 行单体拆为四块互不依赖的模块：`browser/feedback.js`（toast/tooltip）、`browser/session.js`（换数据源重置抬头与节点排序的纯策略，配 6 条单测）、`browser/panels.js`（来源卡与明细表）、`browser/export.js`（导出编排收拢到既有导出模块）。app.js 只剩状态与事件接线（约 420 行），行为不变。
- 删除无消费者的导出（`MIN_WIDTH_NOTE`、`RAIL_NOTE`、`SERVICE_TEXT`、`CASH_TEXT`、`displaySamples`、六套配色里零引用的 `cost` 键），并修正 `docs/api.md` 中与实际渲染不符的“平滑收口”描述。
