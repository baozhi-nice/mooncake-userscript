import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { nativeItemFixture } from './fixtures/native-queue-item.mjs';

// Exercise the production projection/styles with native Item components and the
// position:relative write performed by MWITools when a new item enters the grid.
// --baseline=HEAD runs the same regression against the published implementation.
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.split('=')[1];
const source = baseline
    ? execFileSync('git', ['show', `${baseline}:src/mooncake.js`], { encoding: 'utf8', maxBuffer: 8e6 })
    : await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
const bundle = process.argv[2];
if (!bundle || bundle.startsWith('--')) throw new Error('Pass an official main.*.chunk.js bundle path.');
const fixture = await nativeItemFixture(bundle);
const extract = name => {
    const start = source.indexOf(`    function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n    function ', start + 1));
};
const functions = [
    'mooncakeWarehouseBuildProjection', 'mooncakeWarehouseBuildPresentationModel',
    'mooncakeWarehouseGetUnavailableSectionCount', 'mooncakeWarehouseCompareSort',
    'mooncakeWarehouseApplyPinnedNodes', 'mooncakeWarehouseRestorePinnedNode',
    'mooncakeWarehouseSnapshotInlineStyles', 'mooncakeWarehouseRestoreInlineStyles',
    'mooncakeWarehouseSetInlineStyle', 'mooncakeWarehouseRestoreOwnedInlineStyle',
    'mooncakeWarehouseEnsureStyles', 'mooncakeWarehouseClearLegacyQueueLayout',
    'mooncakeWarehouseGetQueuePreviewRecords'
].map(extract).join('\n');
const constants = [...source.matchAll(/^    const MOONCAKE_WAREHOUSE_\w+_ATTR = '[^']+';/gm)]
    .map(match => match[0]).join('\n');
const assets = new Map(await Promise.all(['react', 'react-dom'].map(async name => [
    `/${name}.js`, await readFile(new URL(`umd/${name}.development.js`, import.meta.resolve(name)), 'utf8')
])));
const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="UTF-8">
<title>强化结果刷新时的库存图标检查</title><style>
*{box-sizing:border-box}body{background:#181923;color:#dce4ff;font:16px system-ui;margin:20px}
button{background:#3c4c80;color:white;padding:10px;border:1px solid #9da9cb;border-radius:5px;cursor:pointer}
#stage{width:580px;position:relative}#custom{height:110px}.Inventory_itemGrid__fixture{display:grid;grid-template-columns:repeat(6,90px);gap:4px;justify-content:start}
.Item_itemContainer__fixture{width:fit-content;height:fit-content}.Item_item__fixture{width:90px;height:90px;border-radius:5px;background:#303149;display:grid;grid-template-columns:90px;grid-template-rows:90px}
.Item_item__fixture>*{grid-area:1/1}.Item_iconContainer__fixture{font-size:42px;margin:auto}.Item_count__fixture{align-self:end;justify-self:end}.Item_enhancementLevel__fixture{color:#c0a0ff}.Item_clickable__fixture{cursor:pointer}
.native-menu{position:fixed;top:20px;left:640px;padding:20px;background:#303149}.native-menu button{display:block;margin:5px}
#result{white-space:pre-wrap}#log{font-size:13px;color:#9fc7e4}
</style><button id="run">连续强化与库存排序检查</button><pre id="result" role="status">等待检查</pre>
<div id="stage"><div id="custom">自定义分区</div><p>装备</p><div class="Inventory_itemGrid__fixture" id="grid"></div></div><pre id="log" role="log"></pre>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
${constants}
const MOONCAKE_WAREHOUSE_SECTION_QUEUE='system:current-queue', MOONCAKE_WAREHOUSE_SECTION_ENHANCE='system:enhance',
    MOONCAKE_WAREHOUSE_SECTION_MATERIALS='system:enhance-materials', MOONCAKE_WAREHOUSE_SECTION_UNCLASSIFIED='system:unclassified';
const MOONCAKE_WAREHOUSE_STYLE_PROPS=['position','left','top','width','height','margin','z-index','display','opacity','pointer-events','transform','transition','visibility'];
let mooncakeWarehousePinnedNodes=new Set();
const mooncakeWarehouseNodeStyleSnapshots=new WeakMap(), mooncakeWarehouseOwnedInlineStyles=new WeakMap();
const mooncakeWarehouseClearCurrentEquipmentLease=()=>{}, mooncakeWarehouseObserveCurrentEquipment=()=>{};
const mooncakeWarehouseGetPinnedLayoutSignature=()=>'', mooncakeWarehouseGetSectionIcon=()=>'', mooncakeWarehouseGetCustomSectionOrdinal=()=>1;
const mooncakeWarehouseText=key=>key, mooncakeWarehouseUnavailableText=count=>String(count), getItemName=hrid=>hrid;
const mooncakeWarehouseNormalizeLevel=value=>Number(value)||0;
const mooncakeWarehouseIdentityKey=(hrid,level)=>hrid+'\u0001'+(Number(level)||0);
const mooncakeInventoryCharacterItems=items=>[...items.values()].filter(item=>item.count>0);
const state={categories:[{id:'custom',name:'自定义分区'}],sectionOrder:['custom'],hiddenSections:{'system:enhance-materials':true},activeSectionId:'custom'};
const mooncakeWarehouseEnsureState=()=>state;
let membership=false, queue, characterInventoryItems=new Map();
const mooncakeWarehouseGetManualMembership=hrid=>membership&&hrid==='/items/equipment_active'?{categoryId:'custom',createdAt:1}:null;
const mooncakeWarehouseBuildMaterialRelations=()=>new Map();
const mooncakeWarehouseBuildQueueRecords=()=>queue;
const actions=[];
const recordAction=(name,args)=>{actions.push({name,args});document.getElementById('log').textContent=JSON.stringify(actions.at(-1));};
${fixture}
${functions}
mooncakeWarehouseEnsureStyles();
const grid=document.getElementById('grid'), root=document.getElementById('stage'), result=document.getElementById('result');
const owner=new FixtureInventory(characterInventoryItems), frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const metrics={itemWidth:90,itemHeight:90,columns:6,columnStep:94,rowGap:4,baseLeft:0,signature:'fixture'};
let entries=[], lastProjection, lastModel;
const check=(value,message)=>{if(!value)throw new Error(message)};
function renderNative(level) {
    const items=['equipment_neighbor','equipment_active','equipment_shield','equipment_bow','equipment_rod','cloth'].map((name,index)=>({
        id:index+1,itemHrid:'/items/'+name,enhancementLevel:index===1?level:0,count:1,
        hash:'/items/'+name+':'+(index===1?level:0),itemLocationHrid:'/item_locations/inventory'
    }));
    characterInventoryItems=new Map(items.map(item=>[item.hash,item])); owner.props={...owner.props,characterItemMap:characterInventoryItems};
    ReactDOM.render(items.map(item=>owner.renderItem(item.hash,item)),grid);
    entries=items.map((item,index)=>({...item,node:grid.children[index]}));
    queue={actionCount:1,equipment:[{...items[1],actionKey:'action:1',role:'current-equipment',group:'equipment',
        sectionId:MOONCAKE_WAREHOUSE_SECTION_QUEUE,priority:400,sort:[0]}],protection:[],
        materials:[{...items[5],role:'queue-material',group:'material',sectionId:MOONCAKE_WAREHOUSE_SECTION_QUEUE,priority:380,sort:[0]}]};
}
function project() {
    lastProjection=mooncakeWarehouseBuildProjection(entries);
    lastModel=mooncakeWarehouseBuildPresentationModel(lastProjection,metrics);
    mooncakeWarehouseApplyPinnedNodes(root,lastProjection,lastModel,metrics);
}
function sortNewCards() {
    // Same one-time positioning write as MWITools' stack-price decoration.
    for(const {node} of entries)if(!node.dataset.mwiDecorated){node.style.position='relative';node.dataset.mwiDecorated='1';}
}
function restore() {
    for(const node of mooncakeWarehousePinnedNodes)mooncakeWarehouseRestorePinnedNode(node);
    mooncakeWarehousePinnedNodes=new Set();
}
function assertVisibleCard(node,label) {
    const style=getComputedStyle(node),card=node.querySelector('[class*="Item_item__"]');
    check(style.visibility==='visible'&&style.display!=='none'&&Number(style.opacity)>0,label+' 被隐藏');
    check(card&&card.getBoundingClientRect().width===90&&card.querySelector('[role="img"]'),label+' 缺少原生图标');
}
document.getElementById('run').onclick=async()=>{
    const checks=[];
    try {
        restore();membership=false;state.activeSectionId='custom';actions.length=0;
        result.textContent='检查中';delete result.dataset.status;
        for(const level of [3,4,0,1,2,7,6,8,0,1,5,10]){
            renderNative(level);project();sortNewCards();await frame();
            assertVisibleCard(entries[1].node,'强化 +'+level+' 的原生装备');
            assertVisibleCard(entries[5].node,'强化材料');
            check(entries.every(({node})=>!node.hasAttribute(MOONCAKE_WAREHOUSE_PINNED_ATTR)),'独立队列不应挪动原生库存');
            const positions=entries.map(({node})=>node.getBoundingClientRect());
            check(positions.every((rect,i)=>!i||Math.abs(rect.left-positions[i-1].left-94)<1),'原生格子出现空位或重叠');
            const preview=mooncakeWarehouseGetQueuePreviewRecords(lastModel.queueSection,characterInventoryItems);
            check(preview[0].item.enhancementLevel===level&&preview[0].available,'独立队列等级未同步');
            checks.push('+'+level+'：图标、数量、连续格子、队列等级正常');
        }
        // Native events must use the new hash after remounting at a new level.
        const clickable=entries[1].node.querySelector('[class*="Item_clickable"]');
        clickable.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2}));
        check(actions.at(-1)?.args[1]==='/items/equipment_active:10','右键未使用最新物品');
        clickable.click();check(document.querySelector('[role="dialog"]'),'左键菜单未打开');
        document.querySelector('[role="dialog"] button:last-child').click();
        checks.push('原生左右键正常，使用最新等级');
        membership=true;renderNative(11);project();sortNewCards();await frame();
        assertVisibleCard(entries[1].node,'自定义分区内的强化装备');
        check(lastModel.placements.has(mooncakeWarehouseIdentityKey('/items/equipment_active',11)),'强化队列抢占了自定义分区');
        check(lastModel.sections.find(section=>section.id==='custom').count===1,'自定义分区计数错误');
        check(getComputedStyle(entries[1].node).position==='absolute','库存排序覆盖了分区定位');
        checks.push('强化中的装备保留自定义分区和计数，库存排序不破坏定位');
        state.activeSectionId=MOONCAKE_WAREHOUSE_SECTION_ENHANCE;project();sortNewCards();await frame();
        const hidden=entries[1].node;
        check(getComputedStyle(hidden).visibility==='hidden'&&getComputedStyle(hidden).position==='absolute','其他分区的隐藏物品仍占用格子');
        checks.push('切换分区后隐藏物品不留下空格');
        restore();state.activeSectionId=null;await frame();
        assertVisibleCard(hidden,'恢复原生库存');
        check(getComputedStyle(hidden).position==='relative','未恢复库存排序的定位');
        checks.push('恢复原生库存后显示与定位正常');
        const collapsed=mooncakeWarehouseBuildProjection([]);
        check(mooncakeWarehouseGetUnavailableSectionCount('custom',[],collapsed)===1,'折叠分类中的强化装备被漏计');
        checks.push('折叠分类保留强化装备计数');
        result.textContent='PASS '+checks.length+' 项\n'+checks.join('\n');result.dataset.status='pass';
    }catch(error){result.textContent='FAIL '+error.message+'\n'+checks.join('\n');result.dataset.status='fail';}
};
renderNative(3);project();sortNewCards();
</script></html>`;
const server = createServer((request, response) => {
    const asset = assets.get(request.url);
    response.setHeader('Content-Type', asset ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(asset ?? html);
});
server.listen(0, '127.0.0.1', () => console.log(`Inventory visibility ${baseline || 'working tree'}: http://127.0.0.1:${server.address().port}`));
