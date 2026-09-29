import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { nativeItemFixture } from './fixtures/native-queue-item.mjs';

// Open the printed local URL in a browser. This checks real CSS geometry using
// production queue rendering; the native container rules below were verified
// against the game's main.2333036b.chunk.css (2026-09-28).
const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
function extractFunction(name) {
    const start = source.indexOf(`    function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    const end = source.indexOf('\n    function ', start + 1);
    return source.slice(start, end);
}
const constants = [...source.matchAll(/^    const MOONCAKE_WAREHOUSE_\w+_ATTR = '[^']+';/gm)].map(match => match[0]).join('\n');
const functions = [
    'mooncakeWarehouseEnsureStyles', 'mooncakeWarehouseClearLegacyQueueLayout',
    'mooncakeWarehouseGetLayoutMetrics',
    'mooncakeWarehouseSyncInventoryScroll', 'mooncakeWarehouseGetNativeTabsComponent',
    'mooncakeWarehouseGetQueuePreviewRecords', 'mooncakeWarehouseGetNativeInventoryOwner',
    'mooncakeWarehouseGetNativeItemRuntime', 'mooncakeWarehouseRenderNativeQueueItems',
    'mooncakeWarehouseDisposeQueueDock',
    'mooncakeWarehouseCreateQueuePreviewHeader', 'mooncakeWarehouseSyncQueueDock',
    'mooncakeWarehouseRemoveQueueDock', 'mooncakeWarehouseRestorePresentation'
].map(extractFunction).join('\n');
const nativeBundle = process.argv[2];
if (!nativeBundle) throw new Error('Pass the downloaded official main.*.chunk.js bundle path to test native Item behavior.');
const nativeFixture = await nativeItemFixture(nativeBundle);
const assets = new Map(await Promise.all(['react', 'react-dom'].map(async name => [
    `/${name}.js`, await readFile(new URL(`umd/${name}.development.js`, import.meta.resolve(name)), 'utf8')
])));

const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="UTF-8">
<title>库存滚动布局检查</title><style>
* { box-sizing: border-box; }
body { margin: 16px; background: #101219; color: #c6cce0; font: 16px system-ui; }
button { cursor: pointer; color: inherit; background: #303955; border: 1px solid #7282a0; border-radius: 4px; padding: 8px; }
header { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
#result { white-space: pre-wrap; font-size: 13px; }
#stage { width: 630px; height: 840px; border: 1px solid #586078; overflow: hidden; }
:root { --spacing-xs: 4px; --spacing-sm: 8px; --spacing-md: 12px; --item-size-normal: 90px; --color-midnight-700: #181923; }
.Inventory_inventory__17CH2 { width:100%; height:100%; display:flex; flex-direction:column; gap:var(--spacing-sm); }
.Inventory_inventory__17CH2 .Inventory_items__6SXv0 { flex-grow:1; min-height:0; overflow:auto; }
.TabsComponent_tabsComponent__3PqGp { width:100%; height:100%; display:flex; flex-direction:column; }
.TabsComponent_tabsComponent__3PqGp .TabsComponent_tabsContainer__3BDUp { flex-shrink:0; flex-grow:0; margin:0; border-bottom:2px solid #394157; overflow:auto; display:flex; }
.TabsComponent_tabsComponent__3PqGp .TabsComponent_tabPanelsContainer__26mzo { flex-grow:1; min-height:0; width:100%; overflow:auto; display:flex; flex-direction:column; }
.TabPanel_tabPanel__tXMJF { width:100%; height:100%; padding:var(--spacing-xs) 2px 2px; overflow:auto; }
.TabPanel_tabPanel__tXMJF.TabPanel_hidden__26UM3 { display:none; }
.Inventory_itemGrid__20YAH { margin:0 0 var(--spacing-md); display:grid; grid-template-columns:repeat(auto-fill,var(--item-size-normal)); grid-template-rows:max-content; gap:var(--spacing-xs); justify-content:center; }
.assets { height: 280px; padding: 12px; background: #202331; }
.assets article { border: 1px solid #4b5263; border-radius: 20px; padding: 24px; margin-top: 20px; }
.MuiTabs-flexContainer { display:flex; flex-wrap:wrap; gap:4px; }
.MuiTabs-flexContainer button { width:48px; height:48px; padding:0; flex-shrink:0; }
.Item_itemContainer__fixture { width:var(--item-size-normal); height:var(--item-size-normal); background:#2c3047; position:relative; border:0; }
.Item_item__fixture { height:100%; position:relative; cursor:pointer; border:1px solid transparent; }
.Item_selected__fixture { border-color:#9aaceb; }
.Item_iconContainer__fixture { font-size:36px; text-align:center; padding-top:20px; }
.Item_count__fixture { position:absolute; right:4px; bottom:4px; }
.Item_enhancementLevel__fixture { position:absolute; top:2px; left:4px; }
.Item_empty__fixture { opacity:.5; }
.Item_markBadges__fixture { position:absolute; left:4px; bottom:4px; }
.native-menu { position:fixed; top:80px; left:680px; padding:12px; width:300px; background:#222638; border:2px solid #657195; border-radius:5px; z-index:100; }
.native-menu button { display:block; width:100%; margin-top:6px; }
.native-menu .Item_itemInfo__fixture { position:relative; height:32px; padding-left:22px; }
.native-menu .Item_itemInfo__fixture .Item_count__fixture { position:static; }
.native-menu .Item_itemInfo__fixture .Item_enhancementLevel__fixture { position:static; }
.card-icon { font-size:32px; }
.card-quantity { position:absolute; bottom:3px; right:5px; }
</style><header>
<button id="run">运行布局检查</button><button id="scroll">滚动到库存</button>
<button id="top">回到顶部</button><button id="native">原生分类</button>
<button id="queue">长队列</button><button id="disable">关闭背包功能</button>
<button id="behavior">运行队列交互检查</button><button id="empty">筛选无结果</button>
<button id="upgrade">强化结果更新</button><button id="combat">切换战斗</button>
<button id="lock">锁定装备</button>
<button id="handoff">运行强化异步更新检查</button>
</header><pre id="result" role="status">等待检查</pre><div id="stage"></div>
<pre id="action" role="log">尚未操作物品</pre>
<script src="/react.js"></script><script src="/react-dom.js"></script>
<script>
${constants}
${functions}
const mooncakeWarehouseText = key => ({queue:'当前强化队列', emptyCustom:'暂无物品', categories:'分区管理'}[key] || key);
const getItemName = hrid => hrid;
const mooncakeWarehouseNormalizeLevel = value => Number(value) || 0;
const mooncakeWarehouseIdentityKey = (hrid, level) => hrid + ':' + (Number(level) || 0);
const mooncakeInventoryCharacterItems = value => [...value.values()].filter(item => item.itemLocationHrid === '/item_locations/inventory' && item.count > 0);
const mooncakeGetFiberKey = element => Object.keys(element).find(key => key.startsWith('__reactFiber$'));
let characterInventoryItems = new Map(), mooncakeWarehouseNativeItemRuntime = null;
const mooncakeWarehouseNativeQueueRoots = new Map(), mooncakeWarehouseNativeInventoryOwners = new Map();
const isZH = true;
const actionLog = [];
function recordAction(name, args) {
    actionLog.push({name, args});
    document.getElementById('action').textContent = JSON.stringify(actionLog.at(-1));
}
const mooncakeWarehouseOpenManager = () => recordAction('warehouse-manager', []);
${nativeFixture}
const requireGame = {c:{react:{exports:React}, renderer:{exports:ReactDOM}}, m:{}};
window.webpackJsonprpg_web = [];
window.webpackJsonprpg_web.push = function([chunks, modules]) {
    for (const [key, factory] of Object.entries(modules)) {
        requireGame.m[key] = factory;
        requireGame.c[key] = {exports:{}};
        factory(requireGame.c[key], requireGame.c[key].exports, requireGame);
    }
};
const mooncakeWarehouseDisconnectCurrentEquipmentObserver = () => {};
const mooncakeWarehouseClearCurrentEquipmentLease = () => {};
const mooncakeWarehouseResetInventoryEntries = () => {};
const mooncakeWarehouseRemoveNativeSectionTools = () => {};
let mooncakeWarehousePinnedNodes = new Set(), mooncakeWarehouseInventoryRoot = null;
let mooncakeWarehouseRootStyleSnapshot, mooncakeWarehousePanel, mooncakeWarehousePanelSignature;
let mooncakeWarehousePinnedLayoutSignature, mooncakeWarehouseLayoutSignature, mooncakeWarehouseLayoutMetrics, mooncakeWarehouseGeometryDirty;
const stage = document.getElementById('stage');
const result = document.getElementById('result');
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const current = () => document.querySelector('.Inventory_inventory__17CH2');
let owner, model, scheduled = false;
function syncQueue() { mooncakeWarehouseSyncQueueDock(stage.querySelector('.Inventory_items__6SXv0'), model); }
function mooncakeScheduleWarehouseRender() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; syncQueue(); }); }
}
function updateProps(next) {
    const previous = owner.props; owner.props = {...previous, ...next}; owner.componentDidUpdate(previous);
}
function mount(width = 630, height = 840, count = 13, emptyInventory = false) {
    mooncakeWarehouseRestorePresentation();
    stage.style.width = width + 'px'; stage.style.height = height + 'px';
    stage.innerHTML = '<div class="Inventory_inventory__17CH2"><div class="assets">物品排序 · 战斗着装评分 · 总资产<article><h2>今日盈亏：-1.19B</h2>近7天日均 · 最近记录</article></div><div class="Inventory_items__6SXv0"><div class="TabsComponent_tabsComponent__3PqGp"><div class="TabsComponent_tabsContainer__3BDUp"><div class="MuiTabs-root"><div class="MuiTabs-scroller"><div class="MuiTabs-flexContainer"></div></div></div></div><div class="TabsComponent_tabPanelsContainer__26mzo"><div class="TabPanel_tabPanel__tXMJF"><div class="Inventory_itemGrid__20YAH"></div></div><div class="TabPanel_tabPanel__tXMJF TabPanel_hidden__26UM3" id="category-panel"><div class="Inventory_itemGrid__20YAH"></div></div></div></div></div></div>';
    const list = stage.querySelector('.MuiTabs-flexContainer');
    for (let i = 0; i < 16; i++) {
        const button = document.createElement('button');
        button.textContent = ['▦','♥','●','▣','▤','▥','⚒','◆'][i % 8];
        button.setAttribute('aria-label', '分类' + i);
        button.onclick = () => switchCategory(i !== 0);
        list.appendChild(button);
    }
    for (const grid of stage.querySelectorAll('.Inventory_itemGrid__20YAH')) {
        for (let i = 1; i <= (emptyInventory ? 0 : 84); i++) {
            const card = document.createElement('button');
            card.className = 'Item_itemContainer__fixture';
            card.innerHTML = '<span class="card-icon">' + ['⚒','◆','▣','✦'][i % 4] + '</span><span class="card-quantity">' + i + '</span>';
            card.onclick = () => { result.textContent = '点击物品 ' + i; };
            grid.appendChild(card);
        }
    }
    const root = stage.querySelector('.Inventory_items__6SXv0');
    mooncakeWarehouseSyncInventoryScroll(root);
    const records = Array.from({length:count}, (_, i) => ({itemHrid:'/items/' + (i < 4 ? 'equipment_' : 'material_') + i,
        enhancementLevel:i < 4 ? 3 : 0, group:i < 4 ? 'equipment' : 'material', actionKey:'action_' + i}));
    characterInventoryItems = new Map(records.map((record, i) => {
        const item = {id:i + 1, hash:record.itemHrid + ':' + record.enhancementLevel, itemHrid:record.itemHrid,
            enhancementLevel:record.enhancementLevel, count:i < 4 ? 1 : 100, itemLocationHrid:'/item_locations/inventory'};
        return [item.hash, item];
    }));
    owner = new FixtureInventory(characterInventoryItems);
    current().__reactFiber$fixture = {return:{stateNode:owner}};
    model = {queueSection:{title:'当前强化队列', actionCount:count ? 4 : 0,
        sourceQueue:{equipment:records.filter(record => record.group === 'equipment'), protection:[], materials:records.filter(record => record.group === 'material')}}};
    syncQueue();
}
function switchCategory(category) {
    const panels = [...stage.querySelectorAll('.TabPanel_tabPanel__tXMJF')];
    panels[0].classList.toggle('TabPanel_hidden__26UM3', category);
    panels[1].classList.toggle('TabPanel_hidden__26UM3', !category);
    mooncakeWarehouseSyncInventoryScroll(stage.querySelector('.Inventory_items__6SXv0'));
    syncQueue();
}
function scrollToInventory() {
    const inventory = current();
    const tabs = stage.querySelector('.TabsComponent_tabsContainer__3BDUp');
    inventory.scrollTop += tabs.getBoundingClientRect().top - inventory.getBoundingClientRect().top;
}
document.getElementById('scroll').onclick = scrollToInventory;
document.getElementById('top').onclick = () => current().scrollTop = 0;
document.getElementById('native').onclick = () => switchCategory(true);
document.getElementById('queue').onclick = () => mount(630, 620, 36);
document.getElementById('disable').onclick = () => mooncakeWarehouseRestorePresentation();
document.getElementById('empty').onclick = () => {
    stage.querySelectorAll('.Inventory_itemGrid__20YAH').forEach(grid => grid.replaceChildren()); syncQueue();
};
function upgrade() {
    const equipment = model.queueSection.sourceQueue.equipment[0];
    const previousKey = equipment.itemHrid + ':' + equipment.enhancementLevel;
    equipment.enhancementLevel++;
    const item = {...owner.props.characterItemMap.get(previousKey), enhancementLevel:equipment.enhancementLevel,
        hash:equipment.itemHrid + ':' + equipment.enhancementLevel};
    const items = new Map(owner.props.characterItemMap); items.delete(previousKey); items.set(item.hash, item);
    updateProps({characterItemMap:items});
}
document.getElementById('upgrade').onclick = upgrade;
document.getElementById('combat').onclick = () => updateProps({isInCombat:!owner.props.isInCombat});
document.getElementById('lock').onclick = () => updateProps({characterItemMarkDict:{'/items/equipment_0':{lock:[model.queueSection.sourceQueue.equipment[0].enhancementLevel]}}});
document.getElementById('run').onclick = async () => {
    try {
        const checks = [];
        for (const [width, height, count] of [[630,840,13],[630,620,36],[360,480,13],[360,480,36],[630,620,0]]) {
            mount(width,height,count); await frame();
            const inventory = current();
            const items = stage.querySelector('.Inventory_items__6SXv0');
            const panel = stage.querySelector('.TabPanel_tabPanel__tXMJF');
            const dock = stage.querySelector('[data-mooncake-warehouse-queue-dock]');
            assert(getComputedStyle(inventory).overflowY === 'auto', '缺少统一滚动容器');
            assert(inventory.scrollHeight > inventory.clientHeight, '库存内容无法向下滚动');
            assert(getComputedStyle(items).overflowY === 'visible' && getComputedStyle(panel).overflowY === 'visible', '库存仍有嵌套小滚动区');
            assert(panel.scrollHeight <= panel.clientHeight + 1, '原生库存仍被限制高度');
            const nativeGrid = panel.querySelector('.Inventory_itemGrid__20YAH');
            const nativeCards = [...nativeGrid.children];
            // Favorites/deduplication may return column two before column one.
            const entries = [nativeCards[1], nativeCards[0], ...nativeCards.slice(2)].map(node => ({node,grid:nativeGrid}));
            const metrics = mooncakeWarehouseGetLayoutMetrics(panel,entries);
            const firstRect = nativeCards[0].getBoundingClientRect();
            const nativeColumns = nativeCards.filter(card => Math.abs(card.getBoundingClientRect().top - firstRect.top) < 1).length;
            assert(metrics.columns === nativeColumns, '分区未使用全部可用列');
            assert(Math.abs(metrics.baseLeft - (firstRect.left - panel.getBoundingClientRect().left)) < 1, '分区左侧多出空列');
            if (count) {
                assert(dock.getBoundingClientRect().bottom <= items.querySelector('.TabsComponent_tabsComponent__3PqGp').getBoundingClientRect().top + 1, '队列和分类栏重叠');
                assert(dock.querySelectorAll('[data-mooncake-warehouse-queue-preview-item]').length === count, '长队列物品被截断');
                assert(Math.abs(dock.querySelector('[data-mooncake-warehouse-queue-preview-item]').getBoundingClientRect().left - firstRect.left) < 1, '分区与队列的左右边距未对齐');
            }
            scrollToInventory(); await frame();
            const inventoryRect = inventory.getBoundingClientRect();
            const tabsRect = stage.querySelector('.TabsComponent_tabsContainer__3BDUp').getBoundingClientRect();
            assert(Math.abs(tabsRect.top - inventoryRect.top) < 2, '分类栏未停留在顶部');
            assert(inventoryRect.bottom - tabsRect.bottom >= height * .5, '下方库存可用高度不足一半');
            assert(stage.querySelector('.assets').getBoundingClientRect().bottom < inventoryRect.top + 1, '资产仍占据可视空间');
            if (dock) assert(dock.getBoundingClientRect().bottom <= inventoryRect.top + 1, '队列没有随页面滚走');
            assert(inventory.scrollWidth <= inventory.clientWidth + 1, '窄屏出现横向溢出');
            inventory.scrollTop = inventory.scrollHeight; await frame();
            const last = panel.querySelector('.Inventory_itemGrid__20YAH').lastElementChild.getBoundingClientRect();
            assert(last.bottom <= inventoryRect.bottom + 1 && last.top > inventoryRect.top, '末尾物品无法完整显示');
            switchCategory(true); await frame();
            assert(stage.querySelectorAll('[data-mooncake-warehouse-queue-preview-item]').length === count, '原生分类导致队列消失');
            assert(getComputedStyle(panel).display === 'none', '隐藏页签意外展开');
            assert(inventory.hasAttribute(MOONCAKE_WAREHOUSE_SCROLL_ROOT_ATTR), '切换分类恢复了嵌套滚动');
            mooncakeWarehouseRestorePresentation();
            assert(!inventory.hasAttribute(MOONCAKE_WAREHOUSE_SCROLL_ROOT_ATTR), '关闭功能没有清理布局');
            checks.push(width + '×' + height + ' / 队列' + count + '：通过');
        }
        mount(); await frame(); scrollToInventory();
        result.textContent = 'PASS\n' + checks.join('\n');
    } catch (error) { result.textContent = 'FAIL: ' + error.message; console.error(error); }
};
document.getElementById('behavior').onclick = async () => {
    try {
        mount(630,840,13,true); await frame();
        const cards = () => [...stage.querySelectorAll('[data-mooncake-warehouse-queue-preview-item] .Item_item__fixture')];
        assert(cards().length === 13, '没有任何库存 DOM 时队列不完整');
        const first = cards()[0];
        const click = options => first.dispatchEvent(new MouseEvent(options?.type || 'click', {bubbles:true, cancelable:true, ...options}));
        click(); await frame();
        assert(document.querySelector('[role=dialog]')?.textContent.includes('最爱 / 锁定'), '未打开原生菜单');
        switchCategory(true); upgrade(); await frame();
        assert(cards()[0] === first, '切换分类/强化结果重建了图标');
        assert(document.querySelector('[role=dialog]')?.textContent.includes('+4'), '已打开的菜单未保留或未更新等级');
        click({type:'contextmenu', button:2});
        assert(actionLog.at(-1)?.name === 'equipItemHandler' && actionLog.at(-1).args[1] === '/items/equipment_0:4', '右键未使用最新物品 hash');
        const count = actionLog.length;
        updateProps({isInCombat:true}); await frame(); click({type:'contextmenu', button:2});
        assert(actionLog.length === count, '战斗限制失效');
        updateProps({isInCombat:false, characterSkillMap:new Map([['allowed',false]])}); await frame();
        click({type:'contextmenu', button:2}); assert(actionLog.length === count, '装备等级限制失效');
        updateProps({characterSkillMap:new Map(), characterItemMarkDict:{'/items/equipment_0':{lock:[4],favorite:[4]}}}); await frame();
        const sell = [...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent === '卖出');
        assert(sell?.disabled && first.textContent.includes('🔒'), '锁定限制/标识未更新');
        click({shiftKey:true}); assert(actionLog.at(-1)?.name === 'goToMarketplaceHandler', 'Shift 点击失效');
        click({ctrlKey:true}); assert(actionLog.at(-1)?.name === 'itemLinkHandler', 'Ctrl 点击失效');
        const items = new Map(owner.props.characterItemMap); items.delete('/items/equipment_0:4');
        updateProps({characterItemMap:items}); await frame();
        const before = actionLog.length; click({type:'contextmenu', button:2});
        assert(actionLog.length === before && first.textContent.includes('0'), '缺货时仍可装备');
        assert(first === cards()[0], '缺货时重建了图标');
        mooncakeWarehouseRestorePresentation();
        assert(!document.querySelector('[role=dialog]') && mooncakeWarehouseNativeQueueRoots.size === 0 && mooncakeWarehouseNativeInventoryOwners.size === 0, '菜单/生命周期钩子未清理');
        mount(); await frame();
        result.textContent = 'PASS：无库存 DOM、分类切换、菜单保留、强化更新、右键最新 hash、战斗/等级/锁定限制、快捷键、缺货保护和卸载清理';
    } catch (error) { result.textContent = 'FAIL: ' + error.message; console.error(error); }
};
document.getElementById('handoff').onclick = async () => {
    try {
        mount(630,840,13,true); await frame();
        const record = model.queueSection.sourceQueue.equipment[0];
        const card = stage.querySelector('[data-mooncake-warehouse-queue-preview-item] .Item_item__fixture');
        const icon = card.querySelector('[role="img"]');
        const secondStack = {id:99,itemHrid:record.itemHrid,enhancementLevel:12,count:2,
            hash:record.itemHrid + ':12',itemLocationHrid:'/item_locations/inventory'};
        const initialItems = new Map(owner.props.characterItemMap); initialItems.set(secondStack.hash,secondStack);
        updateProps({characterItemMap:initialItems}); await frame();
        const checks = [];
        for (const level of [4,0,1,7,6,0]) {
            const previousHash = record.itemHrid + ':' + record.enhancementLevel;
            const nextHash = record.itemHrid + ':' + level;
            const nextItem = {...owner.props.characterItemMap.get(previousHash),enhancementLevel:level,hash:nextHash};
            const nextItems = new Map(owner.props.characterItemMap);nextItems.delete(previousHash);nextItems.set(nextHash,nextItem);
            // The WebSocket result updates Mooncake before React has supplied
            // the Inventory owner with the replacement stack. Raw packets do
            // not necessarily include the game's derived item.hash property.
            characterInventoryItems = new Map([...nextItems].map(([key,item])=>{
                const raw={...item};delete raw.hash;return [key,raw];
            }));
            record.enhancementLevel=level;record.itemHash=nextHash;record.allowLevelReconcile=true;
            syncQueue();await frame();
            assert(card.isConnected&&card.querySelector('[role="img"]')===icon,'结果到达时重建了当前装备图标');
            assert(!card.classList.contains('Item_empty__fixture')&&getComputedStyle(card).opacity==='1',
                '结果已到达、原生背包仍是旧数据时，图标被按缺货变暗');
            assert(card.querySelector('.Item_count__fixture')?.textContent==='1','强化更新中数量闪成 0');
            assert((card.querySelector('.Item_enhancementLevel__fixture')?.textContent||'')===(level?'+'+level:''),'未显示已确认的新等级');
            card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));
            assert(actionLog.at(-1)?.args[1]===nextHash,'结果更新时右键使用了旧等级');
            updateProps({characterItemMap:nextItems});await frame();
            delete record.allowLevelReconcile;syncQueue();await frame();
            assert(card.isConnected&&card.querySelector('[role="img"]')===icon&&!card.classList.contains('Item_empty__fixture'),
                '原生背包跟进后图标再次重建或变暗');
            checks.push('+'+level+'：两阶段更新期间图标、数量、点击均正常');
        }
        result.textContent='PASS '+checks.length+' 项\n'+checks.join('\n');
    } catch(error) {result.textContent='FAIL: '+error.message;console.error(error);}
};
mooncakeWarehouseEnsureStyles(); mount();
</script></html>`;

const server = createServer((request, response) => {
    if (assets.has(request.url)) { response.writeHead(200, {'content-type':'text/javascript; charset=utf-8'}).end(assets.get(request.url)); return; }
    if (request.url !== '/') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
});
server.listen(0, '127.0.0.1', () => console.log(`Warehouse scroll checks: http://127.0.0.1:${server.address().port}/`));
