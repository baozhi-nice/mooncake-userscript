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

const QUEUE = 'system:current-queue';
const ENHANCE = 'system:enhance';
const MATERIALS = 'system:enhance-materials';
const UNCLASSIFIED = 'system:unclassified';
const customIcons = ['sword', 'star', 'shield', 'chest'];
const systemSections = new Set([QUEUE, ENHANCE, MATERIALS]);

assert.match(
    source,
    /const MOONCAKE_WAREHOUSE_QUEUE_DOCK_ATTR = 'data-mooncake-warehouse-queue-dock';/,
    'the current enhancement queue must own a stable standalone preview marker'
);
assert.match(
    source,
    /const MOONCAKE_WAREHOUSE_QUEUE_PREVIEW_ITEM_ATTR = 'data-mooncake-warehouse-queue-preview-item';/,
    'queue preview cards must be distinguishable from game-owned inventory cards'
);
assert.match(
    source,
    /const MOONCAKE_WAREHOUSE_NATIVE_TOOLS_ATTR = 'data-mooncake-warehouse-native-tools';/,
    'the native tab utility area must own a stable marker'
);
assert.match(
    source,
    /const MOONCAKE_WAREHOUSE_CUSTOM_ICON_KEYS\s*=\s*\[[\s\S]*?'sword'[\s\S]*?'star'[\s\S]*?'shield'[\s\S]*?'chest'[\s\S]*?\]/,
    'custom section icon keys must retain the documented deterministic fallback order'
);

const defaultState = extractFunction('mooncakeWarehouseDefaultState');
const normalizeItemHrid = extractFunction('mooncakeWarehouseNormalizeItemHrid');
const normalizeLevel = extractFunction('mooncakeWarehouseNormalizeLevel');
const normalizeCategoryIcon = extractFunction('mooncakeWarehouseNormalizeCategoryIcon');
const normalizeState = extractFunction('mooncakeWarehouseNormalizeState');
const getCustomSectionOrdinal = extractFunction('mooncakeWarehouseGetCustomSectionOrdinal');
const stateSandbox = {
    Set,
    Object,
    Number,
    String,
    Math,
    MOONCAKE_WAREHOUSE_VERSION: 1,
    MOONCAKE_WAREHOUSE_SECTION_QUEUE: QUEUE,
    MOONCAKE_WAREHOUSE_SECTION_ENHANCE: ENHANCE,
    MOONCAKE_WAREHOUSE_SECTION_MATERIALS: MATERIALS,
    MOONCAKE_WAREHOUSE_SECTION_UNCLASSIFIED: UNCLASSIFIED,
    MOONCAKE_WAREHOUSE_SYSTEM_SECTIONS: systemSections,
    MOONCAKE_WAREHOUSE_SORTABLE_SYSTEM_SECTIONS: [ENHANCE, MATERIALS],
    MOONCAKE_WAREHOUSE_CUSTOM_ICON_KEYS: customIcons,
    MOONCAKE_WAREHOUSE_CUSTOM_ID_RE: /^custom:[A-Za-z0-9_-]{1,80}$/
};
vm.runInNewContext(`
    ${defaultState}
    ${normalizeItemHrid}
    ${normalizeLevel}
    ${normalizeCategoryIcon}
    ${normalizeState}
    ${getCustomSectionOrdinal}
    globalThis.normalizeState = mooncakeWarehouseNormalizeState;
    globalThis.normalizeCategoryIcon = mooncakeWarehouseNormalizeCategoryIcon;
    globalThis.getCustomSectionOrdinal = mooncakeWarehouseGetCustomSectionOrdinal;
`, stateSandbox);

