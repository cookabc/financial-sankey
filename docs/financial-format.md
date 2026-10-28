# Reusable financial input format

`src/core/financial-data.js` is a pure ES module. It has no UI, network, storage,
company example, rendering, color, or layout dependency. It accepts ordinary
JavaScript objects and exports:

```js
import {
  normalizeFinancialGraph,
  buildIncomeStatement,
  normalizeInput,
} from './src/core/financial-data.js';

const graph = normalizeInput(JSON.parse(jsonText));
```

- `normalizeFinancialGraph(input)` validates the canonical graph format below.
- `buildIncomeStatement(input)` compiles the ordered income-statement format
  below into a canonical graph.
- `normalizeInput(input)` dispatches using the explicit `schema` field. It does
  not parse JSON text, infer a company, identify a report, or guess a schema.

Every function leaves its input unchanged and returns a new object. No IDs,
labels, company names, source URLs, or amounts select special styling or special
accounting treatment. Renderers should use explicit roles and `mainChain`, never
name matching. The module does not interpret a profit bridge as a cash-flow
statement.

## 1. Shared metadata and amounts

Both formats require:

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

`title`, `period`, `currency`, and `unit` are required nonempty strings.
`company` and `source` are optional. If `source` is supplied, its `title` and
HTTP(S) `url` are required; the other fields shown are optional. These fields
are provenance content only. Nothing is fetched or verified by this module.
Omitting a source never adds a default or fictional report attribution.

All amounts must be finite JSON numbers, with absolute value at most `1e15`.
Use a larger common display unit if necessary. Numeric strings, `null`, absent
amounts, `NaN`, and infinity are errors, not zero. There is no unit conversion,
exchange-rate conversion, currency-symbol parsing, or percentage parsing.

Each graph link, statement revenue/group, statement stage, or adjustment may
optionally repeat `currency` and `unit`. Any supplied value must exactly equal
the corresponding metadata value. Mixed currency or mixed unit data is rejected.
An unsupported currency/unit annotation on a canonical node is also checked,
rather than silently allowing a conflicting denomination.

Decimal representations are summed with decimal arithmetic before returning
normal JavaScript numbers. For example, revenues `0.1` and `0.2` total `0.3`;
they do not create a spurious floating-point loss. Reported totals must equal the
calculated number exactly. No rounding adjustment or unexplained balancing
entry is inserted. Every exact decimal sum must round-trip through its returned
JavaScript number. If, for example, `1 + 1e-17` would become `1`, the module
rejects the input with an explicit precision error. This applies to revenue
totals, stage balances, and canonical node totals, even when both sides would
otherwise round to the same number. Small contributions are never silently
discarded. If rounded published totals do not reconcile, supply an
explicitly sourced rounding adjustment or use canonical data that exposes the
imbalance; do not fabricate precision. Extremely large amounts with tiny
fractional parts may require a more suitable common unit or explicitly rounded,
sourced input before they can be represented by the numeric renderer.

IDs must be unique nonempty strings within an input, including all revenue
components, adjustments, stage balances, and the revenue total. Labels are
independent display strings and may repeat. Leading/trailing whitespace is
trimmed. Empty labels and empty IDs are rejected.

## 2. Canonical graph

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

### Fields

- `schema` and `version`: exactly `liuzhang.financial` and `1`.
- `nodes`: a nonempty array of `{id, label, role, stage?, metric?, signedValue?}`.
  - `role` is required: `source`, `main`, `expense`, `gain`, `loss`, or `other`.
  - `stage` is an optional nonempty string or nonnegative integer.
  - `metric` is an optional explicit nonempty string. It is descriptive, not a
    name-derived classification or styling instruction.
  - `signedValue` is an optional signed finite number for truthful labels. It is
    not a link width, and normalization does not replace it with an absolute
    value. For a custom graph, the author remains responsible for the relationship
    between their metric and their flows; normalization does not infer it.
- `links`: an array of `{source, target, value, currency?, unit?}`. Endpoints are
  existing node IDs. Width values must be nonnegative. Negative links, unknown
  endpoints, self-links, and directed cycles are errors, including cycles formed
  by zero-valued links. Duplicate links are retained, not silently aggregated.
- `mainChain`: required array of distinct existing IDs. Use `[]` when no
  financial rail is appropriate. Consecutive nodes must have a real positive
  link between them. It is explicit configuration, not an inferred selection.
- `order`: optional array of distinct existing IDs. A partial order is allowed;
  a renderer can place unspecified nodes afterward in input order.
- `notes`: optional array of nonempty strings.

The normalized result retains the canonical fields, adds an empty `notes` array
if absent, and adds:

```js
{
  balanced: true,
  warnings: [/* diagnostic objects, not fabricated graph nodes */]
}
```

For an intermediate node with both incoming and outgoing links, unequal totals
set `balanced: false` and add
`{type: 'balance', node, in, out, diff}`. Canonical imbalance is reported, not
filled. Do not enable a proportional financial rail while `balanced` is false.

Zero amounts and isolated nodes are retained. Zero links, isolated nodes, and
data with no positive flow produce informational warnings (`zero-links`,
`isolated-node`, `no-positive-flow`). All-zero data is valid accounting input,
but has no positive-width Sankey to render. A renderer should show that state
plainly instead of drawing invented minimum amounts. Removing zero links for
geometry should not remove zero-valued metrics from source data or exports.

## 3. Income-statement convenience format

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

### Exact contract

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

