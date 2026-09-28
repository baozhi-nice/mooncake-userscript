import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
const functions = ['mooncakeCollectionValues', 'mooncakeInventoryCharacterItems',
    'mooncakeWarehouseNormalizeItemHrid', 'mooncakeWarehouseNormalizeLevel',
    'mooncakeWarehouseIdentityKey', 'mooncakeWarehouseGetQueuePreviewRecords'];
const context = vm.createContext({Map, Set, characterInventoryItems:[]});
for (const name of functions) {
    const start = source.indexOf(`    function ${name}(`);
    assert(start >= 0, `${name} exists`);
    const end = source.indexOf('\n    function ', start + 1);
    vm.runInContext(source.slice(start, end), context);
}
const collect = context.mooncakeWarehouseGetQueuePreviewRecords;
const item = (hrid, level, count = 1, location = '/item_locations/inventory') => ({
    itemHrid:hrid, enhancementLevel:level, count, itemLocationHrid:location,
    hash:`${location}::${hrid}::${level}`, id:`${hrid}:${level}`
});
const equipment = {itemHrid:'/items/hat', enhancementLevel:3, group:'equipment', actionKey:'id:100', actionIndexes:[0]};
const material = {itemHrid:'/items/cloth', enhancementLevel:0, group:'material'};
const protection = {itemHrid:'/items/mirror', enhancementLevel:0, group:'protection'};
const section = {sourceQueue:{equipment:[equipment], protection:[protection], materials:[material, material, {...protection, group:'material'}]}};
const hat = item('/items/hat',3), cloth = item('/items/cloth',0,100), mirror = item('/items/mirror',0,5);
const fullInventory = new Map([hat,cloth,mirror,item('/items/hat',8),item('/items/cloth',0,999,'/item_locations/head')].map(entry => [entry.hash,entry]));

// No DOM, visible inventory entries, category or expanded group is supplied.
const records = collect(section, fullInventory);
assert.equal(records.length,3, 'shared materials/protection should appear once');
assert.equal(records[0].item,hat, 'retain the complete native item including hash/id');
assert.equal(records[1].item,mirror);
assert.equal(records[2].item,cloth, 'ignore items outside the inventory');
assert(records.every(record => record.available));

const upgraded = item('/items/hat',4);
const next = collect({...section, sourceQueue:{...section.sourceQueue, equipment:[{...equipment, enhancementLevel:4}]}},[upgraded,cloth,mirror]);
assert.equal(next[0].previewKey,records[0].previewKey, 'enhancement must preserve native component identity');
assert.equal(next[0].item.hash,upgraded.hash);
assert.equal(next[0].enhancementLevel,4);

const missing = collect(section, [item('/items/hat',3,0), cloth]);
assert.equal(missing[0].available,false);
assert.equal(missing[0].item.count,0, 'never fabricate inventory availability');
assert.equal(missing[0].item.hash,undefined, 'missing items must not expose a stale actionable hash');
assert.equal(missing[0].previewKey,records[0].previewKey, 'temporary missing data must not recreate the card');
assert.equal(missing[1].item.count,0, 'depleted protection still has a zero-count card');

const reconciling = {sourceQueue:{equipment:[{...equipment,allowLevelReconcile:true}],protection:[],materials:[]}};
assert.equal(collect(reconciling,[upgraded])[0].item,upgraded, 'brief action-result handoff resolves the unique changed level');
assert.equal(collect(reconciling,[upgraded,item('/items/hat',8)])[0].available,false, 'ambiguous levels must not select the wrong equipment');
assert.equal(collect(section,[upgraded])[0].available,false, 'outside the handoff window do not guess another level');
assert.equal(collect(null,fullInventory).length,0);
assert.equal(collect({sourceQueue:{equipment:[],protection:[],materials:[]}},fullInventory).length,0);

// Native category views have no custom layout root. Hiding the inventory must
// retain its visibility observer; an unmounted inventory must clean up instead.
let observed = 0, restored = 0, stopped = 0;
Object.assign(context, {
    document:{hidden:false}, console,
    mooncakeIsEnhancementInventoryWarehouseEnabled:() => true,
    mooncakeWarehouseHasSunnyConflict:() => false,
    mooncakeWarehouseFindInventoryRoot:() => null,
    mooncakeIsExternalProfitPanelNode:() => false,
    mooncakeWarehouseObserveInventoryRoot:() => { observed++; },
    mooncakeWarehouseRestorePresentation:() => { restored++; },
    mooncakeWarehouseStopObservingInventoryRoot:() => { stopped++; },
    mooncakeWarehouseInventoryRoot:null,
    mooncakeWarehouseObservedRoot:{isConnected:true}
});
const renderStart = source.indexOf('    function mooncakeWarehouseRender(');
vm.runInContext(source.slice(renderStart,source.indexOf('\n    function ',renderStart + 1)),context);
context.mooncakeWarehouseRender();
assert.equal(observed,1, 'a hidden native inventory retains its visibility observer');
assert.equal(stopped,0);
context.mooncakeWarehouseObservedRoot.isConnected = false;
context.mooncakeWarehouseRender();
assert.equal(restored,1, 'unmounting a native category view cleans up its independent queue');
assert.equal(stopped,1);
console.log('Native queue data checks passed: independent inventory, deduplication, stable identity, depleted stock and level handoff.');