assert.equal(
    stateSandbox.normalizeCategoryIcon(undefined, 0),
    'sword',
    'a missing legacy icon must migrate to the first deterministic custom icon'
);
assert.equal(
    stateSandbox.normalizeCategoryIcon('not-a-warehouse-icon', 1),
    'star',
    'an invalid legacy icon must migrate through the deterministic fallback order'
);
assert.equal(
    stateSandbox.normalizeCategoryIcon('shield', 0),
    'shield',
    'a valid saved custom icon must survive state normalization'
);
assert.equal(
    stateSandbox.normalizeState({ activeSectionId: QUEUE }).activeSectionId,
    null,
    'the retired queue tab selection must migrate to the standalone preview'
);

const migratedState = stateSandbox.normalizeState({
    categories: [
        { id: 'custom:first', name: 'First', order: 0 },
        { id: 'custom:second', name: 'Second', order: 1, iconKey: 'not-a-warehouse-icon' },
        { id: 'custom:third', name: 'Third', order: 2, iconKey: 'chest' }
    ],
    sectionOrder: [ENHANCE, 'custom:first', MATERIALS, 'custom:second', 'custom:third']
});
assert.deepEqual(
    JSON.parse(JSON.stringify(migratedState.categories.map(category => [category.id, category.iconKey]))),
    [
        ['custom:first', 'sword'],
        ['custom:second', 'star'],
        ['custom:third', 'chest']
    ],
    'legacy saved categories without valid iconKey values must be normalized without discarding their order or names'
);

assert.equal(
    stateSandbox.getCustomSectionOrdinal(migratedState, QUEUE),
    0,
    'the current enhancement queue is not a custom icon section'
);
assert.equal(
    stateSandbox.getCustomSectionOrdinal(migratedState, ENHANCE),
    0,
    'system warehouses are not numbered as custom icon sections'
);
assert.equal(
    stateSandbox.getCustomSectionOrdinal(migratedState, 'custom:first'),
    1,
    'the first custom section must receive its number from sectionOrder'
);
assert.equal(
    stateSandbox.getCustomSectionOrdinal(migratedState, 'custom:second'),
    2,
    'interleaved system sections must not affect custom section numbering'
);
assert.equal(
    stateSandbox.getCustomSectionOrdinal(migratedState, 'custom:third'),
    3,
    'custom numbering must include every custom id in sectionOrder'
);

const reorderedState = {
    ...migratedState,
    sectionOrder: [ENHANCE, 'custom:third', MATERIALS, 'custom:first', 'custom:second']
};
assert.equal(
    stateSandbox.getCustomSectionOrdinal(reorderedState, 'custom:third'),
    1,
    'a section move must immediately update its displayed custom number'
);
assert.equal(
    stateSandbox.getCustomSectionOrdinal(reorderedState, 'custom:first'),
    2,
    'custom numbering must not depend on legacy category.order after a reorder'
);
assert.equal(
    stateSandbox.getCustomSectionOrdinal(reorderedState, 'custom:second'),
    3,
    'custom numbering must follow the reordered sectionOrder through the whole list'
);

const nativeTabsFlexContainer = extractFunction('mooncakeWarehouseGetNativeTabsFlexContainer');
const measureNativeTab = extractFunction('mooncakeWarehouseMeasureNativeTab');
const nativeTabSelectionBinding = extractFunction('mooncakeWarehouseBindNativeTabSelection');
const nativeToolsSync = extractFunction('mooncakeWarehouseSyncNativeSectionTools');
const queuePreviewRecords = extractFunction('mooncakeWarehouseGetQueuePreviewRecords');
const queueDockSync = extractFunction('mooncakeWarehouseSyncQueueDock');
const presentationModel = extractFunction('mooncakeWarehouseBuildPresentationModel');
const renderPresentation = extractFunction('mooncakeWarehouseRenderPresentation');
const renderWarehouse = extractFunction('mooncakeWarehouseRender');
const renderNativeNavigation = extractFunction('mooncakeWarehouseRenderNativeNavigation');

