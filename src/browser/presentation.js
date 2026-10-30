import sampleCopy from '../examples/en.json' with {type:'json'};
import {EXAMPLES} from '../examples/registry.js';

const owned = {
  ...sampleCopy,
  '财务流向分析':'Financial flow analysis','未指定期间':'Period not specified','未指定':'Unspecified','万元':'10,000 CNY',
  '收入':'Revenue','营业成本':'Cost of revenue','销售费用':'Selling expenses','管理费用':'Administrative expenses','财务费用':'Finance costs','所得税':'Income tax',
};
/** Translates application-owned labels. Never apply this to arbitrary imported data. */
export function ownedText(text, lang) {
  if(lang!=='en'||typeof text!=='string')return text;
  if(Object.hasOwn(owned,text))return owned[text];
  for(const [suffix, translated] of [['计算池（非现金利润桥）',' calculation pool (non-cash profit bridge)'],['亏损结转（非现金）',' loss carried forward (non-cash)'],['（亏损差额，非现金）',' (loss difference, non-cash)'],['计算池',' calculation pool']]) {
    if(text.endsWith(suffix))return ownedText(text.slice(0,-suffix.length),lang)+translated;
  }
  return text;
}
const signature = report => JSON.stringify([report.nodes,report.links,report.metadata.source]);
const samples = new Map(EXAMPLES.map(x=>[signature(x.document),x.document]));
export function isBuiltIn(report) {return Boolean(report&&samples.has(signature(report)));}
const neutralHeadings = new Set(['财务流向分析', '未指定期间', '未指定', '万元']);
const generatedNotes = [
  ' / loss stages use a signed non-cash bridge, not a positive profit rail.',
  ' / zero balances do not form a positive-width main rail.',
  ' / signed adjustment reverses its stated direction.',
];
function presentMetadata(report, original, lang, defaults) {
  const metadata = {...report.metadata};
  for (const key of ['title', 'period', 'currency', 'unit', 'company']) {
    const value = metadata[key];
    if (original && value === original.metadata[key] || defaults && neutralHeadings.has(value)) {
      metadata[key] = ownedText(value, lang);
    }
  }
  if (original && metadata.source) {
    const source = metadata.source;
    metadata.source = {
      ...source,
      title: ownedText(source.title, lang),
      notes: ownedText(source.notes, lang),
      footnotes: source.footnotes?.map(text => ownedText(text, lang)),
      links: source.links?.map(link => ({...link, label: ownedText(link.label, lang)})),
    };
  }
  return metadata;
}
/** Display copies retain every ID, amount, link, sign and source URL. */
export function presentReport(report, {lang = 'en', finance = false, defaults = false} = {}) {
  const original = samples.get(signature(report));
  const controlled = finance || Boolean(original);
  const note = text => generatedNotes.some(suffix => text.endsWith(suffix))
    ? localizeDiagnostic(text, lang) : text;
  if (lang !== 'en') return {...report, notes: report.notes.map(note)};
  return {
    ...report,
    nodes: controlled ? report.nodes.map(node => ({...node, label: ownedText(node.label, lang)})) : report.nodes,
    metadata: presentMetadata(report, original, lang, finance || defaults),
    notes: report.notes.map(text => controlled ? ownedText(note(text), lang) : note(text)),
  };
}
const diagnostics = {
 '请先输入数据，或载入一个示例。':'Enter flow data or load a sample first.',
 '文本过大，请精简到 200 条流向以内。':'The text is too large. Use no more than 200 flows.',
 '引号未闭合，请检查 CSV 中的双引号。':'A quote is unclosed. Check the CSV double quotes.',
 '没有找到可用的数据行。':'No usable data rows were found.',
 '只有表头，没有数据。':'The table contains a header but no data.',
 '当前最多支持 200 条流向，请拆分为多个图表。':'Use no more than 200 flows. Split larger tables into multiple charts.',
 '没有可绘制的流向。':'There are no flows to draw.',
 '金额必须是 0 至 1,000,000,000,000,000 之间的有限数值，请统一单位。':'Amounts must be finite numbers between 0 and 1,000,000,000,000,000. Use one common unit.',
 '所有金额均为零，没有可绘制的流向。':'All amounts are zero; there are no flows to draw.',
 '当前最多支持 80 个节点，请合并小额项目。':'Use no more than 80 nodes. Combine smaller items.',
 '请完整填写金额，缺失项目请明确填 0。':'Complete every amount. Enter 0 explicitly for missing items.',
 '不是有效的流账项目或结构化财报文件。':'This is not a valid Liuzhang project or structured statement.',
 '项目数据过大。':'The project data is too large.',
 '工作簿含没有缓存结果的公式，请先在 Excel 中计算并保存，或导出 CSV。':'The workbook contains formulas without cached results. Calculate and save it in Excel, or export CSV.',
 '请先修正中间节点流量差额。':'Reconcile the intermediate nodes before exporting.',
 '图表图片转换失败':'Image conversion failed.', '无法生成图片':'The PNG image could not be generated.',
 '金额数量级超出当前布局可安全计算的范围。请换用更小的统一单位后重试；原始金额未被改写。':'The amounts exceed the safe layout range. Adjust the common unit and try again; original amounts are unchanged.',
 '金额跨度过大，最小正流量低于当前图表的数值精度。请拆分图表或提供明确舍入后的数据；不会自动舍弃或改写金额。':'The range of amounts exceeds chart precision. Split the chart or supply explicitly rounded data. No amount is discarded or changed automatically.',
 '布局计算超出当前数值精度，无法安全绘制这些金额。请调整统一单位，或拆分金额跨度过大的图表；原始金额未被改写。':'The layout exceeds numeric precision. Adjust the common unit or split the chart. Original amounts are unchanged.',
 '最小线宽必须是有限非负数。':'Minimum width must be a finite non-negative number.',
 '展示流量必须是有限正数。':'Display flow must be finite and positive.',
 '展示流量约束无法求解，请检查数据结构。':'Display flow constraints cannot be solved. Check the data structure.',
 '最小线宽展示约束无法安全满足，请使用严格比例。':'Minimum width constraints cannot be met safely. Use strict proportions.',
 '展示流量不支持循环。':'Display flow does not support cycles.',
 '请先修正不平衡数据；当前使用自动布局。':'Reconcile the flows first. Automatic layout is in use.',
 '请配置 2–12 个不重复的主链节点，当前使用自动布局。':'Configure 2–12 distinct main-chain nodes. Automatic layout is in use.',
 '主链节点未匹配当前数据，请更新主链设置；当前使用自动布局。':'The main chain does not match the data. Update its settings. Automatic layout is in use.',
 '主链末端不是终点，请补全主链；当前使用自动布局。':'Complete the main chain through its final destination. Automatic layout is in use.',
 '主链必须按真实流向连续连接；当前使用自动布局。':'Main-chain nodes must follow connected flows. Automatic layout is in use.',
 '主链存在跨级流向；当前使用自动布局。':'The main chain skips a stage. Automatic layout is in use.',
 '扣减支流需直接到终点；复杂分支使用自动布局。':'Deduction branches must go directly to a terminal node. Complex branches use automatic layout.',
 '附加支流需来自独立源头；复杂分支使用自动布局。':'Addition branches must come from independent sources. Complex branches use automatic layout.',
 '存在主链外的多级网络；当前使用自动布局。':'There is a multi-stage network outside the main chain. Automatic layout is in use.',
 '主链端口与节点流量不一致，请修正数据；当前使用自动布局。':'Main-chain ports and node flows disagree. Correct the data. Automatic layout is in use.',
};
const englishToChinese={
 'File is too large. Use a project under 1 MB or table under 5 MB.':'文件过大。项目文件须小于 1 MB，表格须小于 5 MB。',
 'Choose a JSON project file.':'请选择 JSON 项目文件。',
 'No readable sheets. Choose a workbook containing flow data.':'没有可读取的工作表。请选择包含流向数据的工作簿。',
 'Choose a CSV, TSV, TXT, XLSX or JSON file.':'请选择 CSV、TSV、TXT、XLSX 或 JSON 文件。',
 'Canvas is unavailable. Try exporting SVG instead.':'画布不可用，请尝试导出 SVG。',
};
const rules=[
 [/^「(.*)」没有流向；.*$/,m=>`“${m[1]}” has no flows. Its metadata is retained with no drawn width.`],
 [/^(\d+) 条零金额流向保留在数据与明细中.*$/,m=>`${m[1]} zero-valued flows remain in the data and detail table and are not drawn.`],
 [/^(.+): 报告值 (.+) 与明细计算值 (.+) 不一致；.*$/,m=>`${m[1]}: reported total ${m[2]} differs from calculated total ${m[3]}. No balancing item is inserted.`],
 [/^(.+): 未知节点 (.+) \/ unknown node\.$/,m=>`${m[1]}: unknown node ${m[2]}.`],
 [/^(.+): 重复节点 ID (.+) \/ duplicate node ID\.$/,m=>`${m[1]}: duplicate node ID ${m[2]}.`],
 [/^第 (\d+) 行需要「来源、去向、金额」三列。.*$/,m=>`Row ${m[1]} needs source, target and amount. Quote amounts containing thousands separators, or paste tab-separated cells.`],
 [/^第 (\d+) 行的来源和去向不能为空。$/,m=>`Row ${m[1]} needs both a source and a target.`],
 [/^第 (\d+) 行的节点名称过长，请控制在 80 个字符以内。$/,m=>`Row ${m[1]} has a node name over 80 characters.`],
 [/^第 (\d+) 行金额不是有效数字。.*$/,m=>`Row ${m[1]} has an invalid amount. Remove currency symbols, percent signs and units.`],
 [/^第 (\d+) 行金额为负数。.*$/,m=>`Row ${m[1]} has a negative amount. Use a positive amount and an explicit direction for refunds or losses.`],
 [/^第 (\d+) 行金额过大。.*$/,m=>`Row ${m[1]} has an amount that is too large. Use a larger common unit.`],
 [/^「(.*)」流向自身，请修改。$/,m=>`“${m[1]}” flows to itself. Change this link.`],
 [/^存在循环流向（涉及「(.*)」）。.*$/,m=>`A cycle involves “${m[1]}”. Flows must form a directed acyclic graph.`],
 [/^(\d+) 条重复流向已合并求和。$/,m=>`${m[1]} duplicate flows were combined and summed.`],
 [/^(\d+) 条零金额流向保留在明细中，宽度为零、不绘制。$/,m=>`${m[1]} zero-valued flows remain in the detail table and are not drawn.`],
];
/** Diagnostics are application copy; paths and supplied node names remain intact. */
export function localizeDiagnostic(value, lang) {
 const text=String(value??'');
 if(lang==='zh'){
  if(/Unexpected token|Expected property name|Expected.*JSON|Unexpected end of JSON/i.test(text))return 'JSON 格式不正确，请检查引号、逗号和括号。';
  return englishToChinese[text]??text.split(' / ')[0];
 }
 if(Object.hasOwn(diagnostics,text))return diagnostics[text];
 if(text.endsWith(' / loss stages use a signed non-cash bridge, not a positive profit rail.'))return 'Negative profit clears the main chain and uses automatic layout. At each pool: previous positive balance + additions + current loss difference = previous loss carried forward + deductions + current positive balance. Loss differences and carry-forwards are non-cash accounting bridges, not revenue, financing or cash flow. Revenue nodes still represent actual revenue. Negative balances are displayed at adjacent stages, rather than carried along a positive-width profit rail.';
 if(text.endsWith(' / zero balances do not form a positive-width main rail.'))return 'A zero balance clears the main chain and uses automatic layout. Zero-valued nodes and flows are retained without inventing visible width.';
 for(const [pattern,format]of rules){const match=pattern.exec(text);if(match)return format(match);}
 // The normalizer already provides two deliberate language editions.
 const separator=text.lastIndexOf(' / ');
 if(separator>=0&&/[\p{Script=Han}]/u.test(text.slice(0,separator))){
  const path=text.match(/^([\w.[\]/-]+): /)?.[0]??'';
  return path+text.slice(separator+3);
 }
 return text;
}

/** Built-in headings get a display edition only while their original value is intact. */
export function headlineValue(state, key, lang) {
  const value=state.config[key];
  if(!state.document&&neutralHeadings.has(value))return ownedText(value,lang);
  return isBuiltIn(state.document)&&value===state.document.metadata[key]?ownedText(value,lang):value;
}
