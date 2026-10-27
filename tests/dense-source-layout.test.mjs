import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeInput,layoutFinancialGraph,generateSvg} from '../src/core/index.js';
for(const count of [3,7,8,10,20,40,70])test(`${count} primary sources fit below header and above footer`,()=>{
 const input={schema:'liuzhang.financial',version:1,metadata:{title:'Synthetic density test',period:'TEST',currency:'USD',unit:'million'},nodes:[...Array.from({length:count},(_,i)=>({id:`s${i}`,label:`Synthetic source ${i}`,role:'source'})),{id:'r',label:'Revenue',role:'main'},{id:'p',label:'Profit',role:'main'},{id:'n',label:'Net',role:'main'},{id:'c',label:'Cost',role:'expense'},{id:'t',label:'Tax',role:'expense'}],links:[...Array.from({length:count},(_,i)=>({source:`s${i}`,target:'r',value:100})),{source:'r',target:'c',value:1},{source:'r',target:'p',value:count*100-1},{source:'p',target:'t',value:1},{source:'p',target:'n',value:count*100-2}],mainChain:['r','p','n']};
 const diagram=layoutFinancialGraph(normalizeInput(input));assert.ok(diagram.rail.applied);
 for(const n of diagram.graph.nodes){assert.ok(n.y0>=218,n.id+' header safety');assert.ok(n.y1<=diagram.height-190,n.id+' footer safety')}
 assert.doesNotMatch(generateSvg(input),/NaN|Infinity/);
});
