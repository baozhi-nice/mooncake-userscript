import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Real DOM regression for nested native tabs. The native tab switch changes
// classes, while Mooncake's top-level tab also uses the hidden attribute.
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
const source = baseline
    ? execFileSync('git', ['show', `${baseline}:src/mooncake.js`], { encoding: 'utf8', maxBuffer: 8e6 })
    : await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
const extract = name => {
    const start = source.indexOf(`    function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n    function ', start + 1));
};
const functions = [
    'mooncakeIsVisibleElement', 'mooncakeFindVisibleEnhancementTabContainers',
    'createEnhancementTab', 'bindEnhancementTabEvents',
    'mooncakeWarehouseGetNativeTabsComponent', 'mooncakeWarehouseGetLayoutRoot'
].map(extract).join('\n');
const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="UTF-8">
<title>库存页签隔离回归检查</title><style>
*{box-sizing:border-box}body{margin:20px;background:#151720;color:#d5ddf4;font:16px system-ui}
button{font:inherit;padding:10px 18px;border:1px solid #65709c;border-radius:5px;color:inherit;background:#303751;cursor:pointer}
[role=tablist]{display:flex;gap:4px;padding:6px 0;border-bottom:2px solid #464d6c}
.Mui-selected{background:#4b5aaf} .TabPanel_hidden__26UM3,[hidden]{display:none!important}
.CharacterManagement_tabsComponentContainer__fixture{max-width:650px;border:1px solid #464d6c;padding:10px}
.TabPanel_tabPanel__fixture{padding:10px 0;min-height:24px}
.Inventory_itemGrid__fixture{display:flex;gap:6px;padding:8px 0}
.Item_itemContainer__fixture{width:82px;height:82px;border-radius:5px;background:#2e324a;display:grid;place-items:center;font-size:36px}
.queue-title{padding:8px;background:#252e48;border-left:2px solid #d49e68}.queue{margin:10px 0}
#result{white-space:pre-wrap;min-height:44px}#result[data-result=pass]{color:#93d9ad}#result[data-result=fail]{color:#ff9c9c}
.controls{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
</style><h2>库存页签隔离回归检查</h2><div class="controls">
<button id="run">运行页面切换检查</button><button id="waiting">检查库存挂载等待</button>
</div><pre id="result" role="status">等待检查</pre><div id="stage"></div><script>
${functions}
const MOONCAKE_ENHANCEMENT_TAB_BUTTON_ATTR='data-test-enhancement-tab';
const MOONCAKE_ENHANCEMENT_TAB_PANEL_ATTR='data-test-enhancement-panel';
const isZH=true, currentMarketItem=null;
let enhancementTabButton=null, enhancementTabPanel=null;
let mooncakeEnhancementNativeTabBindings=new WeakSet();
const scheduleEnhancementTabEnsure=()=>{}, ensureEnhancementTabReady=()=>true;
const createEnhancementTabContent=()=>{enhancementTabPanel.textContent='包子页面';};
const stage=document.getElementById('stage'), result=document.getElementById('result');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const panelClass='TabPanel_tabPanel__fixture', hiddenClass='TabPanel_hidden__26UM3';
const card=icon=>'<div class="Item_itemContainer__fixture">'+icon+'</div>';
function nativeTabs(labels,panels){
    return '<div class="TabsComponent_tabsComponent__fixture"><div class="TabsComponent_tabsContainer__fixture"><div role="tablist">'+
        labels.map((label,i)=>'<button role="tab" class="'+(i?'':'Mui-selected')+'" aria-selected="'+!i+'">'+label+'</button>').join('')+
        '</div></div><div class="TabsComponent_tabPanelsContainer__fixture">'+
        panels.map((panel,i)=>'<div class="'+panelClass+(i?' '+hiddenClass:'')+'">'+panel+'</div>').join('')+'</div></div>';
}
function wireNative(component){
    const tabs=[...component.querySelector(':scope > .TabsComponent_tabsContainer__fixture').querySelectorAll('[role=tab]')];
    const panels=[...component.querySelector(':scope > .TabsComponent_tabPanelsContainer__fixture').children];
    tabs.forEach((tab,index)=>tab.addEventListener('click',()=>{
        tabs.forEach((entry,i)=>{entry.classList.toggle('Mui-selected',i===index);entry.setAttribute('aria-selected',String(i===index));});
        panels.forEach((entry,i)=>entry.classList.toggle(hiddenClass,i!==index));
    }));
    return {tabs,panels};
}
let outer, inner, otherInner;
function mountInventory(){
    const inventory=outer.panels[0].querySelector('.Inventory_items__fixture');
    inventory.innerHTML=nativeTabs(['全部','最爱','装备'],[
        '<div class="Inventory_itemGrid__fixture">'+['👢','🧥','🏹','🔮'].map(card).join('')+'</div>',
        '<div class="Inventory_itemGrid__fixture">'+card('👢')+'</div>',
        '<div class="Inventory_itemGrid__fixture">'+['🧥','🏹'].map(card).join('')+'</div>'
    ]);
    inner=wireNative(inventory.firstElementChild);
    const queue=document.createElement('div');queue.className='queue';
    queue.innerHTML='<div class="queue-title">当前强化队列　4</div><div class="Inventory_itemGrid__fixture">'+['👢','🧥','🔮'].map(card).join('')+'</div>';
    inventory.prepend(queue);
}
function mount(late=false){
    enhancementTabButton=null;enhancementTabPanel=null;mooncakeEnhancementNativeTabBindings=new WeakSet();
    stage.innerHTML='<div class="CharacterManagement_tabsComponentContainer__fixture">'+nativeTabs(['库存','装备','技能'],[
        '<div class="Inventory_inventory__fixture"><div>总资产 · 测试数据</div><div class="Inventory_items__fixture"></div></div>',
        nativeTabs(['套装一','套装二'],['装备信息一','装备信息二']), '技能页面'
    ])+'</div>';
    outer=wireNative(stage.firstElementChild.firstElementChild);
    otherInner=wireNative(outer.panels[1].firstElementChild);
    if(!late)mountInventory();
    createEnhancementTab();
    if(late)mountInventory();
}
function inventoryRoot(){return stage.querySelector('.Inventory_items__fixture');}
function run(){
    result.dataset.result='running';
    const failures=[], check=(condition,message)=>{if(!condition)failures.push(message);};
    for(const late of [false,true]){
        mount(late);
        const timing=late?'库存延后挂载':'库存已挂载';
        for(let round=0;round<8;round++){
            for(const selected of [0,1,2]){
                inner.tabs[selected].click();
                const before=inner.panels.map(panel=>[panel.hidden,panel.className]);
                enhancementTabButton.click();
                check(JSON.stringify(before)===JSON.stringify(inner.panels.map(panel=>[panel.hidden,panel.className])),timing+'：包子页误改了库存分类的隐藏状态');
                outer.tabs[0].click();
                check(mooncakeIsVisibleElement(inner.panels[selected]),timing+'：返回库存后物品不可见');
                check(mooncakeWarehouseGetLayoutRoot(inventoryRoot())===inner.panels[selected],timing+'：仓库选中了库存外层容器');
                check(!mooncakeIsVisibleElement(enhancementTabPanel),timing+'：包子页未收起');
                check(inner.panels.filter(mooncakeIsVisibleElement).length===1,timing+'：可见库存分类数量不正确');
                enhancementTabButton.click();outer.tabs[1].click();
                check(mooncakeIsVisibleElement(outer.panels[1]),timing+'：返回装备页后内容不可见');
                check(mooncakeIsVisibleElement(otherInner.panels[0])&&!mooncakeIsVisibleElement(otherInner.panels[1]),timing+'：装备页内部页签被误改');
                enhancementTabButton.click();outer.tabs[2].click();
                check(mooncakeIsVisibleElement(outer.panels[2]),timing+'：返回技能页后内容不可见');
                outer.tabs[0].click();
            }
        }
        if(failures.length)break;
    }
    const unique=[...new Set(failures)];
    result.dataset.result=unique.length?'fail':'pass';
    result.textContent=unique.length?'FAIL\n'+unique.join('\n'):'PASS：48 组切换正常；库存、最爱、装备分类保持原状态，装备和技能页正常显示。';
    if(!unique.length)inner.tabs[0].click();
}
function waiting(){
    try{
        mount();
        inner.panels.forEach(panel=>panel.classList.add(hiddenClass));
        assert(mooncakeWarehouseGetLayoutRoot(inventoryRoot())===null,'面板暂未就绪时，不应把分区内容放到库存外层（队列上方）');
        inner.panels[0].classList.remove(hiddenClass);
        assert(mooncakeWarehouseGetLayoutRoot(inventoryRoot())===inner.panels[0],'面板恢复后应重新选择库存内容容器');
        inner.panels.forEach(panel=>panel.remove());
        assert(mooncakeWarehouseGetLayoutRoot(inventoryRoot())===null,'原生面板尚未挂载时应等待');
        const legacy=document.createElement('div');legacy.innerHTML='<div class="Inventory_itemGrid__fixture"></div>';stage.append(legacy);
        assert(mooncakeWarehouseGetLayoutRoot(legacy)===legacy,'旧版无分类页签布局应继续使用原容器');legacy.remove();
        mount();result.dataset.result='pass';result.textContent='PASS：库存面板暂不可见、尚未挂载、重新出现及旧版布局检查通过。';
    }catch(error){result.dataset.result='fail';result.textContent='FAIL：'+error.message;}
}
document.getElementById('run').onclick=run;document.getElementById('waiting').onclick=waiting;mount();
</script></html>`;
const server = createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);});
server.listen(0,'127.0.0.1',()=>console.log(`Inventory tab isolation fixture: http://127.0.0.1:${server.address().port}`));