const presentationState = {
    categories: [
        { id: 'custom:first', name: 'First', iconKey: 'sword' },
        { id: 'custom:second', name: 'Second', iconKey: 'star' }
    ],
    hiddenSections: {},
    sectionOrder: [ENHANCE, 'custom:second', MATERIALS, 'custom:first'],
    activeSectionId: null
};
const presentationSandbox = {
    Map,
    Set,
    Math,
    JSON,
    Number,
    String,
    MOONCAKE_WAREHOUSE_SECTION_QUEUE: QUEUE,
    MOONCAKE_WAREHOUSE_SECTION_ENHANCE: ENHANCE,
    MOONCAKE_WAREHOUSE_SECTION_MATERIALS: MATERIALS,
    mooncakeWarehouseEnsureState: () => presentationState,
    mooncakeWarehouseText: key => key,
    mooncakeWarehouseIdentityKey: (itemHrid, enhancementLevel) => `${itemHrid}\u0001${enhancementLevel || 0}`,
    getItemName: itemHrid => String(itemHrid).replace('/items/', ''),
    mooncakeWarehouseGetUnavailableSectionCount: () => 0,
    mooncakeWarehouseGetSectionIcon: section => `icon:${section.id}`,
    mooncakeWarehouseGetPinnedLayoutSignature: () => 'pinned-layout'
};
vm.runInNewContext(`
    ${normalizeLevel}
    ${getCustomSectionOrdinal}
    ${presentationModel}
    globalThis.buildPresentationModel = mooncakeWarehouseBuildPresentationModel;
`, presentationSandbox);
const separatedQueueModel = presentationSandbox.buildPresentationModel({
    queue: { actionCount: 3, equipment: [], protection: [], materials: [] },
    bySection: new Map([
        [QUEUE, []],
        [ENHANCE, []],
        [MATERIALS, []],
        ['custom:first', []],
        ['custom:second', []]
    ]),
    inventoryKeys: new Set(),
    candidates: new Map()
}, {
    baseLeft: 0,
    columns: 1,
    columnStep: 40,
    itemHeight: 40,
    rowGap: 0,
    signature: 'relayout-test'
});
assert.equal(
    separatedQueueModel.queueSection.id,
    QUEUE,
    'an active enhancement queue must be retained as the independent dock model'
);
assert.equal(
    separatedQueueModel.queueSection.count,
    3,
    'the independent dock model must retain the queue action count'
);
assert.equal(
    separatedQueueModel.sections.some(section => section.id === QUEUE),
    false,
    'the current enhancement queue must not enter the ordinary section icon model'
);
assert.deepEqual(
    JSON.parse(JSON.stringify(separatedQueueModel.sections.map(section => [section.id, section.ordinal]))),
    [
        [ENHANCE, 0],
        ['custom:second', 1],
        [MATERIALS, 0],
        ['custom:first', 2]
    ],
    'the icon model must use sectionOrder for custom ordinals while leaving system sections unnumbered'
);

presentationState.activeSectionId = QUEUE;
const queuedEquipment = {
    key: '/items/test_blade\u000110',
    group: 'equipment',
    itemHrid: '/items/test_blade',
    enhancementLevel: 10
};
const activeQueueModel = presentationSandbox.buildPresentationModel({
    queue: { actionCount: 1, equipment: [queuedEquipment], protection: [], materials: [] },
    bySection: new Map([[QUEUE, [queuedEquipment]]]),
    inventoryKeys: new Set(),
    candidates: new Map()
}, {
    baseLeft: 0,
    columns: 1,
    columnStep: 40,
    itemHeight: 40,
    rowGap: 0,
    signature: 'active-queue-relayout-test'
});
assert.equal(activeQueueModel.activeSectionId, null, 'the queue must never replace the native inventory panel');
assert.equal(activeQueueModel.queueHeader, null, 'the standalone queue preview must not render an in-panel heading');
assert.equal(activeQueueModel.placements.size, 0, 'queue cards must not be pinned into the native inventory layout');

