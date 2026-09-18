import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

function extractFunction(name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `${name} must exist`);
    let parameterDepth = 0;
    let parameterEnd = -1;
    for (let index = start + marker.length - 1; index < source.length; index += 1) {
        if (source[index] === '(') parameterDepth += 1;
        if (source[index] === ')') parameterDepth -= 1;
        if (parameterDepth === 0) {
            parameterEnd = index;
            break;
        }
    }
    assert.notEqual(parameterEnd, -1, `${name} parameters must close`);
    const braceStart = source.indexOf('{', parameterEnd);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unable to extract ${name}`);
}

const invalidateStateCaches = extractFunction('mooncakeWarehouseInvalidateStateCaches');
const getMembershipIndex = extractFunction('mooncakeWarehouseGetMembershipIndex');
const getManualMembership = extractFunction('mooncakeWarehouseGetManualMembership');
const getStoredMembership = extractFunction('mooncakeWarehouseGetStoredMembership');
const membershipState = {
    memberships: [
        { itemHrid: '/items/test_blade', categoryId: 'custom:weapons', levelMode: 'all', enhancementLevel: null },
        { itemHrid: '/items/test_blade', categoryId: 'custom:upgraded', levelMode: 'exact', enhancementLevel: 8 }
    ]
};
const membershipSandbox = {
    mooncakeWarehouseMembershipIndex: null,
    mooncakeWarehouseMembershipIndexState: null,
    mooncakeWarehouseMaterialRelations: new Map(),
    mooncakeWarehouseMaterialRelationsSignature: 'stale',
    mooncakeWarehouseMaterialRelationsItemDetailMap: {},
    mooncakeWarehouseEnsureState: () => membershipState,
    mooncakeWarehouseNormalizeItemHrid: value => String(value || '').startsWith('/items/') ? value : null,
    mooncakeWarehouseNormalizeLevel: value => Math.max(0, Math.trunc(Number(value) || 0)),
    mooncakeWarehouseIdentityKey: (itemHrid, level) => `${itemHrid}\u0001${level}`
};
vm.runInNewContext(`
    ${invalidateStateCaches}
    ${getMembershipIndex}
    ${getManualMembership}
    ${getStoredMembership}
    globalThis.getManualMembership = mooncakeWarehouseGetManualMembership;
    globalThis.getStoredMembership = mooncakeWarehouseGetStoredMembership;
    globalThis.invalidateStateCaches = mooncakeWarehouseInvalidateStateCaches;
`, membershipSandbox);
assert.equal(
    membershipSandbox.getManualMembership('/items/test_blade', 8).categoryId,
    'custom:upgraded',
    'an exact assignment must override the all-level assignment'
);
assert.equal(
    membershipSandbox.getManualMembership('/items/test_blade', 7).categoryId,
    'custom:weapons',
    'other levels must retain the all-level assignment'
);
assert.equal(
    membershipSandbox.getStoredMembership('/items/test_blade', 8, 'all').categoryId,
    'custom:weapons',
    'the stored all-level lookup must not be shadowed by an exact assignment'
);
membershipState.memberships[1].categoryId = 'custom:retargeted';
membershipSandbox.invalidateStateCaches();
assert.equal(
    membershipSandbox.getManualMembership('/items/test_blade', 8).categoryId,
    'custom:retargeted',
    'a saved state mutation must rebuild the membership index'
);
assert.equal(membershipSandbox.mooncakeWarehouseMaterialRelations, null, 'state cache invalidation must also release material relations');
assert.equal(membershipSandbox.mooncakeWarehouseMaterialRelationsItemDetailMap, null, 'state cache invalidation must release the material data source');

const buildMaterialRelations = extractFunction('mooncakeWarehouseBuildMaterialRelations');
let protectionLookups = 0;
let costLookups = 0;
const targets = new Map([['/items/test_blade', {}]]);
const materialSandbox = {
    Map,
    Set,
    JSON,
    mooncakeWarehouseMaterialRelations: null,
    mooncakeWarehouseMaterialRelationsSignature: '',
    mooncakeWarehouseMaterialRelationsItemDetailMap: null,
    itemDetailMap: null,
    mooncakeWarehouseGetEnhancementTargets: () => targets,
    mooncakeWarehouseNormalizeItemHrid: value => String(value || '').startsWith('/items/') ? value : null,
    mooncakeWarehouseIdentityKey: (itemHrid, level) => `${itemHrid}\u0001${level}`,
    getProtectionItems(itemHrid) {
        protectionLookups += 1;
        return itemHrid === '/items/test_blade' ? ['/items/test_protection'] : [];
    },
    getEnhancementCosts(itemHrid) {
        costLookups += 1;
        return itemHrid === '/items/test_blade' ? [{ itemHrid: '/items/test_material' }] : [];
    }
};
vm.runInNewContext(`
    ${buildMaterialRelations}
    globalThis.buildMaterialRelations = mooncakeWarehouseBuildMaterialRelations;
