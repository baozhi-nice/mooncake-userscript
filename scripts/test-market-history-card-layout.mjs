import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

// Browser regression: use the real card renderers, including desktop/floating
// sizing and positioning. Small fixtures replace only game data and tooltips.
const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
const extract = name => {
    const start = source.indexOf(`    function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n    function ', start + 1));
};
const functions = [
    'mooncakeFormatCompactNumber', 'mooncakeFormatHistoryPrice', 'mooncakeFormatMarketHistoryPrice',
    'mooncakeFormatSignedHourlyWage', 'mooncakeFormatHourlyWageCompact', 'mooncakeEscapeHtml',
    'mooncakeFormatMarketHistoryHourlyVolume', 'mooncakeBuildMarketHistoryHourlyRange',
    'mooncakeBuildMarketHistoryMedianTitle', 'mooncakeIsMarketHistoryEquipmentTarget',
    'mooncakeBuildMarketHistoryOrderValue', 'mooncakeGetMarketHistoryCardOrderPresentation',
    'mooncakeBuildMarketHistoryRows', 'mooncakeBuildMarketHistoryCardHtml', 'mooncakeStyleMarketHistoryCard',
    'mooncakePositionAnchoredMarketHistoryCard', 'mooncakeApplyFloatingMarketHistoryLayout',
    'mooncakeBringMarketHistoryFloatingCardToFront', 'mooncakeMoveFloatingMarketHistoryCard',
    'mooncakePositionFloatingMarketHistoryCard', 'mooncakeBuildMarketHistoryCollapsedHtml',
    'mooncakeRenderFloatingMarketHistoryCard', 'mooncakeRenderMarketHistoryCard',
    'mooncakeRefreshMarketHistoryCards', 'mooncakeApplyMarketHistoryCardOrder'
].map(extract).join('\n');
const constants = [...source.matchAll(/^    const MOONCAKE_MARKET_HISTORY_(?:CARD_ID|MOBILE_ID|FLOAT_SELECTOR|CARD_Z_INDEX|FLOAT_Z_INDEX|ANCHOR_MARGIN|LEGACY_ANCHOR_MARGIN|WINDOWS) = [^;]+;/gm)]
    .map(match => match[0]).join('\n');
const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>交易卡片自适应检查</title>
<style>html{overflow-y:scroll}body{background:#101217;color:#dce5f7;font:14px system-ui;margin:16px}button{cursor:pointer;background:#354773;color:inherit;border:1px solid #657fba;padding:6px 10px;border-radius:4px}
header{display:flex;flex-wrap:wrap;gap:8px}#stage{height:180px;margin-top:30px;position:relative;border:1px solid #303849}#anchor{position:relative;left:calc(50% - 32px);top:50px;width:64px;height:64px;background:#303149;border-radius:5px;text-align:center;padding-top:20px}
#result{white-space:pre-wrap;margin-top:220px}h2{font-size:14px;font-weight:500}</style>
<header><button id="check">检查全部列与窗口边界</button><button id="columns">切换买/卖列</button><button id="material">切换材料/装备</button><button id="long">切换长数值</button></header>
<h2>随物品显示的卡片</h2><div id="stage"><div id="anchor">装备 +12</div></div><h2>浮动卡片</h2>
<pre id="result" role="status">等待检查</pre><script>
${constants}
const isZH=true;
let sellFirst=true, itemHrid='/items/equipment', longValues=false, mooncakeMarketHistoryFloatDrag=null;
let columns={average:true,median:true,volume:true,buySell:true,range:true,hourly:true};
const mooncakeIsEnhanceableItem=hrid=>hrid==='/items/equipment';
const mooncakeIsMarketHistoryCardSellFirst=()=>sellFirst, mooncakeGetMarketHistoryMobileColumns=()=>columns;
const getMarketData=()=>({}), mooncakeFormatHourlyWage=value=>(value/1e6).toFixed(2)+'M';
const mooncakeCalcHourlyWageResultByPrice=(hrid,level,price)=>({hourlyWage:price-53040000,evaluation:{combinedColor:'#a8dccc'}});
const mooncakeIsPhoneMarketUi=()=>false, mooncakeYieldMarketHistoryCardToSunny=()=>false;
const mooncakeElevateMarketHistoryStacking=()=>{}, mooncakeBindMarketHistoryPriceTooltips=()=>{};
const mooncakeReadMarketHistoryFloatPosition=()=>null, mooncakeShouldUseViewportHistoryPosition=()=>false;
const anchor=document.getElementById('anchor');
const mooncakeGetCurrentMarketHistoryTarget=()=>({currentItem:anchor,itemHrid,level:12});
const mooncakeGetMarketHistoryFloatingCards=()=>[...document.querySelectorAll(MOONCAKE_MARKET_HISTORY_FLOAT_SELECTOR)];
${functions}
const floating=document.createElement('div');floating.dataset.mooncakeHistoryFloating='1';
floating.dataset.mooncakeHistoryFloatLeft='20';floating.dataset.mooncakeHistoryFloatTop='335';document.body.append(floating);
function windows(){return Object.fromEntries([1,3,7].map((days,i)=>[days,{avgPrice:66870000-i*3550000,medianPrice:66250000-i*4900000,
 volume:longValues?1234567890:2+i*7,buyVolume:longValues?712345678:1+i*5,sellVolume:longValues?522222212:1+i*2,
 minPrice:longValues?876543210:66250000-i*4900000,maxPrice:longValues?9876543210:67500000}]).concat([
 ['hourlyVolume5d',{complete:true,hourlyVolume:8400,volume:1008000}]]));}
function render(){const data=windows();mooncakeRenderMarketHistoryCard(mooncakeGetCurrentMarketHistoryTarget(),data);
 mooncakeRenderFloatingMarketHistoryCard(floating,mooncakeGetCurrentMarketHistoryTarget(),data);}
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const assert=(value,message)=>{if(!value)throw new Error(message)};
function checkCard(card){
 const rect=card.getBoundingClientRect(),table=card.querySelector('table'),shell=table.parentElement;
 assert(rect.left>=7&&rect.right<=document.documentElement.clientWidth-7,'卡片超出窗口边界');
 assert(card.scrollWidth<=card.clientWidth+1,'卡片外层被撑开');
 if(innerWidth>=1100)assert(shell.scrollWidth<=shell.clientWidth+1,'宽屏仍需横向滚动才能看到全部列');
 for(const cell of table.querySelectorAll('th,td'))assert(cell.scrollWidth<=cell.clientWidth+1,'单元格文字被截断');
 if(shell.scrollWidth>shell.clientWidth+1)assert(getComputedStyle(shell).overflowX==='auto','窄屏无法滚动查看完整内容');
}
document.getElementById('check').onclick=async()=>{
 const checks=[];try{
 for(const hrid of ['/items/equipment','/items/milk'])for(const long of [false,true])for(const side of [false,true]){
  itemHrid=hrid;longValues=long;columns.buySell=side;render();await frame();
  const card=document.getElementById(MOONCAKE_MARKET_HISTORY_CARD_ID);checkCard(card);checkCard(floating);
  if(side)assert(card.textContent.includes('买/卖'),'买/卖列丢失');
  if(hrid==='/items/milk')assert(card.textContent.includes('5d 时均量'),'材料时均量丢失');
  checks.push((hrid==='/items/equipment'?'装备':'材料')+' / '+(long?'长数值':'普通数值')+' / '+(side?'全部列':'关闭买/卖')+'：完整显示');
 }
 itemHrid='/items/equipment';longValues=false;columns.buySell=true;render();
 const wideWidth=floating.getBoundingClientRect().width;
 // A dragged card is the only live card. Column preferences must still update it.
 document.getElementById(MOONCAKE_MARKET_HISTORY_CARD_ID).remove();columns.buySell=false;
 mooncakeRefreshMarketHistoryCards();
 assert(!floating.textContent.includes('买/卖'),'浮动卡片列设置没有更新');
 if(innerWidth>=1100)assert(floating.getBoundingClientRect().width<wideWidth,'关闭列后宽度没有收缩');
 checks.push('浮动卡片独立更新列设置并收缩');
 columns.buySell=true;render();
 anchor.style.left='calc(100% - 70px)';mooncakePositionAnchoredMarketHistoryCard(document.getElementById(MOONCAKE_MARKET_HISTORY_CARD_ID));
 checkCard(document.getElementById(MOONCAKE_MARKET_HISTORY_CARD_ID));checks.push('右侧边缘自动调整位置');
 floating.dataset.mooncakeHistoryCollapsed='1';mooncakeRenderFloatingMarketHistoryCard(floating,mooncakeGetCurrentMarketHistoryTarget(),windows());
 assert(floating.getBoundingClientRect().width===34,'收起状态宽度错误');
 floating.dataset.mooncakeHistoryCollapsed='0';render();checkCard(floating);checks.push('收起再展开恢复完整宽度');
 sellFirst=false;mooncakeApplyMarketHistoryCardOrder(false);checkCard(floating);checks.push('买卖顺序切换保持完整');
 anchor.style.left='calc(50% - 32px)';sellFirst=true;render();
 document.getElementById('result').textContent='PASS '+checks.length+' 项\n'+checks.join('\n');
 }catch(error){document.getElementById('result').textContent='FAIL '+error.message+'\n'+checks.join('\n');}
};
document.getElementById('columns').onclick=()=>{columns.buySell=!columns.buySell;mooncakeRefreshMarketHistoryCards()};
document.getElementById('material').onclick=()=>{itemHrid=itemHrid==='/items/equipment'?'/items/milk':'/items/equipment';render()};
document.getElementById('long').onclick=()=>{longValues=!longValues;render()};
window.addEventListener('resize',()=>{mooncakePositionAnchoredMarketHistoryCard(document.getElementById(MOONCAKE_MARKET_HISTORY_CARD_ID));
 mooncakePositionFloatingMarketHistoryCard(floating,null,anchor)});
render();</script></html>`;
createServer((request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);})
    .listen(0,'127.0.0.1',function(){console.log('Market card layout: http://127.0.0.1:'+this.address().port)});
