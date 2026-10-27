/** Pixel-only conservative flow. Monetary values are never modified.
 * Unique weighted least-change projection: delta >= minimum - true width,
 * delta >= 0, and incoming delta = outgoing delta at every intermediate node.
 * This is a nonnegative combination of complete source-to-sink display flows.
 * Dykstra projects onto conservation and lower bounds; neither IDs nor labels
 * take part in the objective or constraints. Each call starts from true widths.
 */
export function allocateDisplayFlow(graph, minimum = 0) {
  if (!Number.isFinite(minimum) || minimum < 0) throw new RangeError('最小线宽必须是有限非负数。');
  const links=graph.links, internal=graph.nodes.filter(n=>n.sourceLinks.length&&n.targetLinks.length);
  const row=new Map(internal.map((n,i)=>[n,i]));
  const edges=links.map(l=>({s:row.get(l.source),t:row.get(l.target)}));
  const actual=links.map(l=>l.actualWidth??l.width), lower=actual.map(w=>Math.max(0,minimum-w));
  const weights=actual.map(w=>1+w), size=internal.length;
  if (actual.some(w => !Number.isFinite(w) || !(w > 0))) throw new RangeError('展示流量必须是有限正数。');
  let delta=actual.map(()=>0), iterations=0, method='strict';
  const balance=v=>{const r=Array(size).fill(0);edges.forEach((e,i)=>{if(e.s!==undefined)r[e.s]-=v[i];if(e.t!==undefined)r[e.t]+=v[i]});return r};
  if(lower.some(v=>v>0)){
    const gram=Array.from({length:size},()=>Array(size).fill(0));
    edges.forEach((e,i)=>{const {s,t}=e,d=weights[i];if(s!==undefined)gram[s][s]+=d;if(t!==undefined)gram[t][t]+=d;if(s!==undefined&&t!==undefined){gram[s][t]-=d;gram[t][s]-=d}});
    const L=Array.from({length:size},()=>Array(size).fill(0));
    for(let i=0;i<size;i++)for(let j=0;j<=i;j++){let v=gram[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];if(i===j){if(!(v>0))throw new RangeError('展示流量约束无法求解，请检查数据结构。');L[i][j]=Math.sqrt(v)}else L[i][j]=v/L[j][j]}
    const project=v=>{const z=balance(v);for(let i=0;i<size;i++){for(let k=0;k<i;k++)z[i]-=L[i][k]*z[k];z[i]/=L[i][i]}for(let i=size-1;i>=0;i--){for(let k=i+1;k<size;k++)z[i]-=L[k][i]*z[k];z[i]/=L[i][i]}return v.map((x,i)=>x-weights[i]*((edges[i].t===undefined?0:z[edges[i].t])-(edges[i].s===undefined?0:z[edges[i].s])))};
    let p=actual.map(()=>0),q=actual.map(()=>0),converged=false;
    for(;iterations<2000;iterations++){
      const input=delta.map((x,i)=>x+p[i]),y=project(input);p=input.map((x,i)=>x-y[i]);
      const z=y.map((x,i)=>x+q[i]),next=z.map((x,i)=>Math.max(lower[i],x));q=z.map((x,i)=>x-next[i]);
      const change=Math.max(0,...next.map((x,i)=>Math.abs(x-delta[i])));delta=next;
      if(change<1e-9&&Math.max(0,...balance(delta).map(Math.abs))<1e-8){converged=true;break}
    }
    method = converged ? 'least-change' : 'conservative-paths';
    if (!converged) delta = conservativePathFlow(graph, lower, actual);
    const residual=Math.max(0,...balance(delta).map(Math.abs));
    if(delta.some((v,i)=>!Number.isFinite(v)||v<lower[i]-1e-8)||residual>1e-7)throw new RangeError('最小线宽展示约束无法安全满足，请使用严格比例。');
  }
  links.forEach((l,i)=>{l.actualWidth=actual[i];l.width=actual[i]+delta[i];l.displayExtra=delta[i]});
  for(const n of graph.nodes){const sum=ls=>ls.reduce((s,l)=>s+l.width,0);n.displayHeight=Math.max(sum(n.sourceLinks),sum(n.targetLinks));}
  return {enhanced:delta.some(v=>v>1e-8),iterations,method,
    residual:Math.max(0,...balance(delta).map(Math.abs)),
    objective:delta.reduce((sum,d,i)=>sum+d*d/(2*weights[i]),0)};
}

export function packDisplayPorts(graph){
  for(const n of graph.nodes){let incoming=n.y0,outgoing=n.y0;for(const l of n.targetLinks){l.port1={edge:'left',x:n.x0,y:incoming+l.width/2};incoming+=l.width}for(const l of n.sourceLinks){l.port0={edge:'right',x:n.x1,y:outgoing+l.width/2};outgoing+=l.width}}
  for(const l of graph.links){l.y0=l.port0.y;l.y1=l.port1.y}
}

/** Bounded fallback, O(V+E): each deficit is extended both upstream and
 * downstream in the original flow proportions. This is the superposition of
 * complete source-to-sink paths, not a partially converged optimization.
 * It is conservative and label/order independent, but not least-change.
 */
function conservativePathFlow(graph, lower, actual) {
  const index=new Map(graph.links.map((l,i)=>[l,i]));
  const degree=new Map(graph.nodes.map(n=>[n,n.targetLinks.length]));
  const queue=graph.nodes.filter(n=>degree.get(n)===0), sorted=[];
  for(let k=0;k<queue.length;k++) { const n=queue[k];sorted.push(n);for(const l of n.sourceLinks){const d=degree.get(l.target)-1;degree.set(l.target,d);if(!d)queue.push(l.target)} }
  if(sorted.length!==graph.nodes.length)throw new RangeError('展示流量不支持循环。');
  const up=lower.map(()=>0),down=lower.map(()=>0);
  for(const n of [...sorted].reverse()) {
    const demand=n.sourceLinks.reduce((v,l)=>v+lower[index.get(l)]+up[index.get(l)],0);
    const total=n.targetLinks.reduce((v,l)=>v+actual[index.get(l)],0);
    if(total)for(const l of n.targetLinks){const i=index.get(l);up[i]=demand*(actual[i]/total)}
  }
  for(const n of sorted) {
    const demand=n.targetLinks.reduce((v,l)=>v+lower[index.get(l)]+down[index.get(l)],0);
    const total=n.sourceLinks.reduce((v,l)=>v+actual[index.get(l)],0);
    if(total)for(const l of n.sourceLinks){const i=index.get(l);down[i]=demand*(actual[i]/total)}
  }
  return lower.map((v,i)=>v+up[i]+down[i]);
}