const previewSandbox = {};
vm.runInNewContext(`${queuePreviewRecords}; globalThis.queuePreviewRecords = mooncakeWarehouseGetQueuePreviewRecords;`, previewSandbox);
const previewRecords = previewSandbox.queuePreviewRecords({
    records: [
        { key: 'material', group: 'material', node: { isConnected: true } },
        { key: 'equipment', group: 'equipment', node: { isConnected: true } },
        { key: 'protection', group: 'protection', node: { isConnected: true } },
        { key: 'missing', group: 'equipment', node: { isConnected: false } }
    ]
});
assert.deepEqual(
    JSON.parse(JSON.stringify(previewRecords.map(record => record.key))),
    ['equipment', 'protection', 'material'],
    'the standalone preview must keep equipment first and omit unavailable source cards'
);

const nativeMeasureSandbox = { Math };
vm.runInNewContext(`${measureNativeTab}; globalThis.measureNativeTab = mooncakeWarehouseMeasureNativeTab;`, nativeMeasureSandbox);
const nativeToolStyle = new Map();
const measuredIcon = { getBoundingClientRect: () => ({ width: 28, height: 28 }) };
const measuredTabList = { querySelectorAll: () => [null] };
const measuredNativeTab = {
    parentElement: measuredTabList,
    getBoundingClientRect: () => ({ width: 44, height: 44 }),
    querySelector: () => measuredIcon
};
measuredTabList.querySelectorAll = () => [measuredNativeTab];
nativeMeasureSandbox.measureNativeTab({
    style: { setProperty: (name, value) => nativeToolStyle.set(name, value) }
}, measuredTabList);
assert.equal(nativeToolStyle.get('--mooncake-warehouse-native-tab-width'), '44px', 'plugin tools must adopt the native tab width');
assert.equal(nativeToolStyle.get('--mooncake-warehouse-native-tab-height'), '44px', 'plugin tools must adopt the native tab height');
assert.equal(nativeToolStyle.get('--mooncake-warehouse-native-icon-size'), '28px', 'plugin glyphs must adopt the native icon size');