`, materialSandbox);
const firstRelations = materialSandbox.buildMaterialRelations();
const secondRelations = materialSandbox.buildMaterialRelations();
assert.equal(firstRelations, secondRelations, 'unchanged enhancement targets must reuse their material relation map');
assert.equal(protectionLookups, 1, 'cached material relations must avoid duplicate protection lookups');
assert.equal(costLookups, 1, 'cached material relations must avoid duplicate material-cost lookups');
materialSandbox.itemDetailMap = {};
materialSandbox.buildMaterialRelations();
assert.equal(protectionLookups, 2, 'loading item detail data must rebuild material relations once');
assert.equal(costLookups, 2, 'loading item detail data must rebuild material costs once');
targets.set('/items/test_staff', {});
materialSandbox.buildMaterialRelations();
assert.equal(protectionLookups, 4, 'changing targets must rebuild the relationship map once for each target');
assert.equal(costLookups, 4, 'changing targets must rebuild material costs once for each target');

const invalidateInventoryEntries = extractFunction('mooncakeWarehouseInvalidateInventoryEntries');
const getInventoryEntries = extractFunction('mooncakeWarehouseGetInventoryEntries');
let collectCalls = 0;
const inventoryRoot = {};
const entriesSandbox = {
    mooncakeWarehouseInventoryEntriesRoot: null,
    mooncakeWarehouseInventoryEntries: [],
    mooncakeWarehouseInventoryEntriesDirty: true,
    mooncakeWarehouseCollectInventoryNodes: root => {
        collectCalls += 1;
        return [{ root, revision: collectCalls }];
    }
};
vm.runInNewContext(`
    ${invalidateInventoryEntries}
    ${getInventoryEntries}
    globalThis.getInventoryEntries = mooncakeWarehouseGetInventoryEntries;
    globalThis.invalidateInventoryEntries = mooncakeWarehouseInvalidateInventoryEntries;
`, entriesSandbox);
assert.equal(entriesSandbox.getInventoryEntries(inventoryRoot)[0].revision, 1, 'the first render must collect native inventory cards');
assert.equal(entriesSandbox.getInventoryEntries(inventoryRoot)[0].revision, 1, 'state-only rerenders must reuse the native inventory snapshot');
entriesSandbox.invalidateInventoryEntries(inventoryRoot);
assert.equal(entriesSandbox.getInventoryEntries(inventoryRoot)[0].revision, 2, 'a local inventory mutation must invalidate the snapshot');

const getInventoryStateSignature = extractFunction('mooncakeWarehouseGetInventoryStateSignature');
const signatureSandbox = {
    Map,
    characterInventoryItems: null,
    mooncakeInventoryCharacterItems: items => (items || []).filter(item =>
        item?.itemLocationHrid === '/item_locations/inventory' && Number(item.count) > 0
    ),
    mooncakeWarehouseNormalizeItemHrid: value => String(value || '').startsWith('/items/') ? value : null,
    mooncakeWarehouseIdentityKey: (itemHrid, level) => `${itemHrid}\u0001${Math.max(0, Math.trunc(Number(level) || 0))}`
};
vm.runInNewContext(`
    ${getInventoryStateSignature}
    globalThis.getInventoryStateSignature = mooncakeWarehouseGetInventoryStateSignature;
