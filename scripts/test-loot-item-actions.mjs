import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { nativeItemFixture } from './fixtures/native-queue-item.mjs';

// Exercise the real game Item and Inventory factory with local action spies.
// No game connection, account action or history mutation is needed.
const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
const names = ['mooncakeGetLootNativeItem', 'mooncakeGetLootItemActionProps',
    'mooncakeGuardLootItemActions', 'mooncakeCloseLootItemMenu',
    'mooncakeOpenLootItemMenu', 'hookMooncakeLootItemClicks',
    'mooncakeWarehouseGetNativeInventoryOwner', 'mooncakeWarehouseGetNativeItemRuntime'];
const functions = names.map(name => {
    const start = source.indexOf(`    function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n    function ', start + 1));
}).join('\n');
if (!process.argv[2]) throw new Error('Pass the downloaded official main.*.chunk.js bundle path.');
const fixture = await nativeItemFixture(process.argv[2]);
const assets = new Map(await Promise.all(['react', 'react-dom'].map(async name => [
    `/${name}.js`, await readFile(new URL(`umd/${name}.development.js`, import.meta.resolve(name)), 'utf8')
])));
const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>掉落记录原生物品交互检查</title><style>
body { background:#181923; color:#d4d8e8; font:16px system-ui; margin:24px; }
button { background:#424f9e; color:inherit; border:1px solid #7c89a7; border-radius:4px; padding:8px 12px; cursor:pointer; }
button:disabled { opacity:.45; cursor:default; }
header { display:flex; gap:12px; margin-bottom:24px; }
.LootLogPanel_actionLoot__32gl_ { padding:16px; background:#202230; }
.LootLogPanel_itemDrops__2h0ov { display:flex; gap:6px; margin:16px 0; }
.Item_itemContainer__fixture { width:90px; height:90px; background:#2c3047; border-radius:5px; position:relative; }
.Item_item__fixture { height:100%; position:relative; }
.Item_iconContainer__fixture { font-size:36px; text-align:center; padding-top:20px; }
.Item_count__fixture { position:absolute; right:4px; bottom:4px; }
.Item_enhancementLevel__fixture { position:absolute; top:2px; left:4px; }
.native-menu { position:fixed; top:235px; left:24px; padding:14px; width:300px; background:#15161e; border:2px solid #657195; border-radius:6px; z-index:100; pointer-events:auto; }
.native-menu button { display:block; width:100%; margin-top:6px; }
.native-menu .Item_count__fixture, .native-menu .Item_enhancementLevel__fixture { position:static; }
#result,#action { white-space:pre-wrap; font-size:14px; }
</style><header><button id="run">运行交互检查</button><button id="reset">重置示例</button></header>
<div id="stage"></div><pre role="status" id="result">等待检查</pre><pre role="log" id="action">尚未操作物品</pre>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
const LOOT_LOG_ITEM_SELECTOR = '.LootLogPanel_actionLoot__32gl_';
let mooncakeLootItemMenu = null, mooncakeLootItemClicksBound = false, mooncakeWarehouseNativeItemRuntime = null;
const mooncakeGetFiberKey = node => Object.keys(node).find(key => key.startsWith('__reactFiber$'));
const mooncakeInventoryCharacterItems = map => [...map.values()].filter(item => item.itemLocationHrid === '/item_locations/inventory' && item.count > 0);
const mooncakeIsExternalProfitPanelNode = node => !!node.closest('.profit-pannel, .income-panel');
const actions = [];
function recordAction(name,args) { actions.push({name,args}); document.getElementById('action').textContent = JSON.stringify(actions.at(-1)); }
${fixture}
const originalDetail = F.getDetailByHrid;
F.getDetailByHrid = hrid => ({...originalDetail(hrid), isTradable:!hrid.includes('chest'), isOpenable:hrid.includes('chest')});
const mooncakeCanOpenMarketplaceForInventoryItem = hrid => F.getDetailByHrid(hrid).isTradable;
const mooncakeOpenMarketplaceForHrid = async (hrid,level) => { recordAction('market',[hrid,level]); return true; };
const mooncakeFindGameStateNode = () => ({handleGoToMarketplace:(...args) => recordAction('fallback-market',args),
    handleOpenItemDictionary:(...args) => recordAction('dictionary',args)});
const requireGame = {c:{react:{exports:React},renderer:{exports:ReactDOM}},m:{}};
window.webpackJsonprpg_web = [];
window.webpackJsonprpg_web.push = function([chunks,modules]) {
    for (const [key,factory] of Object.entries(modules)) {
        requireGame.m[key]=factory; requireGame.c[key]={exports:{}};
        factory(requireGame.c[key],requireGame.c[key].exports,requireGame);
    }
};
${functions}
let owner, rowSelections = 0;
const stock = (hrid,level,count) => ({itemHrid:hrid,enhancementLevel:level,count,
    hash:hrid+':'+level,itemLocationHrid:'/item_locations/inventory'});
let drops = [stock('/items/equipment_boots',1,356),stock('/items/equipment_boots',7,8),
    stock('/items/essence',0,219),stock('/items/chest',0,1)];
function renderDrops() {
    ReactDOM.render(React.createElement('section',{className:'LootLogPanel_lootLogPanel__2013X'},
        React.createElement('div',{className:'LootLogPanel_actionLoot__32gl_'},
            React.createElement('div',{className:'record-title'},'强化 - 寻路者靴 (731)　[失败]'),
            React.createElement('div',null,'持续时间：55m 45s'),
            React.createElement('div',{className:'LootLogPanel_itemDrops__2h0ov'},drops.map((item,i) =>
                React.createElement(wr,{key:i,itemHrid:item.itemHrid,enhancementLevel:item.enhancementLevel,count:item.count}))))),
        document.getElementById('history'));
}
function reset() {
    mooncakeCloseLootItemMenu();
    const history=document.getElementById('history'); if(history) ReactDOM.unmountComponentAtNode(history);
    document.getElementById('stage').innerHTML='<div class="Inventory_inventory__fixture" style="display:none"></div><div id="history"></div>';
    drops[0]=stock('/items/equipment_boots',1,356);
    const inventory=[stock('/items/equipment_boots',1,2),stock('/items/equipment_boots',3,1),stock('/items/essence',0,43),stock('/items/chest',0,3)];
    owner=new FixtureInventory(new Map(inventory.map(item => [item.hash,item])));
    owner.props.openLootHandler=(...args)=>recordAction('openLootHandler',args);
    document.querySelector('.Inventory_inventory__fixture').__reactFiber$fixture={return:{stateNode:owner}};
    renderDrops(); actions.length=0; rowSelections=0;
    document.querySelector(LOOT_LOG_ITEM_SELECTOR).addEventListener('click',event=>{
        if(!event.target.closest('button, [class*="Item_itemContainer"]')) rowSelections++;
    });
}
hookMooncakeLootItemClicks(); hookMooncakeLootItemClicks(); reset();
const cards=()=>[...document.querySelectorAll('#history [class*="Item_itemContainer"]')];
const click=(node,options={})=>node.dispatchEvent(new MouseEvent(options.right?'contextmenu':'click',{
    bubbles:true,cancelable:true,button:options.right?2:0,...options}));
const button=text=>[...document.querySelectorAll('.native-menu button')].find(node=>node.textContent===text);
const assert=(condition,message)=>{if(!condition) throw new Error(message)};
const waitMenu=()=>new Promise(resolve=>setTimeout(resolve,300));
const last=()=>actions.at(-1);
async function run() {
    reset();
    const original=cards()[0];
    click(original.querySelector('[role="img"]'));
    assert(document.querySelector('.native-menu'),'left click opens native menu');
    assert(mooncakeLootItemMenu.instance.props.count===2,'menu uses stock of 2, not historical 356');
    assert(button('装备')&&button('强化')&&button('前往市场'),'native inventory actions present');
    click(button('全部'));
    assert(document.querySelector('.native-menu input').value==='2','all uses actual stock');
    assert(rowSelections===0,'item click must not select the merge row');
    assert(cards()[0]===original&&original.textContent.includes('356'),'history card and count preserved');
    click(original); assert(!mooncakeLootItemMenu,'second left click closes the menu');
    click(original); click(button('全部'));
    const hash='/items/equipment_boots:1';
    owner.props.characterItemMap.set(hash,stock('/items/equipment_boots',1,1));
    click(button('卖出')); click(button('确认卖出'));
    assert(!actions.length,'stale quantity cannot be sold after inventory shrinks');
    mooncakeCloseLootItemMenu();
    click(cards()[0]); click(button('装备'));
    assert(last().name==='equipItemHandler'&&last().args[1]===hash,'equip uses the exact current inventory hash');
    mooncakeCloseLootItemMenu();
    click(cards()[0]); owner.props.isInCombat=true; click(button('装备'));
    assert(actions.length===1,'combat change is checked at activation time');
    mooncakeCloseLootItemMenu(); owner.props.isInCombat=false;
    click(cards()[0]); click(button('卖出')); owner.props.characterItemMarkDict['/items/equipment_boots']={lock:[1]};
    click(button('确认卖出')); assert(actions.length===1,'new lock blocks an already open sell confirmation');
    mooncakeCloseLootItemMenu(); owner.props.characterItemMarkDict={};
    click(cards()[0]); owner.props.characterItemMap.delete(hash); await waitMenu();
    assert(mooncakeLootItemMenu.instance.props.count===0&&!button('强化')&&!button('装备'),'depleted stock removes inventory actions');
    mooncakeCloseLootItemMenu();
    click(cards()[1]);
    assert(mooncakeLootItemMenu.instance.props.count===0&&!button('装备'),'do not substitute another enhancement level');
    click(button('前往市场'));
    assert(last().name==='goToMarketplaceHandler'&&last().args[1]===7,'left menu opens historical enhancement level');
    mooncakeCloseLootItemMenu();
    const before=actions.length; click(cards()[1],{right:true});
    assert(actions.length===before+1&&last().name==='market'&&last().args[1]===7,'right click jumps once to correct market level');
    click(cards()[2],{right:true}); assert(last().args[0]==='/items/essence','materials support right click');
    click(cards()[3],{right:true}); assert(last().name==='openLootHandler'&&last().args[1]===1,'nonmarket chest retains native right-click open-one behavior');
    click(cards()[2],{ctrlKey:true}); assert(last().name==='itemLinkHandler','control-click retains native chat-link action');
    click(cards()[2],{shiftKey:true}); assert(last().name==='goToMarketplaceHandler','shift-click retains native market action');
    click(cards()[2]); drops[2]=stock('/items/other_essence',0,5); renderDrops(); await waitMenu();
    assert(!mooncakeLootItemMenu,'reused history row closes old item menu');
    drops[2]=stock('/items/essence',0,219); renderDrops();
    click(cards()[2]); document.getElementById('history').style.display='none'; await waitMenu();
    assert(!mooncakeLootItemMenu,'hidden history closes its menu');
    document.getElementById('history').style.display='';
    click(cards()[2]); document.getElementById('history').remove(); await waitMenu();
    assert(!mooncakeLootItemMenu&&!document.querySelector('.native-menu')&&!document.querySelector('[data-mooncake-loot-item-anchor]'),'unmounted history cleans up menu, portal and timer');
    reset(); document.querySelector('.Inventory_inventory__fixture').remove();
    click(cards()[0]); assert(button('前往市场')&&button('打开物品词典')&&!button('装备'),'no mounted inventory still permits inspection');
    click(button('打开物品词典')); assert(last().name==='dictionary','fallback dictionary handler works');
    mooncakeCloseLootItemMenu(); reset();
    click(document.querySelector('.record-title')); assert(rowSelections===1,'row merge click is preserved outside icons');
    document.getElementById('result').textContent='PASS：原生左键菜单、右键市场、历史等级、实时库存数量、战斗/锁定/缺货校验、快捷键、记录复用和卸载清理；原始图标及记录未改动。';
}
document.getElementById('run').onclick=()=>run().catch(error=>{document.getElementById('result').textContent='FAIL: '+error.stack;console.error(error)});
document.getElementById('reset').onclick=reset;
</script></html>`;
const server = createServer((request, response) => {
    response.setHeader('Content-Type', assets.has(request.url) ? 'application/javascript' : 'text/html; charset=utf-8');
    response.end(assets.get(request.url) || html);
});
server.listen(0, '127.0.0.1', () => console.log(`Loot item action fixture: http://127.0.0.1:${server.address().port}`));