assert.match(
    nativeTabsFlexContainer,
    /MuiTabs-flexContainer/,
    'native tool controls must locate the real wrapping flex container'
);
assert.match(
    nativeToolsSync,
    /mooncakeWarehouseGetNativeTabsFlexContainer\(root\)/,
    'native tool controls must mount inside the real native tab list'
);
assert.match(
    nativeToolsSync,
    /MOONCAKE_WAREHOUSE_NATIVE_TOOLS_ATTR/,
    'native tab utilities must retain their own marked wrapper'
);
assert.match(
    nativeToolsSync,
    /tools\.parentElement\s*!==\s*tabList/,
    'the utility wrapper must be retained directly inside the native flex list'
);
assert.match(
    nativeToolsSync,
    /lastNativeTab\.after\(tools\)/,
    'the utility wrapper must be inserted immediately after native inventory icons'
);
assert.match(
    nativeToolsSync,
    /tools\.setAttribute\(\s*['"]role['"]\s*,\s*['"]toolbar['"]\s*\)/,
    'native tab utilities must expose a non-tab toolbar role'
);
assert.doesNotMatch(
    nativeToolsSync,
    /(?:tools|toolGroup|utilityGroup)\.setAttribute\(\s*['"]role['"]\s*,\s*['"]tab['"]\s*\)/i,
    'utility controls beside native tabs must never become native role=tab entries'
);
assert.match(
    nativeToolsSync,
    /const navigationSections = model\.sections;/,
    'the queue must not enter the native inventory icon grid'
);
assert.doesNotMatch(
    presentationModel,
    /sections\.push\(queueSection\)/,
    'the current enhancement queue must not re-enter the ordinary warehouse section tab model'
);
assert.match(
    queueDockSync,
    /component\.before\(dock\)[\s\S]{0,380}MOONCAKE_WAREHOUSE_QUEUE_HOST_ATTR/,
    'the standalone queue preview must be inserted before the untouched native tabs component'
);
assert.match(
    source,
    /\[\$\{MOONCAKE_WAREHOUSE_NATIVE_TOOLS_ATTR\}\]\s*\{\s*display:\s*contents;/,
    'the plugin wrapper must not create a separate visual icon group'
);
assert.match(
    source,
    /function mooncakeWarehouseCloneQueuePreviewItem\(node\)[\s\S]{0,900}cloneNode\(true\)/,
    'the queue preview must use display-only copies instead of moving React-owned inventory cards'
);
assert.doesNotMatch(
    source,
    /\[\$\{MOONCAKE_WAREHOUSE_QUEUE_LAYOUT_ATTR\}="1"\][\s\S]{0,240}(?:order:\s*1|order:\s*2)/,
    'the queue preview must not reorder the game tabs or tab panels'
);
assert.match(
    renderPresentation,
    /mooncakeWarehouseSyncNativeSectionTools\(\s*inventoryRoot\s*,\s*model\s*\)/,
    'warehouse rendering must synchronize native-tab sibling utilities'
);
assert.match(
    renderPresentation,
    /mooncakeWarehouseSyncQueueDock\(inventoryRoot, model, metrics\)/,
    'the current queue preview must be rendered independently from the active warehouse section'
);
assert.match(
    renderWarehouse,
    /mooncakeWarehouseRenderPresentation\(\s*root\s*,\s*projection\s*,\s*mooncakeWarehouseLayoutMetrics\s*,\s*inventoryRoot\s*\)/,
    'the dock and toolbar must receive Inventory_items rather than the inner native tab panel'
);
assert.match(
    renderWarehouse,
    /mooncakeWarehouseRenderNativeNavigation\(\s*inventoryRoot\s*\);[\s\S]{0,420}mooncakeWarehouseRestorePresentation\(\{ keepExternal: true \}\);/,
    'native Favorites, category, and filtered views must retain the toolbar while restoring Mooncake card placement'
);
assert.match(
    renderNativeNavigation,
    /mooncakeWarehouseSyncNativeSectionTools\(\s*inventoryRoot\s*,\s*model\s*\)/,
    'native-only rendering must keep custom section tools available'
);
assert.doesNotMatch(renderNativeNavigation, /mooncakeWarehouseSyncQueueDock/, 'native views must not recreate an external queue dock');
assert.match(
    renderNativeNavigation,
    /model\.activeSectionId = null;[\s\S]{0,160}mooncakeWarehouseRemoveQueueDock\(\)/,
    'native filtered views must remove the standalone preview rather than alter inventory ordering'
);
assert.match(
    source,
    /const activeNativeTools = mooncakeWarehouseNativeTools;[\s\S]{0,260}node\.contains\(activeNativeTools\)/,
    'a React rebuild that removes a native tool ancestor must schedule a reattach'
);
assert.match(
    nativeTabSelectionBinding,
    /tabs\.addEventListener\('keydown',[\s\S]{0,1200}event\.key !== 'ArrowLeft' && event\.key !== 'ArrowRight'[\s\S]{0,1200}destination\.focus\(\)/,
    'native arrow-key navigation must skip the display:contents toolbar wrapper'
);
assert.match(
    source,
    /entry\.ordinal = mooncakeWarehouseGetCustomSectionOrdinal\(state, entry\.id\);[\s\S]{0,240}entry\.icon = mooncakeWarehouseGetSectionIcon\(entry\.category, entry\.ordinal\);/,
    'manager rows must derive the visible custom number and icon from the same stable section order'
);
assert.match(
    source,
    /mooncakeWarehouseCycleCategoryIcon\(entry\.id\)/,
    'manager rows must allow a custom section icon to be changed'
);
assert.match(
    source,
    /const materialRelationCount = state\.hiddenSections\[MOONCAKE_WAREHOUSE_SECTION_MATERIALS\] === true[\s\S]{0,100}: mooncakeWarehouseBuildMaterialRelations\(\)\.size;/,
    'opening the manager must not build hidden enhancement-material relations'
);

console.log('Inventory warehouse relayout checks passed.');
