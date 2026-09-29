import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';

const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
const source = baseline ? execFileSync('git', ['show', `${baseline}:src/mooncake.js`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    : await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `Missing ${name}`);
    let position = source.indexOf('(', start), depth = 0;
    do { if (source[position] === '(') depth++; if (source[position] === ')') depth--; position++; } while (depth);
    position = source.indexOf('{', position);
    do { if (source[position] === '{') depth++; if (source[position] === '}') depth--; position++; } while (depth);
    return source.slice(start, position);
}
const constants = source.slice(source.indexOf('    const MOONCAKE_ORDER_MODAL_ATTR ='), source.indexOf('    function mooncakeGetDungeonTokenShopOutputHrid('))
    .replace(/^.*MOONCAKE_DUNGEON_TOKEN_LISTING_BADGE_IMAGE_SRC.*$/m, '');
const names = [
    'mooncakeIsVisibleElement', 'mooncakeHridFromUseNode', 'mooncakeNormalizeItemIdToHrid', 'parsePriceText',
    'mooncakeGetOrderModalHeaderText', 'mooncakeGetOrderModalTransactionKind', 'mooncakeGetOrderModalType',
    'mooncakeGetOrderModalKindLabel', 'mooncakeGetOrderModalPrimaryTaxMode', 'mooncakeIsCreateOrderModal',
    'mooncakeGetOrderModalItemHrid', 'mooncakeGetOrderModalEnhancementLevel', 'mooncakeParseOrderModalPrice',
    'mooncakeGetOrderModalQuantity', 'mooncakeFindOrderModalPriceControls', 'mooncakeFindOrderModalPriceContainer',
    'mooncakeFindOrderModalQuantityContainer', 'mooncakeFindOrderModalPriceInput', 'mooncakeFindOrderModalPriceDisplay',
    'mooncakeGetOrderModalUnitPrice', 'mooncakeCalculateOrderModalEconomicsAtTaxMode',
    'mooncakeEnsureOrderModalTargetHourlyRow', 'mooncakePlaceOrderModalEconomicsRows', 'mooncakeFormatSignedMoney',
    'mooncakeGetOrderModalEconomicsColor', 'mooncakeSetOrderModalEconomicsUnavailable', 'mooncakeRemoveOrderModalEconomicsRows',
    'mooncakeRemoveDungeonTokenListingGuide',
    'mooncakeUpdateOrderModalEconomics', 'mooncakeScheduleOrderModalEconomics', 'mooncakeCleanupOrderModalEconomics',
    'mooncakeCreateOrderModalEconomicsMetric', 'mooncakeEnsureOrderModalEconomics', 'mooncakeFindOrderModalRoots',
    'mooncakeEnsureVisibleOrderModalEconomics', 'mooncakeScheduleOrderModalScan', 'mooncakeRefreshOrderModalEconomics',
    'hookMooncakeOrderModalEconomics'
];
const functions = names.map(extract).join('\n');
if (!process.argv.includes('--serve')) {
    console.log('Use --serve to run the order-modal DOM checks in the browser; --baseline=HEAD compares the published implementation.');
    process.exit(0);
}
const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>嵌套挂牌弹窗检查</title>
<style>
body{background:#161923;color:#dfe7fb;font:15px system-ui;margin:20px}button{background:#4559a7;color:white;border:1px solid #7c8bbc;border-radius:4px;padding:7px 14px;cursor:pointer}#results{white-space:pre-wrap;min-height:40px}.market{background:#1c202c;border:1px solid #46506b;padding:16px;border-radius:6px}h2{margin:0 0 12px;text-align:center}.MarketFixture_header{opacity:.7}.order{width:470px;max-width:100%;box-sizing:border-box;margin:12px auto;padding:16px;background:#11141b;border:1px solid #a1a9c2;border-radius:7px}.MarketplacePanel_header__fixture{text-align:center;font-weight:700;margin-bottom:14px}.MarketplacePanel_itemContainer__fixture{margin:auto auto 16px;width:90px;background:#2c3048;text-align:center;padding:8px}.Item_enhancementLevel__fixture{color:#82c8ed}.MarketplacePanel_inputContainer__fixture{margin:12px 0;text-align:center}.MarketplacePanel_priceInputs__fixture,.MarketplacePanel_quantityInputs__fixture{display:flex;gap:5px;justify-content:center}input,.MarketplacePanel_priceDisplay__fixture{width:130px;background:#dce2f9;color:#151923;border:1px solid #6e83bd;border-radius:4px;padding:5px;text-align:center;font:inherit}.MarketplacePanel_label__fixture{margin-bottom:7px}.footer{text-align:center;margin-top:12px}#fixture .other{padding:8px;border:1px dashed #7182a2;margin:8px 0}svg{display:block;margin:auto}button:disabled{opacity:.5}
</style><button id="run">运行弹窗检查</button> <span>${baseline ? '旧版 ' + baseline : '修复版'}</span><pre id="results" role="status">等待检查</pre><div id="fixture"></div>
<script>(()=>{
const isZH=true, currentMarketItem={itemHrid:'/items/background'};
let mooncakeMarketPricingRevision=1,mooncakeHourlyWageColorProfileRevision=1,calculations=0,posts=0;
const MOONCAKE_MARKET_SELL_TAX_PERCENT=4,MOONCAKE_MARKET_SELL_NET_FACTOR=.96;
const MOONCAKE_ORDER_TARGET_HOURLY_MIN_M=0,MOONCAKE_ORDER_TARGET_HOURLY_MAX_M=1000000;
const getMarketData=()=>({marketData:{}}),getEnhancementRouteObjective=()=>'standard';
const mooncakeGetItemDetailOfHrid=hrid=>hrid?.startsWith('/items/')?{}:null;
const mooncakeIsEnhanceableItem=hrid=>hrid!='/items/material'&&!!hrid;
const mooncakeParseItemHridFromPanel=()=>'/items/background',mooncakeGetCurrentMarketEnhanceLevel=()=>15;
const mooncakeGetMarketNetSaleUnitPrice=price=>price*.96;
function mooncakeCalculateEnhancementRouteAtPrice(hrid,level,data,price){calculations++;return {totalCost:hrid==='/items/background'?100e6:2e6,totalTimeHours:2,protectAt:6};}
const mooncakeEvaluateEnhancementEconomics=()=>({combinedColor:'#a0e0c8'}),mooncakeResolveObjectiveRoutePair=()=>null;
const mooncakeGetOrderModalTradeOffProtectSuffix=()=>'',mooncakeBuildOrderModalEconomicsTooltip=()=>'<b>测试工时明细</b>';
const hideTooltip=()=>{};
function mooncakeEnsureDungeonTokenListingGuide(modal){
 if(mooncakeGetOrderModalItemHrid(modal)!=='/items/material'||mooncakeDungeonTokenListingBadges.has(modal))return;
 const badge=document.createElement('div');badge.setAttribute(MOONCAKE_DUNGEON_TOKEN_LISTING_BADGE_ATTR,'1');
 badge._mooncakeDungeonTokenListingModal=modal;badge.textContent='兑换线';document.body.append(badge);mooncakeDungeonTokenListingBadges.set(modal,badge);
}
const bindTooltip=(node,html)=>{node.title=html.replace(/<[^>]+>/g,'')};
const formatMoney=value=>(value/1e6).toFixed(2)+'M',mooncakeFormatSignedHourlyWage=value=>(value>0?'+':'')+formatMoney(value);
const mooncakeBindNonNegativeHourlyInput=()=>{},mooncakeGetOrderTargetHourlyM=()=>12;
function subscribeDocumentMutations(name,callback){const observer=new MutationObserver(callback);observer.observe(document.body,{childList:true,subtree:true});}
${constants}
${functions}
const host=document.getElementById('fixture'),result=document.getElementById('results');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const failures=[];let passed=0;
function expect(value,message){if(!value)throw Error(message);}
function listing({title='购买挂牌',hrid='clock',level=7}={}){
 const content=document.createElement('div');content.className='MarketplacePanel_modalContent__fixture order';
 content.innerHTML='<div class="MarketplacePanel_header__fixture">'+title+'</div><div class="MarketplacePanel_itemContainer__fixture"><span class="Item_enhancementLevel__fixture">+'+level+'</span><svg width="38" height="38"><use href="/items.svg#'+hrid+'"></use></svg>'+hrid+'</div><div class="MarketplacePanel_inputContainer__fixture"><div class="MarketplacePanel_label__fixture">强化等级</div><input value="'+level+'"></div><div class="MarketplacePanel_inputContainer__fixture"><div class="MarketplacePanel_label__fixture">价格</div><div class="MarketplacePanel_priceInputs__fixture"><button>-</button><div class="MarketplacePanel_priceDisplay__fixture">4,320,000</div><button>+</button></div></div><div class="MarketplacePanel_inputContainer__fixture"><div class="MarketplacePanel_label__fixture">数量</div><div class="MarketplacePanel_quantityInputs__fixture"><input value="1"></div></div><div class="footer"><button data-submit>发布挂牌</button></div>';
 content.querySelector('[data-submit]').onclick=()=>posts++;return content;
}
function wrap(content){const wrapper=document.createElement('div');wrapper.className='Modal_modalContainer__fixture';wrapper.append(content);return wrapper;}
function market(content,{generic=false,nativeWrapper=true}={}){
 const panel=document.createElement('div');panel.className='MainPanel_marketplaceModalContent__fixture market';
 panel.innerHTML='<h2>市场</h2><div class="MarketFixture_header">商品列表　我的挂牌　其他页面打开的市场</div><svg><use href="/items.svg#background"></use></svg><span class="Item_enhancementLevel__fixture">+15</span>';
 panel.append(nativeWrapper?wrap(content):content);return generic?wrap(panel):panel;
}
function verify(content,count=2){
 const economics=content.querySelector('.mooncake-order-economics-row');expect(economics,'缺少工时与利润');
 expect(content.querySelector('[data-mooncake-order-target-hourly]'),'缺少目标工时填价');
 expect(economics.querySelectorAll('[data-mooncake-order-hourly]').length===count,'买卖税率行数错误');
 expect(!economics.textContent.includes('等待')&&!economics.textContent.includes('缺少'),'未完成计算');
 expect(content.querySelectorAll('.mooncake-order-economics-row').length===1,'重复插入工时');
 return economics;
}
async function check(name,fn){host.replaceChildren();await pause(100);try{await fn();passed++;result.textContent+='PASS '+name+'\n';}catch(error){failures.push(name+': '+error.message);result.textContent+='FAIL '+name+': '+error.message+'\n';}}
async function run(){document.getElementById('run').disabled=true;result.textContent='';passed=0;failures.length=0;
 await check('普通市场购买挂牌',async()=>{const content=listing();host.append(wrap(content));await pause(350);verify(content);expect(content.querySelector('[data-mooncake-order-hourly]').textContent==='+1.16M','价格或物品错误');});
 await check('原生双层市场与出售挂牌',async()=>{const content=listing({title:'出售挂牌'});host.append(market(content));await pause(350);verify(content,1);});
 await check('外层市场容器不读取或清理内层挂牌',async()=>{const content=listing();const outer=market(content,{generic:true,nativeWrapper:false});host.append(outer);await pause(350);verify(content);expect(!mooncakeFindOrderModalRoots().includes(outer),'错误识别为外层市场');});
 await check('其他弹窗不会遮蔽挂牌内容扫描',async()=>{const unrelated=wrap(document.createElement('h3'));unrelated.firstChild.textContent='物品详情';host.append(unrelated);const content=listing();host.append(market(content,{nativeWrapper:false}));await pause(350);verify(content);});
 await check('市场与挂牌均有通用弹窗外壳时不循环清理',async()=>{const content=listing();host.append(market(content,{generic:true}));await pause(350);const old=verify(content);const count=calculations;await pause(450);expect(verify(content)===old,'工时行被反复删除');expect(calculations===count,'计算/观察器循环');});
 await check('关闭并重新打开挂牌',async()=>{const content=listing();const panel=market(content);host.append(panel);await pause(350);verify(content);const owner=mooncakeFindOrderModalRoots().find(root=>root.contains(content)||root===content);content.parentElement.remove();await pause(180);expect(!mooncakeOrderModalObservers.has(owner),'关闭后观察器未清理');const next=listing({title:'出售挂牌'});panel.append(wrap(next));await pause(350);verify(next,1);});
 await check('同一批次新增和关闭弹窗均正确处理',async()=>{const old=listing();host.append(wrap(old));await pause(350);verify(old);const owner=mooncakeFindOrderModalRoots().find(root=>root.contains(old)||root===old);const next=listing();host.append(wrap(next));old.parentElement.remove();await pause(350);verify(next);expect(!mooncakeOrderModalObservers.has(owner),'同一批次关闭窗口漏清理');});
 await check('复用原窗口后仍观察价格变化',async()=>{const content=listing();const wrapper=wrap(content);host.append(wrapper);await pause(350);verify(content);wrapper.remove();await pause(180);host.append(wrapper);await pause(350);content.querySelector('[class*="MarketplacePanel_priceDisplay"]').firstChild.nodeValue='6,320,000';await pause(350);verify(content);expect(content.querySelector('[data-mooncake-order-hourly]').textContent==='+2.16M','复用窗口的价格更新失效');});
 await check('已有空挂牌内容异步填入表单',async()=>{const outer=wrap(document.createElement('h3'));outer.firstChild.textContent='市场';const content=document.createElement('div');content.className='MarketplacePanel_modalContent__fixture order';outer.append(content);host.append(outer);await pause(180);content.append(...listing().childNodes);await pause(350);verify(content);});
 await check('隐藏旧窗口及后台物品不污染当前窗口',async()=>{const hidden=wrap(listing({hrid:'background',level:15}));hidden.style.display='none';host.append(hidden);const content=listing();host.append(market(content));await pause(350);verify(content);expect(content.querySelector('[data-mooncake-order-hourly]').textContent==='+1.16M','读到了后台物品');expect(!hidden.querySelector('.mooncake-order-economics-row'),'修改了隐藏窗口');});
 await check('立即买卖弹窗仍显示对应工时',async()=>{const buy=listing({title:'立即购买'}),sell=listing({title:'立即出售'});host.append(market(buy),wrap(sell));await pause(350);verify(buy);verify(sell,1);});
 await check('旧版无独立内容容器的挂牌兼容',async()=>{const content=listing();content.className='order';host.append(wrap(content));await pause(350);verify(content);});
 await check('材料不显示强化信息，关闭时清理兑换线',async()=>{const content=listing({hrid:'material',level:0});host.append(market(content));await pause(350);expect(!content.querySelector('.mooncake-order-economics-row'),'给材料显示强化工时');expect(document.querySelector('[data-mooncake-dungeon-token-listing-badge]'),'兑换线未创建');content.parentElement.remove();await pause(200);expect(!document.querySelector('[data-mooncake-dungeon-token-listing-badge]'),'关闭后残留兑换线');expect(posts===0,'插件触发了发布操作');});
 host.replaceChildren(market(listing()));await pause(350);document.getElementById('run').disabled=false;
 result.textContent+='\n'+(failures.length?'FAIL '+failures.length:'PASS ALL '+passed);}
document.getElementById('run').onclick=run;hookMooncakeOrderModalEconomics();host.append(market(listing()));
})();</script></html>`;
const server=createServer((request,response)=>{response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);});
server.listen(0,'127.0.0.1',()=>console.log(`Order modal checks: http://127.0.0.1:${server.address().port}/`));
