import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import vm from 'node:vm';

const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `Missing ${name}`);
    let position = source.indexOf('(', start), depth = 0;
    do { if (source[position] === '(') depth++; if (source[position] === ')') depth--; position++; } while (depth);
    position = source.indexOf('{', position);
    do { if (source[position] === '{') depth++; if (source[position] === '}') depth--; position++; } while (depth);
    return source.slice(start, position);
}
const context = vm.createContext({ mooncakeGetFiberKey: () => '_fiber' });
vm.runInContext(['mooncakeNormalizeMyListingId', 'mooncakeResolveMyListingSideText', 'mooncakeResolveMyListingSellSide',
    'mooncakeResolveMyListingActiveStatus', 'mooncakeReadMyListingFromFiber'].map(extract).join('\n'), context);
const listing = { id: 7, itemHrid: '/items/equipment', enhancementLevel: 12, price: 2240e6,
    workingPrice: 2280e6, isSell: true, status: '/market_listing_status/active', orderQuantity: 1, filledQuantity: 0 };
const row = { _fiber: { memoizedProps: { listing } } };
assert.equal(context.mooncakeReadMyListingFromFiber(row).price, 2280e6, 'pegged orders use the visible working price');
listing.workingPrice = 0;
assert.equal(context.mooncakeReadMyListingFromFiber(row).price, 2240e6, 'ordinary orders retain their price');
listing.price = undefined; listing.orderPrice = 30e6;
assert.equal(context.mooncakeReadMyListingFromFiber(row).price, 30e6, 'older order schemas remain supported');
console.log('My-listing price checks passed. Use --serve for the native React price and asynchronous DOM regression checks.');