`, signatureSandbox);
const signatureItems = [
    { itemHrid: '/items/test_blade', enhancementLevel: 8, count: 1, itemLocationHrid: '/item_locations/inventory' },
    { itemHrid: '/items/test_material', enhancementLevel: 0, count: 20, itemLocationHrid: '/item_locations/inventory' }
];
const firstSignature = signatureSandbox.getInventoryStateSignature(signatureItems);
assert.equal(
    signatureSandbox.getInventoryStateSignature([...signatureItems].reverse()),
    firstSignature,
    'equivalent inventory records in a different source order must not trigger a warehouse render'
);
assert.notEqual(
    signatureSandbox.getInventoryStateSignature([
        signatureItems[0],
        { ...signatureItems[1], count: 21 }
    ]),
    firstSignature,
    'a quantity change must invalidate the warehouse projection'
);

const observeInventoryStructure = extractFunction('mooncakeWarehouseObserveInventoryStructure');
const observerInstances = [];
class FakeMutationObserver {
    constructor(callback) {
        this.callback = callback;
        observerInstances.push(this);
    }
    observe(target, options) {
        this.target = target;
        this.options = options;
    }
    disconnect() {}
}
const observedRoot = { isConnected: true };
const scheduledReasons = [];
const observedInvalidations = [];
let handedOffCurrentEquipment = false;
const observerSandbox = {
    MutationObserver: FakeMutationObserver,
    mooncakeWarehouseRootMutationObserver: null,
    mooncakeWarehouseObservedRoot: observedRoot,
    mooncakeWarehouseMutationsIntroduceSunnyConflict: () => false,
    mooncakeWarehouseMutationTouchesObservedInventory: () => true,
    mooncakeWarehousePinIncomingCurrentEquipment: () => handedOffCurrentEquipment,
    mooncakeWarehouseInvalidateInventoryEntries: root => observedInvalidations.push(root),
    mooncakeScheduleWarehouseRender: reason => scheduledReasons.push(reason)
};
vm.runInNewContext(`
    ${observeInventoryStructure}
    globalThis.observeInventoryStructure = mooncakeWarehouseObserveInventoryStructure;
`, observerSandbox);
observerSandbox.observeInventoryStructure(observedRoot);
assert.equal(observerInstances.length, 1, 'an active inventory root must receive one dedicated structure observer');
assert.equal(observerInstances[0].options.childList, true, 'the root observer must watch child-list changes');
assert.equal(observerInstances[0].options.subtree, true, 'the root observer must cover nested inventory grids');
assert.equal(Object.keys(observerInstances[0].options).length, 2, 'the root observer must only watch inventory structure changes');
observerInstances[0].callback([{}]);
assert.deepEqual(observedInvalidations, [observedRoot], 'a relevant local mutation must invalidate only this inventory snapshot');
assert.deepEqual(scheduledReasons, ['inventory-dom'], 'a relevant local mutation must schedule one frame-coalesced render');
handedOffCurrentEquipment = true;
observerInstances[0].callback([{}]);
assert.deepEqual(
    scheduledReasons,
    ['inventory-dom', 'queue-handoff'],
    'a current-equipment replacement must take the no-flash handoff render path'
);

assert.match(
    source,
    /function mooncakeWarehouseMutationsMayReplaceInventoryRoot[\s\S]{0,700}currentRoot\.contains\(node\)/,
    'the global observer must reject mutations inside a live inventory root'
);
assert.match(
    source,
    /mooncakeWarehouseRootMutationObserver\.observe\(root, \{ childList: true, subtree: true \}\)/,
    'the dedicated root observer must own inventory child-list observation'
);
assert.match(
    source,
    /function mooncakeWarehouseGetInventoryEntries[\s\S]{0,700}mooncakeWarehouseInventoryEntriesDirty/,
    'inventory collection must stay behind a dirty snapshot gate'
);
assert.match(
    source,
    /if \(inventoryTouched && mooncakeIsEnhancementInventoryWarehouseEnabled\(\) &&[\s\S]{0,900}mooncakeWarehouseGetInventoryStateSignature[\s\S]{0,500}mooncakeScheduleWarehouseRender\('items'\)/,
    'only a changed inventory snapshot on a visible warehouse may request a render'
);
assert.doesNotMatch(
    source,
    /mooncakeScheduleWarehouseRender\('character-data'\)/,
    'skill, buff, and house packets must not re-render the inventory warehouse'
);

console.log('Inventory warehouse performance checks passed.');
