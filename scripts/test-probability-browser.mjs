import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readEnhancementSource, baseParameters } from './lib/enhancement-cache-harness.mjs';
import { probabilityTaskFunctionNames, createProbabilityTaskState } from './lib/probability-task-test-support.mjs';

const version = await readEnhancementSource();
const names = [...probabilityTaskFunctionNames, 'mooncakeSetBoundedMapEntry', 'cacheEnhancelateResult', 'cacheMooncakeExactEnhancelateResult',
    'buildEnhancelateCacheKey', 'Enhancelate', 'mooncakeEnhancelateExactLevel', 'enhancelateWorkerMain', 'disableEnhancelateWorker',
    'getEnhancelateWorker', 'prewarmEnhancelateLevels', 'mooncakeEnsureEnhancementRoutePrewarm'];
const mathBundle = await readFile(new URL('../node_modules/mathjs/lib/browser/math.js', import.meta.url));
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>D 批真实 Worker 与回退检查</title>
<style>body{font:16px system-ui;margin:26px;background:#111722;color:#dce7f5}button{background:#405bb0;color:white;padding:10px 18px;border:0;border-radius:5px}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{padding:12px;border-bottom:1px solid #34425c;text-align:center}th{background:#202e46}pre{white-space:pre-wrap;line-height:1.8;color:#9fe5bb}.muted{font-size:13px;color:#9faec8}</style>
<h2>D 批：冷缓存计算调度</h2><p>相同参数、两种物品等级、+1～+20，使用正式矩阵函数与真实浏览器 Worker。</p><button id="run">运行完整检查</button> <span id="status">等待检查</span>
<table><thead><tr><th>场景</th><th>主线程矩阵求解</th><th>最大 Worker 批量</th><th>长任务最大时长</th><th>定时器最大间隔</th><th>总耗时</th></tr></thead><tbody id="rows"></tbody></table>
<pre id="result" role="status">等待检查</pre><details><summary>原始测量结果</summary><pre id="metrics"></pre></details><p class="muted">长任务仅统计 ≥50ms 的任务；“未观察到”并非耗时为零。总耗时包含让出主线程的等待。固定样本时间不代表游戏帧率或真实游戏 CPU。</p>
<script src="/math.js"></script><script>
let player=${JSON.stringify(baseParameters)};
const SUCCESS_RATE=[50,45,45,40,40,40,35,35,35,35,30,30,30,30,30,30,30,30,30,30];
const ENHANCELATE_CACHE_LIMIT=512,MOONCAKE_EXACT_ENHANCELATE_CACHE_LIMIT=512;
const MOONCAKE_MIRROR_OUTPUT_MIN_LEVEL=13;
const enhancelateCache=new Map(),mooncakeExactEnhancelateCache=new Map(),mooncakeEnhancementRoutePrewarmState=new Map();
const enhancelateWorkerPending=new Map(),enhancelateWorkerInFlight=new Map();
let enhancelateWorker=null,enhancelateWorkerDisabled=false,enhancelateWorkerRequestId=0;
const mooncakeProbabilityTasks=(${createProbabilityTaskState.toString()})();
const getPlayerEnhanceParams=()=>player,getBaseItemLevel=hrid=>hrid.endsWith('_85')?85:90;
const mooncakeGetRefinementActionForItem=()=>null,mooncakeDeferVisibleRefresh=()=>false;
${names.map(name => version.functions.get(name)).join('\n')}
let mainSolves=0,maxBatch=0,longest=0;const nativeMath=math,nativeInv=nativeMath.inv.bind(nativeMath);window.math={...nativeMath,inv:(...args)=>{mainSolves++;return nativeInv(...args)}};
const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(message){maxBatch=Math.max(maxBatch,message.jobs?.length||0);super.postMessage(message)}};
const fallbackErrors=[],settleTask=mooncakeSettleProbabilityTask;mooncakeSettleProbabilityTask=(task,success)=>{if(!success&&fallbackErrors.length<4)fallbackErrors.push({job:task.job,ordinary:[...enhancelateCache.keys()].slice(-1),exact:[...mooncakeExactEnhancelateCache.keys()].slice(-1)});settleTask(task,success)};
const originalOrdinary=Enhancelate,originalExact=mooncakeEnhancelateExactLevel;
Enhancelate=(...args)=>{try{return originalOrdinary(...args)}catch(error){if(fallbackErrors.length<4)fallbackErrors.push(error.stack);throw error}};
mooncakeEnhancelateExactLevel=(...args)=>{try{return originalExact(...args)}catch(error){if(fallbackErrors.length<4)fallbackErrors.push(error.stack);throw error}};
let performanceObserver;try{performanceObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries())longest=Math.max(longest,entry.duration)});performanceObserver.observe({type:'longtask',buffered:false})}catch(_){}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),status=document.getElementById('status'),result=document.getElementById('result');
function sample(){return ['/items/a','/items/b_85'].flatMap(item=>[7,12,14,20].map(target=>{const key=buildEnhancelateCacheKey(target,Math.min(target,7),getBaseItemLevel(item),player);return {ordinary:{...enhancelateCache.get(key)},exact:{...mooncakeExactEnhancelateCache.get('exact:'+key)}}}))}
function compare(left,right){for(let i=0;i<left.length;i++)for(const kind of ['ordinary','exact'])for(const field of ['actions','protectCount','exp'])if(!(Math.abs(left[i][kind][field]-right[i][kind][field])<=1e-7*Math.max(1,Math.abs(right[i][kind][field]))))throw Error('数值不一致 '+i+' '+kind+' '+field)}
async function run(){document.getElementById('run').disabled=true;document.getElementById('rows').replaceChildren();result.textContent='检查中…';const rows=[];let reference;
 try{for(const mode of ['同步参考','真实 Worker','Worker 不可用回退']){
  mooncakeCancelProbabilityTasks();disableEnhancelateWorker();enhancelateWorkerDisabled=mode==='Worker 不可用回退';
  enhancelateCache.clear();mooncakeExactEnhancelateCache.clear();mooncakeEnhancementRoutePrewarmState.clear();mooncakeProbabilityTasks.cacheEpoch++;
  mainSolves=0;maxBatch=0;fallbackErrors.length=0;await pause(60);longest=0;let last=performance.now(),maxGap=0;const heartbeat=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now},10);
  status.textContent=mode+'…';const start=performance.now();
  if(mode==='同步参考'){for(const item of ['/items/a','/items/b_85'])for(let target=1;target<=20;target++)for(let protect=target===1?1:2;protect<=target;protect++){Enhancelate(item,target,protect);mooncakeEnhancelateExactLevel(item,target,protect)}}
  else{const states=['/items/a','/items/b_85'].map(item=>mooncakeEnsureEnhancementRoutePrewarm(item,20));const values=await Promise.all(states.map(state=>state.promise));if(values.some(value=>!value))throw Error(mode+'没有完成')}
  const elapsed=performance.now()-start;await pause(60);clearInterval(heartbeat);
  const snapshot=sample();if(!reference)reference=snapshot;else compare(snapshot,reference);
  if(mode==='同步参考'&&mainSolves===0)throw Error('矩阵计数未生效');if(mode==='真实 Worker'&&mainSolves!==0)throw Error('Worker 模式仍在主线程求解');if(maxBatch>8)throw Error('Worker 批量超过限制');
  const row={mode,mainSolves,maxBatch,longest:Math.round(longest),maxGap:Math.round(maxGap),elapsed:Math.round(elapsed)};rows.push(row);
  const tr=document.createElement('tr');for(const value of [mode,mainSolves,maxBatch,row.longest?row.longest+'ms':'未观察到',row.maxGap+'ms',row.elapsed+'ms']){const td=document.createElement('td');td.textContent=value;tr.append(td)}document.getElementById('rows').append(tr);
 }
 result.textContent='PASS ALL\\n数值与同步参考一致；真实 Worker 模式不在主线程求解；不可用时逐项回退。';document.getElementById('metrics').textContent=JSON.stringify(rows,null,2);status.textContent='全部通过';
 }catch(error){result.textContent='FAIL '+error.message+'\\n'+JSON.stringify(fallbackErrors,null,2);status.textContent='检查失败';console.error(error)}
 document.getElementById('run').disabled=false;
}
document.getElementById('run').onclick=run;
</script></html>`;
new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/math.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(mathBundle); }
    else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
}).listen(0, '127.0.0.1', function () { console.log(`Real probability worker checks: http://127.0.0.1:${this.address().port}/`); });
