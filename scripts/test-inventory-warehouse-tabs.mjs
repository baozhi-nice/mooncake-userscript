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
    const braceStart = source.indexOf('{', parameterEnd);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unable to extract ${name}`);
}

const QUEUE = 'system:current-queue';
const ENHANCE = 'system:enhance';
const MATERIALS = 'system:enhance-materials';
const UNCLASSIFIED = 'system:unclassified';
const systemSections = new Set([QUEUE, ENHANCE, MATERIALS]);

const defaultState = extractFunction('mooncakeWarehouseDefaultState');
const normalizeItemHrid = extractFunction('mooncakeWarehouseNormalizeItemHrid');
const normalizeLevel = extractFunction('mooncakeWarehouseNormalizeLevel');
const normalizeState = extractFunction('mooncakeWarehouseNormalizeState');
const stateSandbox = {
    Set,
    Object,
    Number,
    String,
    MOONCAKE_WAREHOUSE_VERSION: 1,
    MOONCAKE_WAREHOUSE_SECTION_QUEUE: QUEUE,
    MOONCAKE_WAREHOUSE_SECTION_ENHANCE: ENHANCE,
    MOONCAKE_WAREHOUSE_SECTION_MATERIALS: MATERIALS,
    MOONCAKE_WAREHOUSE_SECTION_UNCLASSIFIED: UNCLASSIFIED,
    MOONCAKE_WAREHOUSE_SYSTEM_SECTIONS: systemSections,
    MOONCAKE_WAREHOUSE_SORTABLE_SYSTEM_SECTIONS: [ENHANCE, MATERIALS],
    MOONCAKE_WAREHOUSE_CUSTOM_ID_RE: /^custom:[A-Za-z0-9_-]{1,80}$/
};
vm.runInNewContext(`
    ${defaultState}
    ${normalizeItemHrid}
    ${normalizeLevel}
    ${normalizeState}
    globalThis.defaultState = mooncakeWarehouseDefaultState;
    globalThis.normalizeState = mooncakeWarehouseNormalizeState;
`, stateSandbox);

assert.equal(
    stateSandbox.defaultState().hiddenSections[MATERIALS],
    true,
    'enhancement materials must be hidden for a new character'
);
assert.equal(
    stateSandbox.normalizeState({ hiddenSections: {} }).hiddenSections[MATERIALS],
    true,
    'legacy state without a material preference must inherit the new hidden default'
);
assert.equal(
    stateSandbox.normalizeState({ hiddenSections: { [MATERIALS]: false } }).hiddenSections[MATERIALS],
    false,
    'an explicit user choice to show enhancement materials must survive normalization'
);
const customState = stateSandbox.normalizeState({
    categories: [{ id: 'custom:kept', name: 'Kept', order: 0 }],
    activeSectionId: 'custom:kept'
});
assert.equal(customState.activeSectionId, 'custom:kept', 'a valid custom active tab must survive normalization');
assert.equal(
    stateSandbox.normalizeState({
        categories: [{ id: 'custom:hidden', name: 'Hidden', order: 0 }],
        hiddenSections: { 'custom:hidden': true },
        activeSectionId: 'custom:hidden'
    }).activeSectionId,
    null,
    'a hidden custom tab must not remain the active warehouse tab'
);
assert.equal(
    stateSandbox.normalizeState({
        hiddenSections: { [MATERIALS]: true },
        activeSectionId: MATERIALS
    }).activeSectionId,
    null,
    'the default-hidden material warehouse must not remain active after migration'
);
assert.equal(
    stateSandbox.normalizeState({ activeSectionId: 'custom:missing' }).activeSectionId,
    null,
    'an unknown active tab must fall back safely'
);

const compareSort = extractFunction('mooncakeWarehouseCompareSort');
const buildProjection = extractFunction('mooncakeWarehouseBuildProjection');
let materialRelationBuilds = 0;
const projectionState = { hiddenSections: { [MATERIALS]: true } };
const projectionSandbox = {
    Map,
    Set,
    Number,
    String,
    characterInventoryItems: [],
    MOONCAKE_WAREHOUSE_SECTION_QUEUE: QUEUE,
    MOONCAKE_WAREHOUSE_SECTION_ENHANCE: ENHANCE,
    MOONCAKE_WAREHOUSE_SECTION_MATERIALS: MATERIALS,
    MOONCAKE_WAREHOUSE_SECTION_UNCLASSIFIED: UNCLASSIFIED,
    mooncakeInventoryCharacterItems: () => [],
    mooncakeWarehouseIdentityKey: (hrid, level) => `${hrid}\u0001${level || 0}`,
    mooncakeWarehouseNormalizeLevel: value => Math.max(0, Math.trunc(Number(value) || 0)),
    mooncakeWarehouseBuildQueueRecords: () => ({ equipment: [], protection: [], materials: [], actionCount: 0 }),
    mooncakeWarehouseEnsureState: () => projectionState,
    mooncakeWarehouseBuildMaterialRelations: () => {
        materialRelationBuilds += 1;
        return new Map();
    },
    mooncakeWarehouseGetManualMembership: () => null,
    getItemName: value => value
};
vm.runInNewContext(`
    ${compareSort}
    ${buildProjection}
    globalThis.buildProjection = mooncakeWarehouseBuildProjection;
