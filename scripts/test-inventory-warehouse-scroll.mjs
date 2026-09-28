import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

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
    'mooncakeWarehouseSyncInventoryScroll', 'mooncakeWarehouseGetNativeTabsComponent',
    'mooncakeWarehouseGetQueuePreviewRecords', 'mooncakeWarehouseCloneQueuePreviewItem',
    'mooncakeWarehouseCreateQueuePreviewHeader', 'mooncakeWarehouseSyncQueueDock',
    'mooncakeWarehouseRemoveQueueDock', 'mooncakeWarehouseRestorePresentation'
].map(extractFunction).join('\n');

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
.card-icon { font-size:32px; }
.card-quantity { position:absolute; bottom:3px; right:5px; }
</style><header>
<button id="run">运行布局检查</button><button id="scroll">滚动到库存</button>
<button id="top">回到顶部</button><button id="native">原生分类</button>
<button id="queue">长队列</button><button id="disable">关闭背包功能</button>
</header><div id="stage"></div><pre id="result" role="status">等待检查</pre>
<script>
${constants}
${functions}
const mooncakeWarehouseText = key => ({queue:'当前强化队列', emptyCustom:'暂无物品'}[key] || key);
const getItemName = hrid => hrid;
const mooncakeWarehouseNormalizeLevel = value => Number(value) || 0;
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
function mount(width = 630, height = 840, count = 13) {
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
        for (let i = 1; i <= 84; i++) {
            const card = document.createElement('button');
            card.className = 'Item_itemContainer__fixture';
            card.innerHTML = '<span class="card-icon">' + ['⚒','◆','▣','✦'][i % 4] + '</span><span class="card-quantity">' + i + '</span>';
            card.onclick = () => { result.textContent = '点击物品 ' + i; };
            grid.appendChild(card);
        }
    }
    const root = stage.querySelector('.Inventory_items__6SXv0');
    mooncakeWarehouseSyncInventoryScroll(root);
    const cards = [...stage.querySelector('.Inventory_itemGrid__20YAH').children];
    const records = cards.slice(0, count).map((node, i) => ({node, key:String(i), itemHrid:'魔术师帽（精）', enhancementLevel:3, group:i < 4 ? 'equipment' : 'material'}));
    mooncakeWarehouseSyncQueueDock(root, {queueSection:{title:'当前强化队列', actionCount:count ? 4 : 0, records}}, {itemWidth:90, itemHeight:90, rowGap:4, columnGap:4, baseLeft:0});
}
function switchCategory(category) {
    mooncakeWarehouseRemoveQueueDock();
    const panels = [...stage.querySelectorAll('.TabPanel_tabPanel__tXMJF')];
    panels[0].classList.toggle('TabPanel_hidden__26UM3', category);
    panels[1].classList.toggle('TabPanel_hidden__26UM3', !category);
    mooncakeWarehouseSyncInventoryScroll(stage.querySelector('.Inventory_items__6SXv0'));
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
            if (count) {
                assert(dock.getBoundingClientRect().bottom <= items.querySelector('.TabsComponent_tabsComponent__3PqGp').getBoundingClientRect().top + 1, '队列和分类栏重叠');
                assert(dock.querySelectorAll('[data-mooncake-warehouse-queue-preview-item]').length === count, '长队列物品被截断');
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
mooncakeWarehouseEnsureStyles(); mount();
</script></html>`;

const server = createServer((request, response) => {
    if (request.url !== '/') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
});
server.listen(0, '127.0.0.1', () => console.log(`Warehouse scroll checks: http://127.0.0.1:${server.address().port}/`));