`revenue.items` must contain at least one item. Revenue components cannot be
negative. A contra-revenue adjustment should be explicitly modeled as a later
deduction or with an authored canonical graph, not an absolute-valued revenue.
`stages` is required and can be empty. The input order is the accounting order.
An omitted `additions` or `deductions` array means that no adjustments of that
kind were supplied for that stage. An absent `value` inside an item is an error.

Revenue is the sum of the supplied groups. Each stage computes:

```text
current signed balance = previous signed balance
                      + sum(additions.value)
                      - sum(deductions.value)
```

A supplied `reportedValue` must match. Optional reported values are checks, not
overrides. The module creates only the stages and metrics supplied: it does not
invent gross profit, operating profit, tax, or net profit when they are absent.

### Signed adjustments and profits

- A positive addition enters as a `gain` node.
- A positive deduction leaves as an `expense` node.
- A negative addition is explicitly reversed into an outgoing deduction.
- A negative deduction, such as an income-tax benefit, is explicitly reversed
  into an incoming gain.
- The adjustment node's `signedValue` always retains the original supplied
  sign. A generated note identifies the original direction, signed amount,
  effective direction, and magnitude. Nothing applies an unexplained `abs()` to
  an arbitrary negative amount.

For nonnegative, deduction-only transitions, costs split from the preceding
metric node into expenses and the next balance. When a stage has gains, a
neutral calculation pool receives the previous balance and the added gains,
then distributes deductions and the resulting balance. Pools have `role:
'other'`, `metric: 'calculation-pool'`, and a descriptive label. They are not
revenue or profit metrics. The preceding revenue/profit node therefore keeps
its real monetary value rather than being inflated by later gains. In strict
proportion mode its height follows that value; minimum-width mode separately
allocates conservative display pixels (see the API guide). Positive
`mainChain` paths include these pools when necessary.

### Losses and non-cash signed bridges

Negative profit is not positive income and cannot be represented by a negative
Sankey width. A stage that starts or ends in loss uses this exact identity:

```text
previous positive balance + effective additions + current deficit
  = previous deficit carried forward + effective deductions + current positive balance
```

For any signed balance `B`, the positive part is `max(B, 0)` and the deficit is
`max(-B, 0)`. These are mathematically defined accounting terms, not guessed
cash flows. Each negative stage result retains its signed amount, uses role
`loss`, and is labeled `亏损差额，非现金` (deficit, non-cash). A prior deficit
appears at the next stage as an explicitly labeled `亏损结转（非现金）`
(deficit carried forward, non-cash) sink. A neutral calculation pool balances
those terms and the supplied additions/deductions. The two views of a deficit
are separate nodes so the DAG does not acquire a misleading backward cycle.

For example, revenue `40` with costs `50` yields result `-10`. The actual
revenue node is still `40`. A separately labeled non-cash deficit of `10` enters
the neutral calculation pool, which sends `50` to costs. It does **not** turn
revenue into `50`, invent financing, or claim a `10` cash inflow. At a later
stage, the prior deficit is explicitly carried in the signed bridge equation.

Any loss clears `mainChain` to `[]` and adds a precise explanation. Use a
general DAG layout for this representation, not a positive financial rail.
A zero main balance also clears `mainChain` with a zero-width explanation.
Do not present the sum of every graph source as "total revenue": in a loss
bridge it includes labeled non-cash accounting terms as well as revenue and
other gains. Use the explicit revenue metric's `signedValue` instead.

## 4. Fixtures and checks

All `fixtures/*.json` files in this implementation are **synthetic test data**.
They are not real-company reports, verified examples, or default page samples.
The `fixtures/us/` directory is the exception: it holds six real US earnings
reports (Apple FQ3 2025, Microsoft FY25 Q4, NVIDIA FQ2 2026, Alphabet Q3 2025,
Amazon Q3 2025, Intel Q2 2025) whose line items were verified against the SEC
EDGAR XBRL rendered statements (R-files). They are test inputs only, not page
samples; any derived or residual line (values not directly disclosed for the
period) is marked in that file's `notes`. `fixtures/us/edge-*.json` files are
synthetic again: empty stages, deep chains, the 1e15 ceiling, tiny amounts,
loss-to-zero-to-profit recovery, and inputs that must be rejected (precision
loss, negative revenue, directed cycles).

- `positive-income.json`: grouped revenue, ordered profits, gain pool.
- `tax-benefit-income.json`: negative tax deduction with an honest gain.
- `loss-income.json`: negative gross, operating, pre-tax, and net results.
- `decimal-income.json`: small decimal amounts and exact reported totals.
- `absent-metrics-income.json`: only one supplied stage, no invented metrics.
- `missing-value-income.json`: invalid absent amount, not silently zero.
- `zero-adjustment-income.json`: explicit zero adjustment.
- `all-zero-income.json`: valid all-zero accounting, no drawable positive flow.
- `mixed-currency-income.json`, `mixed-unit-income.json`: invalid denomination.
- `mismatched-total-income.json`: invalid reported total, no plug allowed.
- `renamed-income.json`: same structure with completely unrelated labels/IDs.
- `unbalanced-graph.json`: canonical imbalance reported without adding an edge.

Run the isolated tests with:

```sh
node --test tests/financial-data.test.mjs
```

The tests also exercise negative additions, loss-to-zero-to-profit recovery,
ID collisions, source preservation, malformed graphs, tiny imbalances,
immutability, stable re-normalization, and actual `d3-sankey` node values.