`, projectionSandbox);
const hiddenProjection = projectionSandbox.buildProjection([]);
assert.equal(materialRelationBuilds, 0, 'hidden material warehouse must not build enhancement material relations');
assert.equal(hiddenProjection.materialRelations.size, 0, 'hidden material warehouse must expose an empty relation map');
projectionState.hiddenSections[MATERIALS] = false;
projectionSandbox.buildProjection([]);
assert.equal(materialRelationBuilds, 1, 'showing the material tab must opt back into relation calculation');

const nativeAllSelected = extractFunction('mooncakeWarehouseIsNativeAllItemsTab');
function createTabsRoot(selectedIndex) {
    const tabs = [0, 1, 2].map(index => ({
        getAttribute: name => name === 'aria-selected' ? String(index === selectedIndex) : null,
        classList: { contains: value => value === 'Mui-selected' && index === selectedIndex }
    }));
    const tabsContainer = { querySelectorAll: selector => selector === '[role="tab"]' ? tabs : [] };
    return { querySelector: () => tabsContainer };
}
const tabSandbox = {};
vm.runInNewContext(`${nativeAllSelected}; globalThis.isAll = mooncakeWarehouseIsNativeAllItemsTab;`, tabSandbox);
assert.equal(tabSandbox.isAll(createTabsRoot(0)), true, 'the first native inventory tab is the All view');
assert.equal(tabSandbox.isAll(createTabsRoot(1)), false, 'Favorites must suspend Mooncake warehouse layout');
assert.equal(tabSandbox.isAll(createTabsRoot(2)), false, 'category tabs must suspend Mooncake warehouse layout');
assert.equal(tabSandbox.isAll({ querySelector: () => null }), true, 'the production fallback without native tabs remains supported');

const getItemHridFromUse = extractFunction('mooncakeGetItemHridFromUse');
const getItemHridFromContainer = extractFunction('mooncakeGetItemHridFromContainer');
const mainUse = { href: { baseVal: '/static/media/items_sprite.svg#cursed_bow' } };
const favoriteUse = { href: { baseVal: '/static/media/misc_sprite.svg#favorite_badge' } };
const lockUse = { href: { baseVal: '/static/media/misc_sprite.svg#lock_badge' } };
const itemSandbox = {
    Set,
    mooncakeEnsureItemDetailMap: () => ({ '/items/cursed_bow': {} })
};
vm.runInNewContext(`
    ${getItemHridFromUse}
    ${getItemHridFromContainer}
    globalThis.getItemHrid = mooncakeGetItemHridFromContainer;
`, itemSandbox);
const card = {
    querySelectorAll(selector) {
        if (selector.includes('Item_iconContainer')) return [mainUse];
        if (selector === 'svg use') return [favoriteUse, lockUse, mainUse];
        return [];
    }
};
assert.equal(itemSandbox.getItemHrid(card), '/items/cursed_bow', 'favorite and lock badges must not replace the item HRID');
const badgeOnly = {
    querySelectorAll(selector) {
        if (selector.includes('Item_iconContainer')) return [];
        if (selector === 'svg use') return [lockUse, favoriteUse];
        return [];
    }
};
assert.equal(itemSandbox.getItemHrid(badgeOnly), null, 'a badge-only node must not be treated as an inventory item');

assert.match(source, /mooncakeWarehouseAppendTabs\(panel, model\.sections, model\.activeSectionId\)/, 'presentation must render warehouse tabs');
assert.match(source, /const hidden = index > 0 \|\| !model\.placements\.has\(record\.key\)/, 'inactive tabs and favorite aliases must stay hidden');
assert.match(source, /mooncakeWarehouseGetLayoutRoot\(inventoryRoot\)/, 'warehouse layout must mount inside the active native tab panel');
assert.match(source, /mooncakeWarehouseHasNativeInventoryFilter\(inventoryRoot\)/, 'filtered inventory must remain under native layout control');

console.log('Inventory warehouse tab compatibility checks passed.');
