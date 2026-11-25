import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import vm from 'node:vm';
import { marketPricingTestPrelude, marketPricingTestFunctions, settlePricingBrowserFrames } from './lib/market-pricing-test-support.mjs';

const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11);
const tested = baseline ? execFileSync('git', ['show', `${baseline}:src/mooncake.js`], { encoding: 'utf8', maxBuffer: 8e6 }) : source;
function extract(name, text = tested) {
    const start = text.indexOf(`    function ${name}(`);
    return start < 0 ? '' : text.slice(start, text.indexOf('\n    }', start) + 6);
}

// Recovery must stop after a bounded number of attempts and after navigation.
const pending = new Map();
let nextTimer = 0, refreshes = 0;
const container = { isConnected: true };
let selected = container;
const context = vm.createContext({
    mooncakeOrderBookRetryStates: new WeakMap(), MOONCAKE_ORDER_BOOK_RETRY_DELAYS: [140, 480, 1400],
    setTimeout: callback => { pending.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => pending.delete(id),
    mooncakeGetVisibleMarketplaceOrderBooks: () => selected,
    scheduleMarketplaceOrderBookHourlyWageRefresh: () => refreshes++
});
vm.runInContext(extract('mooncakeScheduleOrderBookRetry', source) + '\n' + extract('mooncakeClearOrderBookRetry', source), context);
for (let i = 0; i < 10; i++) {
    context.mooncakeScheduleOrderBookRetry(container);
    for (const [id, callback] of pending) { pending.delete(id); callback(); }
}
assert.equal(refreshes, 3, 'missing item data must not start an endless polling loop');
context.mooncakeClearOrderBookRetry(container);
context.mooncakeScheduleOrderBookRetry(container);
selected = null;
for (const [id, callback] of pending) { pending.delete(id); callback(); }
assert.equal(refreshes, 3, 'retries must stop after switching away');
context.mooncakeClearOrderBookRetry(container);
assert.equal(pending.size, 0);
selected = container;
context.mooncakeScheduleOrderBookRetry(container);
context.mooncakeClearOrderBookRetry(container);
assert.equal(pending.size, 0, 'successful rendering cancels the remaining timer');
console.log('Order-book bounded recovery checks passed.');

if (process.argv.includes('--serve')) {
    const names = [
        'mooncakeIsVisibleElement', 'mooncakeIsMarketplaceModalDescendant', 'mooncakeIsCurrentMarketItemDetailNode',
        'mooncakeFindCurrentMarketItemNode', 'mooncakeGetCurrentMarketEnhanceLevel', 'mooncakeParseEnhanceLevelFromPanel',
        'extractItemHridFromElement', 'extractEnhancementLevelFromElement',
        'mooncakeHasVisibleMarketplacePricingSurface', 'mooncakeApplyMarketplaceResponsiveTableLayout',
        'mooncakeGetVisibleMarketplaceOrderBooks', 'mooncakeGetMarketplaceOrderBookRoot', 'mooncakeGetMarketplaceOrderBookTarget',
        'mooncakeMarketplaceOrderBookMutationNeedsRefresh', 'mooncakeObserveMarketplaceOrderBooks',
        'mooncakeClearOrderBookRetry', 'mooncakeScheduleOrderBookRetry', 'scheduleMarketplaceOrderBookHourlyWageRefresh',
        'hookEnhancementDetailTable', 'mooncakeMarketplaceSummaryMutationNeedsRefresh',
        'ensureDocumentMutationObserver', 'subscribeDocumentMutations',
        'mooncakeDeferVisibleRefresh', 'mooncakeFlushVisibleRefreshes',
        'mooncakeIsRangedListingAgeActive', 'mooncakeClearMarketListingAge', 'mooncakeRenderMarketListingAge',
        'mooncakeRemoveMarketplaceInlineListingAges', 'mooncakeIsOrderBookSeparatorRow', 'mooncakeGetNativeOrderBookCells',
        'mooncakeGetOrderBookRowCells', 'mooncakeGetOrderBookActionCell', 'mooncakePlaceOrderBookCellBeforeAction',
        'mooncakeEnsureInlineListingAge', 'mooncakeResolveOrderBookRowEstimate', 'mooncakeUpdateOrderBookAgeNode',
        'mooncakeSetListingAgeNode', 'mooncakeUpdateListingAgeNode', 'mooncakeFormatListingAge', 'mooncakeGetListingAgeColor',
        'mooncakeBlendListingAgeColor'
    ];
    const constants = ['MOONCAKE_MARKET_PRICING_SURFACE_SELECTOR', 'MOONCAKE_MARKET_OBSERVER_ROOT_SELECTOR', 'MOONCAKE_MARKET_INJECTED_SELECTOR']
        .map(name => { const start = tested.indexOf(`const ${name} = `); return tested.slice(start, tested.indexOf(';', start) + 1); }).join('\n');
    const ids = [...new Set([...constants.matchAll(/\$\{(\w+)\}/g)].map(match => match[1]))]
        .filter(name => !['MOONCAKE_MOOKET_OVERLAY_ID', 'MOONCAKE_ENHANCEMENT_TAB_BUTTON_ATTR', 'MOONCAKE_ENHANCEMENT_TAB_PANEL_ATTR'].includes(name));
    const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>市场时长恢复检查</title>
    <style>body{background:#11131b;color:#dce3f5;font:15px system-ui;margin:24px}button{background:#4056a7;border:0;border-radius:4px;padding:8px 14px;color:white;cursor:pointer}h1{font-size:20px}pre{white-space:pre-wrap;line-height:1.65}.MarketplacePanel_marketplacePanel__fixture{border:1px solid #343b55;padding:16px;margin-top:16px}.MarketplacePanel_orderBooksContainer__fixture{display:flex;gap:12px}table{border-collapse:collapse;flex:1}th,td{padding:10px;text-align:center}th{background:#292c41}tbody tr{background:#1d2031}.MarketplacePanel_price__fixture{color:#e6c478}.mooncake-listing-age-cell,.mooncake-market-inline-listing-age{color:#8fdab6}svg{width:32px;height:32px}#result{color:#8fdab6}</style>
    <h1>市场时长恢复检查 · ${baseline || '修复版'}</h1><p>使用正式列渲染、页面监听和刷新代码；固定测试挂单，不连接游戏账号。</p>
    <button id="run">运行恢复检查</button><pre id="result" role="status">等待检查</pre><div id="stage"></div>
    <script>
    ${ids.map(name => `const ${name}=${JSON.stringify(name)};`).join('\n')}
    const isZH=true,MOONCAKE_MOOKET_OVERLAY_ID='mooket_safe_overlay',MOONCAKE_ENHANCEMENT_TAB_BUTTON_ATTR='tab-button',MOONCAKE_ENHANCEMENT_TAB_PANEL_ATTR='tab-panel';
    ${constants}
    ${marketPricingTestPrelude()}
    ${marketPricingTestFunctions(extract)}
    const MOONCAKE_LISTING_TIME_NODE_SELECTOR='.mooncake-listing-age-cell, .mooncake-market-inline-listing-age';
    const documentMutationSubscribers=new Map();let documentMutationObserver=null;
    const mooncakeVisibleRefreshes=new Map();let mooncakeVisibleRefreshListenerStarted=false;
    let fixtureHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>fixtureHidden});
    function setHidden(value){fixtureHidden=value;document.dispatchEvent(new Event('visibilitychange'))}
    let _pendingOrderBookRaf=null,enhancementDetailTableObserver=null,mooncakeMarketplacePricingSurfaceState=null;
    const mooncakeOrderBookObservers=new Map(),mooncakeOrderBookRetryStates=new WeakMap(),MOONCAKE_ORDER_BOOK_RETRY_DELAYS=[140,480,1400];
    let _pendingEnhancementDetailRefreshTimer=0,enhancementTabButton=null,enhancementTabPanel=null,currentMarketItem=null;
    const marketDetailSnapshotCache={};let mooncakeListingTimeRevision=0;
    let enabled=true,compact=false,dataAvailable=true,bookCalls=0,lastTarget=null,wageCalls=[];
    const errors=[],originalError=console.error.bind(console);console.error=(...args)=>{errors.push(args.join(' '));originalError(...args)};
    const noop=()=>{},scheduleMarketplaceSummaryHourlyWageRefresh=noop,scheduleMooncakeMarketJumpHelpers=noop,scheduleEnhancementTabEnsure=noop,updateEnhancementTabContent=noop;
    const mooncakeIsMarketListingAgeEnabled=()=>enabled,mooncakeShouldUseMobileMarketTableLayout=()=>compact;
    const mooncakeEnsureListingAgeTooltipListeners=noop,mooncakeHideListingAgeTooltip=noop,mooncakeStopListingAgeMinuteTimer=noop,mooncakeScheduleListingAgeMinuteTimer=noop;
    const isMarketplaceHourlyWageEnabled=()=>true,mooncakeIsEnhanceableItem=()=>true,clearOrderBookHourlyWageColumns=noop;
    const addHourlyWageToOrderBook=(table,itemHrid,level)=>wageCalls.push({table,itemHrid,level});
    const mooncakeNormalizeListingTimeId=value=>value?String(value):'',mooncakeNormalizeListingTimeTimestamp=value=>Number(value)||0;
    const mooncakeReadOrderBookRowListing=()=>null,mooncakeEstimateListingCreatedAt=()=>null,mooncakeGetOwnOrderBookExtraListings=()=>[];
    const fixedNow=Date.now();
    function mooncakeGetMyListingsLiveOrderBook(itemHrid,level){bookCalls++;lastTarget={itemHrid,level};if(!dataAvailable)return null;const hours=itemHrid==='/items/milk'?2:1;const listing={listingId:'123',createdTimestamp:fixedNow-hours*3600000};return {asks:[listing],bids:[listing]};}
    ${names.map(name => extract(name)).filter(Boolean).join('\n')}
    const stage=document.getElementById('stage'),result=document.getElementById('result'),wait=${settlePricingBrowserFrames.toString()};
    const headers=root=>root.querySelectorAll('.mooncake-listing-age-header'),cells=root=>root.querySelectorAll('.mooncake-listing-age-cell');
    function preview(item='kraken_fang',level=0){const node=document.createElement('div');node.className='MarketplacePanel_currentItem__fixture';node.innerHTML='<svg><use href="#'+item+'"></use></svg><span class="Item_enhancementLevel__fixture">+'+level+'</span>';return node;}
    function panel({item='kraken_fang',level=0,withPreview=true,hidden=false,empty=false}={}){const root=document.createElement('div');root.className='MarketplacePanel_marketplacePanel__fixture';if(hidden)root.style.display='none';if(withPreview)root.append(preview(item,level));const books=document.createElement('div');books.className='MarketplacePanel_orderBooksContainer__fixture';books.innerHTML=['出售','收购'].map(side=>'<table><thead><tr><th>数量</th><th>'+side+'价</th><th>操作</th></tr></thead><tbody>'+(empty?'':'<tr><td>5</td><td class="MarketplacePanel_price__fixture">8040K</td><td><button>查看</button></td></tr>')+'</tbody></table>').join('');root.append(books);return root;}
    function expect(condition,message){if(!condition)throw Error(message)}
    function complete(root,missing=false){expect(headers(root).length===2,'买卖时长表头缺失或重复');expect(cells(root).length===2,'时长单元格缺失或重复');expect([...cells(root)].every(node=>missing?node.textContent==='-':node.textContent!=='-'),'时长数值或占位符不符');}
    async function reset(){stage.replaceChildren();enabled=true;compact=false;dataAvailable=true;delete window._rwivb;scheduleMarketplaceOrderBookHourlyWageRefresh({force:true});await wait(70);}
    async function run(){const checks=[];document.getElementById('run').disabled=true;async function check(name,body){await reset();const errorCount=errors.length;try{await body();expect(errors.length===errorCount,'控制台错误：'+errors.slice(errorCount).join(' '));checks.push('PASS '+name)}catch(error){checks.push('FAIL '+name+'：'+error.message)}result.textContent=checks.join('\n')}
      await check('离开市场后，整块市场异步加载',async()=>{const root=panel();stage.append(root);await wait(180);complete(root)});
      await check('隐藏旧市场不挡住当前时长列',async()=>{const hidden=panel({hidden:true});stage.append(hidden);const root=panel();stage.append(root);await wait(180);complete(root);expect(!headers(hidden).length,'写入了隐藏市场')});
      await check('弹出市场优先；物品和等级取自同一面板',async()=>{const background=panel({item:'milk',level:12});stage.append(background);const modal=document.createElement('div');modal.className='MainPanel_marketplaceModalContent__fixture';const root=panel({level:7});modal.append(root);stage.append(modal);await wait(180);complete(root);expect(!headers(background).length,'后台表格抢占刷新');expect(lastTarget.itemHrid==='/items/kraken_fang'&&lastTarget.level===7,'读取了后台物品或等级');expect(wageCalls.at(-1)?.table.closest('.MainPanel_marketplaceModalContent__fixture'),'工时刷新不在当前弹窗')});
      await check('预览延迟出现时保留表头与占位符',async()=>{const root=panel({withPreview:false});stage.append(root);await wait(100);complete(root,true);root.prepend(preview());await wait(180);complete(root)});
      await check('仅 SVG href 更新也能恢复',async()=>{const root=panel({item:''});stage.append(root);await wait(120);complete(root,true);root.querySelector('use').setAttribute('href','#kraken_fang');await wait(180);complete(root)});
      await check('复用图标与强化等级，及时更新目标',async()=>{const root=panel();stage.append(root);await wait(150);root.querySelector('use').setAttribute('href','#milk');root.querySelector('[class*="Item_enhancementLevel"]').firstChild.nodeValue='+10';await wait(180);complete(root);expect(lastTarget.itemHrid==='/items/milk'&&lastTarget.level===10,'复用预览没有更新');expect(wageCalls.at(-1)?.level===10,'工时仍用旧等级')});
      await check('隐藏面板仅切换 class 后恢复',async()=>{const style=document.createElement('style');style.textContent='.fixture-hidden{display:none}';stage.append(style);const root=panel();root.classList.add('fixture-hidden');stage.append(root);await wait(100);root.classList.remove('fixture-hidden');await wait(180);complete(root)});
      await check('祖先容器从隐藏到显示后恢复',async()=>{const wrapper=document.createElement('section');wrapper.style.display='none';const root=panel();wrapper.append(root);stage.append(wrapper);await wait(100);wrapper.style.display='';await wait(180);complete(root)});
      await check('表头和行被原生页面替换后恢复',async()=>{const root=panel();stage.append(root);await wait(150);const replacement=panel();[...root.querySelectorAll('table')].forEach((table,i)=>table.replaceChildren(...replacement.querySelectorAll('table')[i].childNodes));await wait(180);complete(root);const count=bookCalls;await wait(200);expect(bookCalls===count,'出现观察器刷新循环')});
      await check('空表先加载，再补入订单行',async()=>{const root=panel({empty:true});stage.append(root);await wait(150);expect(headers(root).length===2,'空表没有保留表头');const replacement=panel();[...root.querySelectorAll('tbody')].forEach((body,i)=>body.replaceChildren(...replacement.querySelectorAll('tbody')[i].childNodes));await wait(180);complete(root)});
      await check('缺少挂单时间数据也不会删除整列',async()=>{dataAvailable=false;const root=panel();stage.append(root);await wait(150);complete(root,true);dataAvailable=true;scheduleMarketplaceOrderBookHourlyWageRefresh();await wait(150);complete(root)});
      if(typeof mooncakeGetMarketPricingDependency==='function')await check('局部价格刷新不阻断订单时长恢复',async()=>{const root=panel();stage.append(root);await wait(150);complete(root);mooncakeGetMarketPricingDependency('/items/kraken_fang').complete=true;dataAvailable=false;scheduleMarketplaceOrderBookHourlyWageRefresh({affectedItems:new Set(['/items/unrelated'])});await wait(150);complete(root,true);dataAvailable=true;scheduleMarketplaceOrderBookHourlyWageRefresh({affectedItems:new Set(['/items/unrelated'])});await wait(150);complete(root)});
      await check('窄屏内嵌时长和桌面列互相切换',async()=>{compact=true;const root=panel();stage.append(root);await wait(150);expect(!headers(root).length&&root.querySelectorAll('.mooncake-market-inline-listing-age').length===2,'窄屏时长缺失');compact=false;scheduleMarketplaceOrderBookHourlyWageRefresh({force:true});await wait(150);complete(root);expect(!root.querySelector('.mooncake-market-inline-listing-age'),'窄屏残留')});
      await check('关闭功能和 Ranged 接管时不生成重复列',async()=>{const root=panel();stage.append(root);await wait(150);enabled=false;scheduleMarketplaceOrderBookHourlyWageRefresh();await wait(100);expect(!headers(root).length,'关闭未清理');enabled=true;window._rwivb={configs:{listingClass:{orderBooksInfo:{value:true},estimateListingCreateTimeByLifespan:{value:true}}}};scheduleMarketplaceOrderBookHourlyWageRefresh();await wait(100);expect(!headers(root).length,'重复接管时长');delete window._rwivb;scheduleMarketplaceOrderBookHourlyWageRefresh();await wait(120);complete(root)});
      await check('预览长时间缺失不无限轮询，后来仍可恢复',async()=>{const root=panel({withPreview:false});stage.append(root);await wait(2400);complete(root,true);const count=wageCalls.length;await wait(250);expect(wageCalls.length===count,'没有停止轮询');root.prepend(preview());await wait(160);complete(root)});
      await check('页面隐藏暂停刷新，返回后恢复最新物品的时长列',async()=>{const root=panel();stage.append(root);await wait(200);const count=bookCalls;setHidden(true);root.querySelector('use').setAttribute('href','#milk');scheduleMarketplaceOrderBookHourlyWageRefresh({force:true});await wait(150);expect(bookCalls===count,'隐藏期间仍在刷新');setHidden(false);await wait(200);complete(root);expect(lastTarget.itemHrid==='/items/milk','返回后仍使用旧物品')});
      await check('关闭市场后释放局部观察器',async()=>{const root=panel();stage.append(root);await wait(150);root.remove();await wait(150);expect(mooncakeOrderBookObservers.size===0,'关闭后仍保留观察器');const count=bookCalls;await wait(200);expect(bookCalls===count,'关闭后仍在刷新')});
      await reset();const root=panel();stage.append(root);await wait(160);result.textContent=(checks.some(line=>line.startsWith('FAIL'))?'FAILED':'PASS ALL')+' · '+checks.filter(line=>line.startsWith('PASS')).length+'/'+checks.length+'\n'+checks.join('\n');document.getElementById('run').disabled=false;
    }
    hookEnhancementDetailTable();document.getElementById('run').onclick=run;
    </script></html>`;
    new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
    createServer((request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(html);
    }).listen(0, '127.0.0.1', function() { console.log(`Order-book ${baseline || 'fixed'} checks: http://127.0.0.1:${this.address().port}/`); });
}
