/**
 * Pure, company-independent financial data normalization.
 * No labels, IDs, company names, colors, or display conventions infer semantics.
 */
const GRAPH_SCHEMA = 'liuzhang.financial';
const STATEMENT_SCHEMA = 'liuzhang.income-statement';
const ROLES = new Set(['source', 'main', 'expense', 'gain', 'loss', 'other']);
const MAX_AMOUNT = 1e15;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function fail(path, message) { throw new Error(`${path}: ${message}`); }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象 / must be an object.');
  return value;
}
function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, '必须是非空字符串 / must be a nonempty string.');
  return value.trim();
}
function amount(value, path, { signed = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, '金额必须是有限数字，缺失值不能当成零 / amount must be a finite number; missing is not zero.');
  if (!signed && value < 0) fail(path, '不能为负数；桑基图宽度不能为负 / negative link or revenue values are not supported.');
  if (Math.abs(value) > MAX_AMOUNT) fail(path, '金额绝对值不能超过 1e15，请调整统一单位 / amount exceeds 1e15; use a larger common unit.');
  return Object.is(value, -0) ? 0 : value;
}
function array(value, path, { nonempty = false } = {}) {
  if (!Array.isArray(value) || (nonempty && !value.length)) fail(path, nonempty ? '必须是非空数组 / must be a nonempty array.' : '必须是数组 / must be an array.');
  return value;
}
function notes(value, path = 'notes') {
  return value === undefined ? [] : array(value, path).map((note, i) => text(note, `${path}[${i}]`));
}
function sourceUrl(value, path) {
  const result = text(value, path);
  let url;
  try { url = new URL(result); } catch { fail(path, '需要有效的 HTTP(S) 来源网址 / must be a valid HTTP(S) source URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) fail(path, '仅支持 HTTP(S) 来源网址 / only HTTP(S) source URLs are supported.');
  return result;
}

// Sum the decimal representations of input numbers, rather than accumulating
// 0.1 + 0.2 binary round-off into a spurious profit/loss or reconciliation plug.
function decimal(value) {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  return { integer: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
}
function sum(values, path = 'amount') {
  if (!values.length) return 0;
  const parts = values.map(decimal);
  const scale = Math.max(...parts.map(part => part.scale));
  const integer = parts.reduce((total, part) => total + part.integer * 10n ** BigInt(scale - part.scale), 0n);
  const result = amount(Number(`${integer}e${-scale}`), path, { signed: true });
  const roundTrip = decimal(result);
  const comparisonScale = Math.max(scale, roundTrip.scale);
  if (integer * 10n ** BigInt(comparisonScale - scale) !== roundTrip.integer * 10n ** BigInt(comparisonScale - roundTrip.scale)) {
    fail(path, '计算总额超出 JavaScript 数字可保留的十进制精度；请调整共同单位或提供明确的舍入数据，不会静默丢弃金额 / exact decimal total cannot round-trip through Number; numeric precision would be lost.');
  }
  return result;
}
function sameAmount(actual, reported, path) {
  if (actual !== reported) fail(path, `报告值 ${reported} 与明细计算值 ${actual} 不一致；不会自动补差 / reported total does not match calculated total; no balancing item is inserted.`);
}
function metadata(input) {
  const source = object(input, 'metadata');
  const result = {};
  for (const key of ['title', 'period', 'currency', 'unit']) result[key] = text(source[key], `metadata.${key}`);
  if (own(source, 'company')) result.company = text(source.company, 'metadata.company');
  if (own(source, 'source')) {
    const provenance = object(source.source, 'metadata.source');
    result.source = { title: text(provenance.title, 'metadata.source.title'), url: sourceUrl(provenance.url, 'metadata.source.url') };
    for (const key of ['publishedAt', 'notes']) if (own(provenance, key)) result.source[key] = text(provenance[key], `metadata.source.${key}`);
    if (own(provenance, 'links')) result.source.links = array(provenance.links, 'metadata.source.links').map((link, i) => {
      object(link, `metadata.source.links[${i}]`);
      return { label: text(link.label, `metadata.source.links[${i}].label`), url: sourceUrl(link.url, `metadata.source.links[${i}].url`) };
    });
    if (own(provenance, 'footnotes')) result.source.footnotes = notes(provenance.footnotes, 'metadata.source.footnotes');
  }
  return result;
}
function consistentUnits(value, meta, path) {
  for (const key of ['currency', 'unit']) {
    if (own(value, key) && text(value[key], `${path}.${key}`) !== meta[key]) {
      fail(`${path}.${key}`, `混合币种或单位不受支持，须统一为 ${meta[key]}；不会自动换算 / mixed currencies or units are not supported; no conversion is performed.`);
    }
  }
}
function uniqueIds(ids, allowed, path) {
  const result = array(ids, path).map((id, i) => text(id, `${path}[${i}]`));
  if (new Set(result).size !== result.length) fail(path, '节点 ID 不能重复 / node IDs must be unique.');
  for (const id of result) if (!allowed.has(id)) fail(path, `未知节点 ${id} / unknown node.`);
  return result;
}

/** Validate a canonical graph without mutating the supplied graph. */
export function normalizeFinancialGraph(input) {
  object(input, 'input');
  if (input.schema !== GRAPH_SCHEMA || input.version !== 1) fail('schema/version', `需要 ${GRAPH_SCHEMA} 版本 1 / expected canonical financial schema version 1.`);
  const meta = metadata(input.metadata);
  const nodes = array(input.nodes, 'nodes', { nonempty: true }).map((item, i) => {
    const path = `nodes[${i}]`;
    object(item, path);
    consistentUnits(item, meta, path);
    const node = { id: text(item.id, `${path}.id`), label: text(item.label, `${path}.label`), role: item.role };
    if (!ROLES.has(node.role)) fail(`${path}.role`, `必须明确指定 ${[...ROLES].join(', ')} / an explicit supported role is required.`);
    if (own(item, 'stage')) {
      if (typeof item.stage === 'number') {
        if (!Number.isInteger(item.stage) || item.stage < 0) fail(`${path}.stage`, '数字阶段必须是非负整数 / numeric stage must be a nonnegative integer.');
        node.stage = item.stage;
      } else node.stage = text(item.stage, `${path}.stage`);
    }
    if (own(item, 'metric')) node.metric = text(item.metric, `${path}.metric`);
    if (own(item, 'netIncome')) node.netIncome = item.netIncome === true;
    if (own(item, 'signedValue')) node.signedValue = amount(item.signedValue, `${path}.signedValue`, { signed: true });
    return node;
  });
  const ids = new Set(nodes.map(node => node.id));
  if (ids.size !== nodes.length) fail('nodes', '节点 ID 必须唯一 / duplicate node IDs.');
  const warnings = [];
  const links = array(input.links, 'links').map((item, i) => {
    const path = `links[${i}]`;
    object(item, path);
    consistentUnits(item, meta, path);
    const link = { source: text(item.source, `${path}.source`), target: text(item.target, `${path}.target`), value: amount(item.value, `${path}.value`) };
    if (!ids.has(link.source) || !ids.has(link.target)) fail(path, '流向引用了未知节点 / link references an unknown node.');
    if (link.source === link.target) fail(path, '节点不能流向自身 / self links are not supported.');
    for (const key of ['currency', 'unit']) if (own(item, key)) link[key] = meta[key];
    return link;
  });
  const incoming = new Map(nodes.map(node => [node.id, []]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  for (const link of links) {
    incoming.get(link.target).push(link);
    outgoing.get(link.source).push(link);
    indegree.set(link.target, indegree.get(link.target) + 1);
  }
  const queue = nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  for (let i = 0; i < queue.length; i++) {
    for (const link of outgoing.get(queue[i])) {
      const degree = indegree.get(link.target) - 1;
      indegree.set(link.target, degree);
      if (degree === 0) queue.push(link.target);
    }
  }
  if (queue.length !== nodes.length) fail('links', '存在循环流向；需要有向无环图 / a directed acyclic graph is required.');
  for (const node of nodes) {
    const ins = incoming.get(node.id), outs = outgoing.get(node.id);
    const inputValue = sum(ins.map(link => link.value), `nodes.${node.id}.incoming`);
    const outputValue = sum(outs.map(link => link.value), `nodes.${node.id}.outgoing`);
    if (ins.length && outs.length && inputValue !== outputValue) {
      warnings.push({ type: 'balance', node: node.id, in: inputValue, out: outputValue, diff: sum([inputValue, -outputValue]) });
    }
    if (!ins.length && !outs.length) warnings.push({ type: 'info', code: 'isolated-node', node: node.id, message: `「${node.label}」没有流向；保留其元数据，但没有可绘制宽度 / isolated node has no flow width.` });
  }
  const zeroCount = links.filter(link => link.value === 0).length;
  if (zeroCount) warnings.push({ type: 'info', code: 'zero-links', count: zeroCount, message: `${zeroCount} 条零金额流向保留在数据与明细中，宽度为零、不绘制 / zero-valued links are kept in the data and detail table with no drawn width.` });
  if (!links.some(link => link.value > 0)) warnings.push({ type: 'info', code: 'no-positive-flow', message: '没有正金额流向；数据有效，但无法绘制有宽度的桑基图 / no positive flow to render.' });
  const mainChain = uniqueIds(input.mainChain, ids, 'mainChain');
  for (let i = 0; i < mainChain.length - 1; i++) {
    if (!outgoing.get(mainChain[i]).some(link => link.target === mainChain[i + 1] && link.value > 0)) fail('mainChain', '主链必须通过正金额流向连续连接 / main-chain nodes must be connected by positive links.');
  }
  const result = {
    schema: GRAPH_SCHEMA, version: 1, metadata: meta, nodes, links, mainChain,
    notes: notes(input.notes), balanced: !warnings.some(warning => warning.type === 'balance'), warnings,
  };
  if (own(input, 'order')) result.order = uniqueIds(input.order, ids, 'order');
  return result;
}

/**
 * Build an accounting bridge from explicitly ordered income-statement stages.
 * A deficit is a labeled, non-cash balancing term derived from the equation,
 * never an invented revenue source, cash inflow, or mismatched-total plug.
 */
export function buildIncomeStatement(input) {
  object(input, 'input');
  if (input.schema !== STATEMENT_SCHEMA || input.version !== 1) fail('schema/version', `需要 ${STATEMENT_SCHEMA} 版本 1 / expected income-statement schema version 1.`);
  const meta = metadata(input.metadata), resultNotes = notes(input.notes);
  const revenue = object(input.revenue, 'revenue');
  consistentUnits(revenue, meta, 'revenue');
  const revenueId = text(revenue.id, 'revenue.id'), revenueLabel = text(revenue.label, 'revenue.label');
  const usedIds = new Set();
  function reserve(id, path) {
    if (usedIds.has(id)) fail(path, `重复节点 ID ${id} / duplicate node ID.`);
    usedIds.add(id);
    return id;
  }
  reserve(revenueId, 'revenue.id');
  function item(value, path, signed) {
    object(value, path);
    consistentUnits(value, meta, path);
    return { id: reserve(text(value.id, `${path}.id`), `${path}.id`), label: text(value.label, `${path}.label`), value: amount(value.value, `${path}.value`, { signed }) };
  }
  const revenues = array(revenue.items, 'revenue.items', { nonempty: true }).map((value, i) => item(value, `revenue.items[${i}]`, false));
  const stages = array(input.stages, 'stages').map((value, index) => {
    const path = `stages[${index}]`;
    object(value, path);
    consistentUnits(value, meta, path);
    const stage = { id: reserve(text(value.id, `${path}.id`), `${path}.id`), label: text(value.label, `${path}.label`) };
    for (const kind of ['additions', 'deductions']) {
      stage[kind] = value[kind] === undefined ? [] : array(value[kind], `${path}.${kind}`).map((adjustment, i) => item(adjustment, `${path}.${kind}[${i}]`, true));
    }
    if (own(value, 'reportedValue')) stage.reportedValue = amount(value.reportedValue, `${path}.reportedValue`, { signed: true });
    return stage;
  });
  function generatedId(base) {
    let id = base, suffix = 1;
    while (usedIds.has(id)) id = `${base}:${suffix++}`;
    usedIds.add(id);
    return id;
  }
  const nodes = [], links = [], mainChain = [revenueId];
  function addLink(source, target, value) { links.push({ source, target, value }); }
  let balance = sum(revenues.map(value => value.value), 'revenue.total');
  if (own(revenue, 'reportedValue')) sameAmount(balance, amount(revenue.reportedValue, 'revenue.reportedValue'), 'revenue.reportedValue');
  for (const component of revenues) {
    nodes.push({ id: component.id, label: component.label, role: 'source', stage: 0, metric: 'revenue-component', signedValue: component.value });
    addLink(component.id, revenueId, component.value);
  }
  nodes.push({ id: revenueId, label: revenueLabel, role: 'main', stage: 0, metric: 'revenue', signedValue: balance });
  let previousId = revenueId, previousLabel = revenueLabel, hasLoss = false, hasZero = balance === 0;
  stages.forEach((stage, index) => {
    const number = index + 1;
    const adjustments = [
      ...stage.additions.map(value => ({ ...value, kind: 'addition', effect: value.value })),
      ...stage.deductions.map(value => ({ ...value, kind: 'deduction', effect: -value.value })),
    ];
    const nextBalance = sum([balance, ...adjustments.map(value => value.effect)], `stages[${index}].balance`);
    if (own(stage, 'reportedValue')) sameAmount(nextBalance, stage.reportedValue, `stages[${index}].reportedValue`);
    const inLoss = balance < 0 || nextBalance < 0;
    hasLoss ||= inLoss;
    hasZero ||= nextBalance === 0;
    // Nonnegative deduction-only stages can share the preceding metric's split.
    // Any added amount or deficit requires a neutral pool, not a bigger revenue.
    const needsPool = inLoss || adjustments.some(value => value.effect > 0);
    const poolId = needsPool ? generatedId(`__liuzhang:pool:${number}`) : previousId;
    if (needsPool) {
      nodes.push({ id: poolId, label: `${stage.label}计算池${inLoss ? '（非现金利润桥）' : ''}`, role: 'other', stage: number, metric: 'calculation-pool' });
      if (balance >= 0) addLink(previousId, poolId, balance);
      mainChain.push(poolId);
    }
    if (balance < 0) {
      const carryId = generatedId(`__liuzhang:carried-deficit:${number}`);
      nodes.push({ id: carryId, label: `${previousLabel}亏损结转（非现金）`, role: 'loss', stage: number, metric: 'carried-deficit', signedValue: balance });
      addLink(poolId, carryId, -balance);
    }
    for (const adjustment of adjustments) {
      const incoming = adjustment.effect > 0 || (adjustment.effect === 0 && adjustment.kind === 'addition');
      nodes.push({ id: adjustment.id, label: adjustment.label, role: incoming ? 'gain' : 'expense', stage: number, metric: `statement-${adjustment.kind}`, signedValue: adjustment.value });
      if (incoming) addLink(adjustment.id, poolId, adjustment.effect);
      else addLink(poolId, adjustment.id, -adjustment.effect);
      if (adjustment.value < 0) {
        resultNotes.push(`「${adjustment.label}」原始${adjustment.kind === 'addition' ? '加项' : '扣减项'}为 ${adjustment.value} ${meta.unit}；按明确的符号反向处理为${incoming ? '增加' : '扣减'} ${incoming ? adjustment.effect : -adjustment.effect} ${meta.unit}，节点 signedValue 保留原始负数 / signed adjustment reverses its stated direction.`);
      }
    }
    nodes.push({ id: stage.id, label: nextBalance < 0 ? `${stage.label}（亏损差额，非现金）` : stage.label, role: nextBalance < 0 ? 'loss' : 'main', stage: number, metric: 'statement-balance', signedValue: nextBalance, netIncome: index === stages.length - 1 });
    if (nextBalance < 0) addLink(stage.id, poolId, -nextBalance);
    else addLink(poolId, stage.id, nextBalance);
    mainChain.push(stage.id);
    balance = nextBalance;
    previousId = stage.id;
    previousLabel = stage.label;
  });
  if (hasLoss) {
    resultNotes.push('存在负利润，mainChain 已清空并使用自动布局。每个计算池遵循：前期正余额 + 加项 + 本期亏损差额 = 前期亏损结转 + 扣减项 + 本期正余额。亏损差额与结转是非现金会计桥，不是收入、融资或现金流；收入节点仍仅表示真实收入。负余额在相邻阶段分别展示，不作为正金额主链结转 / loss stages use a signed non-cash bridge, not a positive profit rail.');
  } else if (hasZero) {
    resultNotes.push('存在零余额，mainChain 已清空并使用自动布局；零值节点与流向保留，不虚增宽度 / zero balances do not form a positive-width main rail.');
  }
  const graph = normalizeFinancialGraph({ schema: GRAPH_SCHEMA, version: 1, metadata: meta, nodes, links, mainChain: hasLoss || hasZero ? [] : mainChain, order: nodes.map(node => node.id), notes: resultNotes });
  // A compiler-produced imbalance is a bug or unsupported numeric precision,
  // never something to hide with an unlabeled balancing input.
  if (!graph.balanced) fail('income-statement', '计算后的会计桥不平衡，请检查金额精度 / generated accounting bridge is not balanced; check numeric precision.');
  return graph;
}

/** Dispatch only explicit, documented schemas; never guess from names. */
export function normalizeInput(input) {
  object(input, 'input');
  if (input.schema === GRAPH_SCHEMA) return normalizeFinancialGraph(input);
  if (input.schema === STATEMENT_SCHEMA) return buildIncomeStatement(input);
  fail('schema', `不支持的数据格式；请选择 ${GRAPH_SCHEMA} 或 ${STATEMENT_SCHEMA} / unsupported input schema.`);
}
