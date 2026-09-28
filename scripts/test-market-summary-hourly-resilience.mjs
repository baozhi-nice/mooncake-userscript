import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

const summaryStart = source.indexOf('function addHourlyWageToMarketplaceSummary(');
const summaryEnd = source.indexOf('\n    function mooncakeShouldIgnoreMarketplaceClick(', summaryStart);
assert.notEqual(summaryStart, -1, 'summary hourly renderer must exist');
assert.notEqual(summaryEnd, -1, 'summary hourly renderer must have a stable boundary');
const summaryRenderer = source.slice(summaryStart, summaryEnd);

assert.match(
    source,
    /function mooncakeEnsureMarketplaceSummaryHourlyWageHeaders\([\s\S]{0,1800}?header\.textContent = isZH \? '工时费'/,
    'summary headers must be created independently of the asynchronous wage calculation'
);
assert.match(
    source,
    /function mooncakeRenderMarketplaceSummaryHourlyWagePlaceholders\([\s\S]{0,2200}?sellCell\.textContent = bestAsk > 0 \? '…' : '-';[\s\S]{0,300}?buyCell\.textContent = bestBid > 0 \? '…' : '-';/,
    'summary rows must preserve visible placeholders while route data is prewarming'
);

const scaffoldIndex = summaryRenderer.indexOf('mooncakeRenderMarketplaceSummaryHourlyWagePlaceholders(');
const noDataRetryIndex = summaryRenderer.indexOf('if (!marketData) {', scaffoldIndex);
const prewarmIndex = summaryRenderer.indexOf('Promise.all([...new Set(prewarmItemHrids)]', scaffoldIndex);
assert.ok(scaffoldIndex >= 0, 'desktop summary renderer must render the column shell');
assert.ok(noDataRetryIndex > scaffoldIndex, 'missing market data must retain the already-rendered column shell');
assert.ok(prewarmIndex > scaffoldIndex, 'the worker prewarm must run after the shell is visible');
assert.match(
    summaryRenderer.slice(noDataRetryIndex, prewarmIndex),
    /mooncakeScheduleMarketplaceSummaryHourlyWageDataRetry\(table, itemHrid\)/,
    'missing market data must schedule a bounded recovery pass'
);
assert.match(
    summaryRenderer,
    /if \(renderGeneration === _summaryRenderGeneration\) \{[\s\S]{0,240}?return;[\s\S]{0,1800}?scheduleMarketplaceSummaryHourlyWageRefresh\(\{ force: true \}\)/,
    'a completed stale prewarm must wake the newest summary renderer'
);
assert.match(
    source,
    /state\.attempt >= MOONCAKE_SUMMARY_HOURLY_DATA_RETRY_DELAYS\.length/,
    'summary-data recovery must remain bounded when market data is unavailable'
);

console.log('Market summary hourly resilience checks passed.');

// Browser regression fixture for actual native table mount/update sequences.
// --baseline=<git ref> reproduces the disappearance with an older revision
// before verifying the same cases against the working source.
if (process.argv.includes('--serve')) {
    const baselineRef = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
    const testedSource = baselineRef
        ? execFileSync('git', ['show', `${baselineRef}:src/mooncake.js`], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 8e6 })
        : source;
    function extract(name) {
        const start = testedSource.indexOf(`function ${name}(`);
        if (start < 0) return '';
        let position = testedSource.indexOf('(', start), depth = 0;
        do { if (testedSource[position] === '(') depth++; if (testedSource[position] === ')') depth--; position++; } while (depth);
        position = testedSource.indexOf('{', position);
        do { if (testedSource[position] === '{') depth++; if (testedSource[position] === '}') depth--; position++; } while (depth);
        return testedSource.slice(start, position);
    }
    const names = [
        'mooncakeIsVisibleElement', 'mooncakeIsMarketplaceModalDescendant', 'extractItemHridFromElement', 'parsePriceText',
        'mooncakeGetVisibleMarketplaceSummaryTable', 'mooncakeGetMarketplaceSummaryItemHrid',
        'mooncakeMarketplaceSummaryMutationNeedsRefresh', 'mooncakeObserveMarketplaceSummaryPrices',
        'mooncakeHasVisibleMarketplacePricingSurface', 'scheduleMarketplaceSummaryHourlyWageRefresh', 'hookEnhancementDetailTable',
        'mooncakeGetMarketplaceSummaryCellKind', 'mooncakeGetMarketplaceSummaryNativeCell',
        'mooncakeCreateMarketplaceSummaryHourlyWageCell', 'mooncakeEnsureMarketplaceSummaryHourlyWageHeaders',
        'mooncakeRenderMarketplaceSummaryHourlyWagePlaceholders', 'mooncakeClearMarketplaceSummaryHourlyWageDataRetry',
        'mooncakeScheduleMarketplaceSummaryHourlyWageDataRetry', 'mooncakeRemoveMarketplaceSummaryHourlyWageColumns',
        'mooncakeRemoveMarketplaceInlineHourlyWages', 'clearMarketplaceSummaryHourlyWageColumns',
        'mooncakeGetMarketplaceNativePriceText', 'addHourlyWageToMarketplaceSummary',
        'mooncakeAddInlineHourlyWageToMarketplaceSummary', 'mooncakeEnsureMarketplaceInlineHourlyWage',
        'mooncakeSetMarketplaceInlineHourlyWage', 'mooncakeGetMarketplaceInlineMetricLabel',
        'mooncakeGetMarketplaceInlineMetricTitle', 'mooncakeRenderMarketplaceInlineHourlyMetric'
    ];
    const constantNames = ['MOONCAKE_MARKET_PRICING_SURFACE_SELECTOR', 'MOONCAKE_MARKET_OBSERVER_ROOT_SELECTOR', 'MOONCAKE_MARKET_INJECTED_SELECTOR'];
    const constants = constantNames.map(name => {
        const start = testedSource.indexOf(`const ${name} = `);
        return testedSource.slice(start, testedSource.indexOf(';', start) + 1);
    }).join('\n');
    const templateNames = [...new Set([...constants.matchAll(/\$\{(\w+)\}/g)].map(match => match[1]))];
    const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>等级工时费恢复检查</title>
    <style>body{background:#11131b;color:#c6cce0;font:15px system-ui;margin:22px}button{background:#4056a7;color:white;border:0;border-radius:4px;padding:8px 14px;cursor:pointer}table{width:100%;border-collapse:collapse}th,td{padding:14px;text-align:center}th{background:#272839}tr:nth-child(even){background:#222333}.MarketplacePanel_price__fixture{color:#83d3d0}pre{white-space:pre-wrap}svg{width:38px;height:38px}.Item_enhancementLevel__fixture{color:#cf9af1}#hidden{display:none}.mooncake-market-inline-hourly-wage{display:block;font-size:12px}</style>
    <button id="run">运行恢复检查</button><p>原生表格挂载时序回归测试（本地固定成本数据）</p>
    <svg style="position:absolute;width:0;height:0"><symbol id="equipment_a" viewBox="0 0 32 32"><text x="2" y="25" font-size="25">⚔</text></symbol><symbol id="equipment_b" viewBox="0 0 32 32"><text x="2" y="25" font-size="25">🛡</text></symbol></svg>
    <div id="stage"></div><pre id="result" role="status">等待检查</pre><script>
    const isZH=true, stage=document.getElementById('stage'), result=document.getElementById('result');
    ${templateNames.map(name => `const ${name}='${name}';`).join('\n')}
    const MOONCAKE_MOOKET_OVERLAY_ID='mooket',MOONCAKE_MIRROR_OUTPUT_MIN_LEVEL=13;
    ${constants}
    let _pendingSummaryRaf=null,_summaryRenderGeneration=0,mooncakeMarketplacePricingSurfaceState=null;
    let mooncakeSummaryPriceObserver=null,mooncakeSummaryObservedTable=null,enhancementDetailTableObserver=null;
    let _pendingEnhancementDetailRefreshTimer=0,enhancementTabButton=null,enhancementTabPanel=null;
    const MOONCAKE_SUMMARY_HOURLY_DATA_RETRY_DELAYS=[140,480,1400],mooncakeSummaryHourlyDataRetryStates=new WeakMap();
    let currentMarketItem=null, marketDetailSnapshotCache={},enabled=true,available=true,compact=false,warmDelay=0,calls=0;
    let mooncakeMarketPricingRevision=0,mooncakeHourlyWageColorProfileRevision=0,mooncakeCharacterCalcSignature='fixture';
    const noop=()=>{},scheduleMarketplaceOrderBookHourlyWageRefresh=noop,scheduleMooncakeMarketJumpHelpers=noop,scheduleEnhancementTabEnsure=noop,updateEnhancementTabContent=noop;
    const extractEnhancementLevelFromElement=()=>0,mooncakeApplyMarketplaceResponsiveTableLayout=noop;
    const isMarketplaceHourlyWageEnabled=()=>enabled,mooncakeShouldUseMobileMarketTableLayout=()=>compact;
    const mooncakeFindCurrentMarketItemNode=()=>document.querySelector('[class*="MarketplacePanel_currentItem"]');
    const mooncakeIsEnhanceableItem=hrid=>hrid?.startsWith('/items/equipment_');
    const getMarketData=()=>available?{marketData:{}}:null,getEnhancementRouteObjective=()=> 'standard',getPlayerEnhanceParams=()=>({});
    const prewarmEnhancelateLevels=()=>new Promise(resolve=>setTimeout(resolve,warmDelay)),mooncakeGetRefinementActionForItem=()=>null;
    const mooncakeGetTradeOffProtectSuffix=()=>'',mooncakeBuildOrderBookHourlyWageHtml=value=>(value/1e6).toFixed(2)+'M/h';
    const mooncakeFormatSignedHourlyWage=value=>(value/1e6).toFixed(2)+'M';
    function calcHourlyWageAndMetrics(hrid,level,data,price){if(price<=0)return null;calls++;return {hourlyWage:price*.96-(hrid==='/items/equipment_b'?80e6:100e6),metrics:{},evaluation:{combinedColor:'#8ce4a6'}};}
    const bindTooltip=(node,content)=>{node._mooncakeTooltipHtml=content},buildTooltipHtml=()=>'';
    const mooncakeRenderLevelZeroMarketComparisonCell=node=>node.textContent='0',mooncakeRenderMarketplaceInlineLevelZeroMetric=noop;
    const subscriptions=new Map();
    new MutationObserver(mutations=>{for(const callback of subscriptions.values())callback(mutations)}).observe(document.body,{childList:true,subtree:true});
    function subscribeDocumentMutations(name,callback){subscriptions.set(name,callback);return ()=>subscriptions.delete(name)}
    ${names.map(extract).join('\n')}
    function panel(hrid='equipment_a',rows=true){const element=document.createElement('div');element.className='MarketplacePanel_marketplacePanel__fixture';element.innerHTML='<table class="MarketplacePanel_itemSummaryTable__fixture"><thead><tr><th class="MarketplacePanel_item__fixture">物品</th><th class="MarketplacePanel_bestAskPrice__fixture">最佳出售价</th><th class="MarketplacePanel_bestBidPrice__fixture">最佳收购价</th><th class="MarketplacePanel_viewAll__fixture">查看全部</th></tr></thead><tbody>'+(rows?[7,8,10].map((level,index)=>'<tr><td class="MarketplacePanel_item__fixture"><svg><use href="#'+hrid+'"></use></svg><span class="Item_enhancementLevel__fixture">+'+level+'</span></td><td class="MarketplacePanel_bestAskPrice__fixture"><span class="MarketplacePanel_price__fixture">'+[122.5,165.5,362][index]+'M</span><br><button>购买</button></td><td class="MarketplacePanel_bestBidPrice__fixture"><span class="MarketplacePanel_price__fixture">140M</span><br><button>出售</button></td><td class="MarketplacePanel_viewAll__fixture"><button>查看全部</button></td></tr>').join(''):'')+'</tbody></table>';return element;}
    const table=()=>stage.querySelector('#active table'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    function mount(hrid='equipment_a',rows=true){const root=panel(hrid,rows);root.id='active';stage.append(root);return root.querySelector('table')}
    function addPreview(){const preview=document.createElement('div');preview.className='MarketplacePanel_currentItem__fixture';preview.innerHTML='<svg><use href="#equipment_a"></use></svg>';table().parentElement.prepend(preview);scheduleMarketplaceSummaryHourlyWageRefresh({force:true});}
    function expect(condition,message){if(!condition)throw Error(message)}
    function complete(target=table()){expect(target?.querySelectorAll('thead [data-mooncake-summary-hourly-cell]').length===2,'工时表头缺失');expect(target.querySelectorAll('tbody [data-mooncake-summary-hourly-cell]').length===6,'工时单元格缺失或重复');expect(![...target.querySelectorAll('tbody [data-mooncake-summary-hourly-cell]')].some(node=>node.textContent==='…'),'计算未完成');}
    async function clear(){stage.replaceChildren();scheduleMarketplaceSummaryHourlyWageRefresh({force:true});await wait(70);enabled=true;available=true;compact=false;warmDelay=0;}
    async function run(){const checks=[];async function check(name,body){await clear();try{await body();checks.push('PASS '+name)}catch(error){checks.push('FAIL '+name+'：'+error.message)}result.textContent=checks.join('\n')}
      await check('已有表格初始化；没有顶部预览也显示工时',async()=>{mount();hookEnhancementDetailTable();await wait(180);complete()});
      await check('整块市场页面异步插入',async()=>{mount();await wait(180);complete()});
      await check('隐藏旧表格不能挡住当前表格',async()=>{const hidden=panel('equipment_b');hidden.id='hidden';stage.append(hidden);mount();await wait(180);complete();expect(!hidden.querySelector('[data-mooncake-summary-hourly-cell]'),'修改了隐藏表格')});
      await check('顶部预览滞后；用表格自己的装备计算',async()=>{const root=mount().parentElement;const preview=document.createElement('div');preview.className='MarketplacePanel_currentItem__fixture';preview.innerHTML='<svg><use href="#equipment_b"></use></svg>';root.prepend(preview);await wait(180);complete();expect(table().querySelector('.sell-hourly-wage-cell').textContent==='17.60M/h','采用了别的装备成本')});
      await check('价格文本原地改变后自动重算',async()=>{mount();addPreview();await wait(180);complete();const price=table().querySelector('.MarketplacePanel_price__fixture');price.firstChild.nodeValue='200M';await wait(180);complete();expect(table().querySelector('.sell-hourly-wage-cell').textContent==='92.00M/h','没有观察到文本更新')});
      await check('计算中切换物品且复用行',async()=>{warmDelay=100;mount();addPreview();await wait(40);for(const use of stage.querySelectorAll('use'))use.setAttribute('href','#equipment_b');await wait(320);complete();expect(table().querySelector('.sell-hourly-wage-cell').textContent==='37.60M/h','旧结果覆盖了新物品')});
      await check('行情延迟到达；保留表头并自动恢复',async()=>{available=false;mount();addPreview();await wait(90);expect(table().querySelectorAll('thead [data-mooncake-summary-hourly-cell]').length===2,'等待行情时表头消失');available=true;await wait(730);complete()});
      await check('原生表头和行重建',async()=>{mount();addPreview();await wait(180);complete();const replacement=panel().querySelector('table');table().replaceChildren(...replacement.childNodes);await wait(180);complete()});
      await check('空表先挂载，再出现等级行',async()=>{mount('equipment_a',false);await wait(90);table().querySelector('tbody').replaceChildren(...panel().querySelector('tbody').childNodes);await wait(180);complete()});
      await check('弹出市场优先于背景市场',async()=>{const background=panel('equipment_b');stage.append(background);const modal=document.createElement('div');modal.className='MainPanel_marketplaceModalContent__fixture';const inner=panel();inner.id='active';modal.append(inner);stage.append(modal);await wait(180);complete();expect(!background.querySelector('[data-mooncake-summary-hourly-cell]'),'后台市场抢占了显示')});
      await check('窄屏也独立于预览；不产生观察器循环',async()=>{compact=true;mount();await wait(220);expect(table().querySelectorAll('.mooncake-market-inline-hourly-wage').length===6,'窄屏内嵌工时缺失');const count=calls;await wait(180);expect(calls===count,'观察器反复计算');enabled=false;scheduleMarketplaceSummaryHourlyWageRefresh({force:true});await wait(90);expect(!table().querySelector('.mooncake-market-inline-hourly-wage'),'关闭工时未清理')});
      await clear();mount();await wait(180);result.textContent=(checks.some(line=>line.startsWith('FAIL'))?'FAILED\n':'PASS ALL\n')+checks.join('\n');
    }
    mount();hookEnhancementDetailTable();document.getElementById('run').onclick=run;
    </script></html>`;
    const server = createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(html);
    });
    server.listen(0, '127.0.0.1', () => console.log(`Summary ${baselineRef ? 'baseline' : 'fixed'} checks: http://127.0.0.1:${server.address().port}/`));
}