if (process.argv.includes('--serve')) {
    const bundle = await readFile(new URL('../main.8add56c3.chunk.js', import.meta.url), 'utf8');
    const start = bundle.indexOf('renderListingPrice(e){');
    const end = bundle.indexOf('renderMainTabs(){', start);
    assert(start >= 0 && end > start, 'official listing price renderer must be available');
    const nativePriceRenderer = bundle.slice(start, end);
    const functions = [
        'mooncakeResolveMyListingSideText', 'mooncakeResolveMyListingSellSide', 'mooncakeResolveMyListingBooleanText',
        'mooncakeResolveMyListingActiveStatus', 'mooncakeNormalizeMyListingId', 'mooncakeReadMyListingFromFiber',
        'mooncakeReadMyListingProgress', 'mooncakeReadMyListingFromDom', 'mooncakeGetMyListingRowDescriptor',
        'mooncakeGetMyListingNativePriceText', 'parsePriceText', 'calcHourlyWageAndMetrics',
        'mooncakeGetMyListingsRoot', 'mooncakeGetVisibleMyListingsTable', 'mooncakeObserveMyListingsHourlyTable',
        'mooncakeEnsureMyListingsHourlyStyle', 'mooncakeRenderMyListingHourlyWage', 'mooncakeScheduleMyListingsHourlyWages',
        'hookMooncakeMyListingsHourlyWages', 'mooncakeNodeTouchesMyListings', 'mooncakeIsMyListingsTargetFilterInternalNode',
        'mooncakeMyListingsTargetFilterMutationNeedsRefresh', 'mooncakeIsMyListingsManagementInternalNode',
        'mooncakeMyListingsManagementMutationNeedsRefresh', 'mooncakeSetMarketplaceInlineHourlyWage'
    ].map(extract).join('\n');
    const constants = [...source.matchAll(/^    const MOONCAKE_MY_LISTINGS_\w+_ATTR = '[^']+';/gm)].map(m => m[0]).join('\n');
    const globals = source.slice(source.indexOf('    let mooncakeMyListingsHourlyRevision ='),
        source.indexOf('    function mooncakeObserveMyListingsHourlyTable('));
    const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>我的挂牌工时费检查</title>
    <style>body{background:#111319;color:#b8c2de;font:15px system-ui;margin:24px}button{color:inherit;background:#4057a2;padding:7px 14px;border:0;border-radius:4px;cursor:pointer}table{width:100%;border-collapse:collapse}th,td{padding:14px;text-align:center}th{background:#252637}tbody tr:nth-child(even){background:#21232f}.MarketplacePanel_price__fixture{color:#7ed6ce}#result{white-space:pre-wrap}.mooncake-market-inline-hourly-label{color:#a0acc1;margin-right:3px}.mooncake-market-inline-hourly-value{font-weight:700}.Item_itemContainer__fixture{display:inline-block;min-width:66px;padding:6px;background:#2b2c43}.Item_enhancementLevel__fixture{color:#d0a0ee}#tooltip{padding:14px;background:#202332}</style>
    <button id="run">运行完整检查</button> <button id="narrow">切换窄屏</button><p>使用游戏原生价格渲染器；本地固定成本样本，不访问游戏账户。</p>
    <div id="root"></div><pre id="result" role="status">等待检查</pre><div id="tooltip"></div>
    <script src="/react.js"></script><script src="/react-dom.js"></script><script>
    ${constants}
    ${globals}
    const isZH=true, h={jsx:(type,props)=>React.createElement(type,props),jsxs:(type,props)=>React.createElement(type,props,...props.children)};
    const im={a:{rangeLimitedPrice:'MarketplacePanel_rangeLimitedPrice__fixture',rangeLimitedMarker:'MarketplacePanel_rangeLimitedMarker__fixture'}};
    const br={getBookPrice:e=>e.workingPrice||e.price,isPegged:e=>e.workingPrice>0,MarketListingStatuses:{Active:'/market_listing_status/active'}};
    const W={formatMarketplacePriceColorComponent:value=>React.createElement('span',{className:'native-price'},format(value)),formatMarketplacePrice:format};
    const os=props=>React.createElement('span',{title:props.title},props.children);
    class NativePrice extends React.Component { ${nativePriceRenderer} render(){return this.renderListingPrice(this.props.listing)} }
    let enabled=true, available=true, market={marketData:{}}, cost=1500e6, hours=10, calls=0, nativeClicks=0;
    let mooncakeMarketPricingRevision=0,mooncakeHourlyWageColorProfileRevision=0,profile=1,objective='standard';
    const getMarketData=()=>available?market:null,getPlayerEnhanceParams=()=>({profile}),getEnhancementRouteObjective=()=>objective;
    const mooncakeGetEnhancementStandardHourlyWage=()=>10e6,isMarketplaceHourlyWageEnabled=()=>enabled;
    const mooncakeGetItemDetailOfHrid=hrid=>hrid?{}:null,mooncakeIsEnhanceableItem=hrid=>hrid?.includes('equipment');
    const mooncakeHridFromUseNode=node=>node.getAttribute('href'),mooncakeGetFiberKey=node=>Object.keys(node).find(key=>key.startsWith('__reactFiber$'));
    const mooncakeIsVisibleElement=node=>!!node?.getClientRects().length;
    function format(value){return value>=1e6?(value/1e6)+'M':String(value)}
    function mooncakeFormatSignedHourlyWage(value){return (value>0?'+':'')+(value/1e6).toFixed(2)+'M'}
    function mooncakeCalculateEnhancementRouteAtPrice(hrid,level,data,price){calls++;return {totalCost:cost,totalTimeHours:hours/profile,hourlyWage:(price*.96-cost)/(hours/profile),protectAt:6};}
    const mooncakeResolveObjectiveRoutePair=()=>null;
    const mooncakeEvaluateEnhancementEconomics=route=>({combinedColor:route.hourlyWage<0?'#ff7777':'#9ed995'});
    const buildTooltipHtml=(level,metrics,price)=>'价格 '+format(price)+' / +'+level+' / 工时 '+mooncakeFormatSignedHourlyWage(metrics.hourlyWage)+'/h';
    const bindTooltip=(node,html)=>{node._mooncakeTooltipHtml=html;node.onclick=()=>document.getElementById('tooltip').textContent=html()};
    const warming=new Map();
    function mooncakeEnsureEnhancementRoutePrewarm(hrid,level){const key=hrid+level+profile; if(warming.has(key))return warming.get(key);const state={ready:false};state.promise=new Promise(resolve=>setTimeout(()=>{state.ready=true;resolve()},25));warming.set(key,state);return state;}
    function subscribeDocumentMutations(name,callback){const observer=new MutationObserver(callback);observer.observe(document.body,{childList:true,subtree:true});}
    ${functions}
    let data=[];
    function sample(id,price,level=12,hrid='/items/equipment',extra={}){return {id,price,enhancementLevel:level,itemHrid:hrid,isSell:true,status:'/market_listing_status/active',orderQuantity:1,filledQuantity:0,...extra}}
    function examples(){return [sample(1,2240e6),sample(2,65e6,10),sample(3,1100e6),sample(4,60e3,0,'/items/milk'),sample(5,40e6,0),sample(6,2000e6,12,'/items/equipment',{isSell:false}),sample(7,1200e6,12,'/items/equipment',{workingPrice:2280e6})]}
    function render(){ReactDOM.render(React.createElement('div',{className:'MarketplacePanel_myListings__fixture'},React.createElement('table',{className:'MarketplacePanel_myListingsTable__fixture'},React.createElement('thead',null,React.createElement('tr',null,...['状态','类型','进度','价格','收集','聊天链接','取消'].map(text=>React.createElement('th',{key:text},text)))),React.createElement('tbody',null,data.map(item=>React.createElement('tr',{key:item.id,'data-id':item.id},React.createElement('td',null,'有效'),React.createElement('td',null,item.isSell?'出售':'购买'),React.createElement('td',null,React.createElement('div',{className:'Item_itemContainer__fixture'},React.createElement('svg',{width:20,height:16},React.createElement('use',{href:item.itemHrid})),item.enhancementLevel>0?React.createElement('span',{className:'Item_enhancementLevel__fixture'},'+'+item.enhancementLevel):null),React.createElement('div',null,'0 / 1')),React.createElement('td',{className:'MarketplacePanel_price__fixture'},React.createElement(NativePrice,{listing:item,t:key=>key})),React.createElement('td'),React.createElement('td',null,React.createElement('button',{onClick:()=>nativeClicks++},'链接')),React.createElement('td',null,React.createElement('button',{onClick:()=>nativeClicks++},'取消'))))))),document.getElementById('root'));}
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)), getRow=id=>document.querySelector('[data-id="'+id+'"]');
    const metric=id=>getRow(id)?.querySelector('[data-mooncake-my-listing-hourly]');
    function expect(condition,message){if(!condition)throw Error(message)}
    async function settled(){await pause(350)}
    const checks=[];function pass(text){checks.push(text)}
    async function run(){
      try {
        await settled();
        expect(metric(1)?.textContent.includes('+65.04M/h'),'incorrect tax-adjusted wage');
        expect(metric(2)?.textContent.includes('-143.76M/h'),'negative wage hidden');
        expect(!metric(4)&&!metric(5),'materials or +0 show a wage');
        expect(metric(6)?.textContent.includes('+42.00M/h'),'buy-side quote mismatch');
        expect(metric(7)?.textContent.includes('+68.88M/h'),'pegged displayed price mismatch');
        expect(getRow(7).querySelector('sup')?.textContent==='*','native peg marker removed');
        expect(mooncakeReadMyListingFromDom(getRow(7)).price===2280e6,'native price parser was polluted');
        pass('普通、购买及区间挂牌价格；材料和 +0 排除；税后工时含负值');
        const old=metric(1), native=getRow(1).querySelector('.native-price'), before=calls;
        mooncakeScheduleMyListingsHourlyWages();await settled();
        expect(metric(1)===old&&calls===before,'unchanged rows recalculated or rebuilt');
        data[0].price=2400e6;render();await settled();
        expect(getRow(1).querySelector('.native-price')===native,'native price node was replaced');
        expect(metric(1)?.textContent.includes('+80.40M/h'),'React text-only price update ignored');
        expect(getRow(1).querySelectorAll('[data-mooncake-my-listing-hourly]').length===1,'duplicate wage');
        pass('价格原地更新自动重算，无重复标记；未变更行复用结果');
        data[0].enhancementLevel=0;render();await settled();expect(!metric(1),'stale wage made +0 look enhanced');
        data[0].enhancementLevel=12;data[0].price=0;render();await settled();expect(!metric(1),'invalid price retained wage');
        data[0].price=1562.5e6;render();await settled();expect(metric(1)?.textContent.includes('0.00M/h'),'zero wage missing');
        data[0].price=2240e6;render();await settled();
        profile=2;mooncakeScheduleMyListingsHourlyWages();await settled();expect(metric(1)?.textContent.includes('+130.08M/h'),'profile change did not refresh');
        cost=1600e6;mooncakeMarketPricingRevision++;mooncakeScheduleMyListingsHourlyWages();await settled();expect(metric(1)?.textContent.includes('+110.08M/h'),'material quote change did not refresh');
        pass('等级、无效价格、零工时、强化配置及成本行情更新');
        available=false;mooncakeScheduleMyListingsHourlyWages();await settled();expect(metric(1)?.textContent.includes('—'),'missing data presented as zero');
        available=true;mooncakeScheduleMyListingsHourlyWages();await settled();expect(!metric(1)?.textContent.includes('—'),'data recovery failed');
        enabled=false;mooncakeScheduleMyListingsHourlyWages();await settled();expect(!document.querySelector('[data-mooncake-my-listing-hourly]'),'disable did not clean up');
        enabled=true;mooncakeScheduleMyListingsHourlyWages();await settled();expect(metric(1),'reenable failed');
        getRow(1).querySelector('button').click();expect(nativeClicks===1,'native button was broken');
        metric(1).click();expect(document.getElementById('tooltip').textContent.includes('2240M'),'tooltip price mismatch');
        pass('缺行情恢复、开关清理、原生按钮及工时提示');
        const obsolete=getRow(1);data=[sample(20,2400e6,15)];render();await pause(70);data=[sample(21,2240e6,13)];render();await settled();
        expect(!obsolete.isConnected&&metric(21)&&!getRow(20),'stale prewarm revived an old row');
        ReactDOM.unmountComponentAtNode(document.getElementById('root'));await settled();expect(!mooncakeMyListingsHourlyTable,'removed table observer leaked');
        profile=1;cost=1500e6;data=examples();render();await settled();
        const stable=calls;await settled();expect(calls===stable,'observer self-refresh loop');
        const own=metric(1);
        for(const predicate of [mooncakeMyListingsTargetFilterMutationNeedsRefresh,mooncakeMyListingsManagementMutationNeedsRefresh]){
          expect(!predicate({type:'childList',target:own,addedNodes:[own.firstChild],removedNodes:[]}), 'wage update retriggered listing filters');
        }
        pass('异步切换、关闭重开、观察器清理；不触发挂牌筛选循环');
        document.getElementById('result').textContent='PASS\n'+checks.join('\n');
      } catch(error){document.getElementById('result').textContent='FAIL: '+error.message;console.error(error)}
    }
    document.getElementById('run').onclick=run;
    document.getElementById('narrow').onclick=()=>{const root=document.getElementById('root');root.style.width=root.style.width?'':'360px';root.style.overflowX='auto'};
    data=examples();render();hookMooncakeMyListingsHourlyWages();
    </script></html>`;
    const assets = new Map(await Promise.all(['react', 'react-dom'].map(async name => [
        `/${name}.js`, await readFile(new URL(`umd/${name}.development.js`, import.meta.resolve(name)))
    ])));
    const server = createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (assets.has(request.url)) { response.setHeader('Content-Type', 'text/javascript'); response.end(assets.get(request.url)); }
        else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
    });
    server.listen(0, '127.0.0.1', () => console.log(`My-listings hourly checks: http://127.0.0.1:${server.address().port}/`));
}
