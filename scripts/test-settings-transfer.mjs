import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import vm from 'node:vm';

const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
function block(start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    assert(from >= 0 && to > from, `Missing source block: ${start}`);
    return source.slice(from, to);
}
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `Missing ${name}`);
    let position = source.indexOf('(', start), depth = 0;
    do { if (source[position] === '(') depth++; if (source[position] === ')') depth--; position++; } while (depth);
    position = source.indexOf('{', position);
    do { if (source[position] === '{') depth++; if (source[position] === '}') depth--; position++; } while (depth);
    return source.slice(start, position);
}
const transferCode = block('    const MOONCAKE_SETTINGS_BACKUP_FORMAT', '    function mooncakeCreateEnhancementSettingsSection');
const storageConstants = [...new Set(extract('mooncakeSettingsStorageFields').match(/MOONCAKE_[A-Z_]+_KEY/g))]
    .concat(['MOONCAKE_ORDER_BOOK_ARCHIVE_MIN_LIMIT', 'MOONCAKE_ORDER_BOOK_ARCHIVE_MAX_LIMIT'])
    .map(name => { const match = source.match(new RegExp(`^    const ${name} = .+;$`, 'm')); assert(match, name); return match[0]; }).join('\n');
const supportCode = [
    block('    const CONFIG_KEY =', '    const MOONCAKE_VIRTUAL_PROFILE_MAX_COUNT'),
    block('    const MOONCAKE_HOURLY_WAGE_TIER_KEYS =', '    // Existing installs used'),
    block('    const MOONCAKE_WAREHOUSE_STORAGE_PREFIX =', '    const MOONCAKE_WAREHOUSE_STYLE_PROPS'),
    block('    const MOONCAKE_LAZY_ENHANCEMENT_SHORTCUT_LIMIT =', '    const MOONCAKE_LAZY_ENHANCEMENT_EXTERNAL_CONTROLS_SELECTOR'),
    storageConstants,
    ...['mooncakeWarehouseStorageKey', 'mooncakeWarehouseDefaultState', 'mooncakeWarehouseNormalizeState',
        'mooncakeWarehouseNormalizeItemHrid', 'mooncakeWarehouseNormalizeLevel', 'mooncakeWarehouseNormalizeCategoryIcon',
        'mooncakeNormalizeEnhanceItemHrid', 'mooncakeNormalizeLazyEnhancementPreset', 'mooncakeCloneLazyEnhancementShortcutDefaults'].map(extract)
].join('\n');

class MemoryStorage {
    constructor(entries = []) { this.values = new Map(entries); this.failKey = null; this.capacity = Infinity; }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) {
        if (key === this.failKey) { this.failKey = null; throw Error('quota failure'); }
        const next = new Map(this.values); next.set(key, String(value));
        if ([...next.values()].reduce((total, text) => total + text.length, 0) > this.capacity) throw Error('quota failure');
        this.values = next;
    }
    removeItem(key) { this.values.delete(key); }
}
const configKey = 'better_loot_tracker_config', warehousePrefix = 'Mooncake_inventoryWarehouses_v1:';
function device(entries = [], characterId = '11') {
    const storage = new MemoryStorage(entries);
    const context = vm.createContext({ localStorage: storage, isZH: true, TextEncoder, Blob, mooncakeCharacterId: characterId });
    vm.runInContext(supportCode + transferCode, context);
    return { storage, context, backup: () => context.mooncakeCreateSettingsBackup(),
        parse: text => context.mooncakeParseSettingsBackup(text), apply: data => context.mooncakeApplySettingsBackup(data) };
}
const customConfig = {
    virtual: { enabled: true, community_enhancing_speed_level: 12 },
    virtualProfiles: [{ id: 'my-profile', name: '自用强化', values: { enabled: true, enhancing_level: 160 } }],
    virtualRivals: ['custom:my-profile'],
    ui: { fabVisible: false },
    preferences: { enhancementRouteObjective: 'standardHourly', enhancementStandardHourlyM: 12, marketLevelJumpSequence: '0,7,10,12',
        myListingTypes: { '501': { type: 'pinned', updatedAt: 123 } } },
    features: { marketHourlyWage: false, antiSuicideEnhancement: true },
    lazyEnhancementPresets: [{ itemHrid: '/items/sword', targetLevel: 12, protectionItemHrid: '/items/mirror', protectionLevel: 6, isDefault: true }],
    lazyEnhancementShortcuts: { target: [10, 12], protect: [6], repeat: [], combined: [] }
};
const partition = { version: 1, categories: [{ id: 'custom:mine', name: '我的装备', iconKey: 'shield', order: 0 }],
    memberships: [{ itemHrid: '/items/sword', categoryId: 'custom:mine', levelMode: 'exact', enhancementLevel: 12 }],
    sectionOrder: ['custom:mine', 'system:enhance'], hiddenSections: { 'system:enhance-materials': true } };
const origin = device([
    [configKey, JSON.stringify(customConfig)], [warehousePrefix + '11', JSON.stringify(partition)],
    ['Mooncake_protectionAssistant_enabled_v1', '0'], ['Mooncake_marketHistory_card_sell_first_v1', '0'],
    ['Mooncake_orderBookArchive_limit_v1', '5000'],
    ['Mooncake_marketShortage_preferences_v1', JSON.stringify({ itemLevels: [95, 85], nameQuery: '袍服' })],
    ['authToken', 'PRIVATE'], ['Mooncake_marketHistory_v4', 'PRIVATE-CACHE'],
    ['Mooncake_marketPersonalTradeHistory_v1:11', 'PRIVATE-TRADES'], ['anotherPlugin', 'PRIVATE-OTHER']
]);
const serialized = JSON.stringify(origin.backup());
assert(!serialized.includes('PRIVATE'), 'export must never include credentials, histories, caches or other plugins');
const backup = origin.parse('\uFEFF' + serialized);
const otherPartitions = JSON.stringify({ version: 1, categories: [{ id: 'custom:other', name: '另一角色' }], memberships: [] });
const destination = device([[configKey, JSON.stringify({ preferences: { enhancementStandardHourlyM: 99, marketLevelJumpSequence: '0,20' }, features: { marketHourlyWage: true } })],
    [warehousePrefix + '11', JSON.stringify({ version: 1, categories: [], memberships: [] })],
    [warehousePrefix + '22', otherPartitions], ['authToken', 'KEEP-LOGIN'],
    ['Mooncake_marketHistory_card_enabled_v1', '0'], ['Mooncake_marketHistory_v4', 'KEEP-CACHE'],
    ['Mooncake_marketPersonalTradeHistory_v1:11', 'KEEP-TRADES']]);
destination.apply(destination.parse(serialized));
const restored = JSON.parse(destination.storage.getItem(configKey));
assert.deepEqual(restored, JSON.parse(serialized).config, 'settings replace, rather than merge with, the destination');
assert.equal(restored.preferences.enhancementStandardHourlyM, 12);
assert.equal(restored.features.marketHourlyWage, false);
assert.equal(destination.storage.getItem('Mooncake_protectionAssistant_enabled_v1'), '0');
assert.equal(destination.storage.getItem('Mooncake_marketHistory_card_enabled_v1'), null, 'unset source preferences reset destination overrides');
assert.equal(destination.storage.getItem(warehousePrefix + '22'), otherPartitions);
assert.equal(destination.storage.getItem('authToken'), 'KEEP-LOGIN');
assert.equal(destination.storage.getItem('Mooncake_marketPersonalTradeHistory_v1:11'), 'KEEP-TRADES');
assert.equal(destination.storage.getItem('Mooncake_marketHistory_v4'), 'KEEP-CACHE');
assert.deepEqual(JSON.parse(destination.storage.getItem(warehousePrefix + '11')), JSON.parse(serialized).warehouses['11']);
assert.equal(JSON.parse(JSON.stringify(destination.backup())).config.virtualProfiles[0].name, '自用强化');
console.log('PASS: two-device round trip; all settings, presets and matching-character partitions restored; unrelated data preserved.');

const blank = device().backup();
assert.deepEqual(JSON.parse(JSON.stringify(blank.warehouses['11'])).categories, [], 'default current-character partitions are portable too');
const beforeInvalid = [...destination.storage.values];
const invalid = [
    'not JSON', '[]', '{}', JSON.stringify({ ...backup, version: 2 }),
    JSON.stringify({ ...backup, config: { ...backup.config, virtual: [] } }),
    JSON.stringify({ ...backup, config: { ...backup.config, features: { marketHourlyWage: 'false' } } }),
    JSON.stringify({ ...backup, config: { ...backup.config, preferences: { marketHistoryMobileColumns: [] } } }),
    JSON.stringify({ ...backup, config: { ...backup.config, lazyEnhancementShortcuts: { target: '12' } } }),
    JSON.stringify({ ...backup, config: { ...backup.config, virtualProfiles: [null] } }),
    JSON.stringify({ ...backup, config: { ...backup.config, virtualProfiles: [{ id: 'bad', name: 'bad', values: { enabled: 'false' } }] } }),
    JSON.stringify({ ...backup, storage: { ...backup.storage, authToken: 'replace' } }),
    JSON.stringify({ ...backup, storage: { ...backup.storage, Mooncake_protectionAssistant_enabled_v1: 'false' } }),
    JSON.stringify({ ...backup, warehouses: { '11': { ...partition, version: 2 } } }),
    JSON.stringify({ ...backup, warehouses: { '11': { ...partition, categories: [null] } } }),
    JSON.stringify({ ...backup, warehouses: { '11': { ...partition, memberships: [{ itemHrid: '/items/sword', categoryId: 'custom:missing' }] } } }),
    serialized.replace('"warehouses":{', '"warehouses":{"__proto__":{"polluted":true},'),
    serialized.replace('"ui":{', '"ui":{"constructor":{"prototype":{"polluted":true}},'),
    serialized.replace('"enhancementStandardHourlyM":12', '"enhancementStandardHourlyM":1e999'),
    ' '.repeat(5 * 1024 * 1024 + 1)
];
for (const text of invalid) assert.throws(() => destination.apply(destination.parse(text)), /设置文件无效/);
assert.deepEqual([...destination.storage.values], beforeInvalid, 'invalid files must not mutate storage');
assert.equal({}.polluted, undefined);
console.log(`PASS: ${invalid.length} invalid/unsupported/unsafe/oversized files rejected before any writes.`);

// Each possible write failure must restore exactly the original storage and
// leave the running configuration unchanged (including removed preferences).
const keys = [configKey, ...Object.keys(backup.storage), warehousePrefix + '11'];
for (const failedKey of keys.filter(key => key === configKey || key.startsWith(warehousePrefix) || backup.storage[key] !== null)) {
    const target = device([[configKey, '{"features":{"marketHourlyWage":true}}'],
        ['Mooncake_marketHistory_card_enabled_v1', '0'], [warehousePrefix + '11', '{"version":1,"categories":[],"memberships":[]}'],
        ['authToken', 'UNCHANGED']]);
    const old = new Map(target.storage.values), oldConfig = JSON.stringify(target.backup().config);
    target.storage.failKey = failedKey;
    assert.throws(() => target.apply(target.parse(serialized)), /已恢复原设置/);
    assert.deepEqual(target.storage.values, old, `rollback after failure at ${failedKey}`);
    assert.equal(JSON.stringify(target.backup().config), oldConfig);
}
const full = device([[configKey, '{}'], ['authToken', 'UNCHANGED']]);
const oldFull = new Map(full.storage.values);
full.storage.capacity = 500;
assert.throws(() => full.apply(full.parse(serialized)), /已恢复原设置/);
assert.deepEqual(full.storage.values, oldFull);
console.log('PASS: failed and quota-limited imports roll back; live settings remain unchanged.');

if (process.argv.includes('--serve')) {
    const css = block('            #better-loot-tracker-config-panel [data-mooncake-enhancement-settings-tabpanel="settings"] { display:grid;',
        '            #better-loot-tracker-config-panel [data-mooncake-enhancement-settings-select],');
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>设置迁移检查</title>
    <style>body{margin:24px;background:#151922;color:#dfe7fb;font:14px system-ui}button{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}#better-loot-tracker-config-panel{max-width:1120px;margin:auto}button:disabled{opacity:.5}${css}</style>
    <div id="better-loot-tracker-config-panel"><h2>设置中心</h2><div id="transfer"></div>
    <p>本地测试：初始为设备 A 的设置。先导出，再切换到设备 B，导入同一个文件。</p>
    <button id="device-b">切换到设备 B</button> <button id="narrow">切换窄屏</button><pre id="state"></pre></div>
    <script>(() => {
    ${MemoryStorage.toString()}
    const localStorage = new MemoryStorage(${JSON.stringify([...origin.storage.values])});
    const isZH = true, mooncakeCharacterId = '11'; let reloadCount = 0;
    const window = {confirm: message => globalThis.confirm(message), location: {reload: () => {reloadCount++; show();}}};
    ${supportCode}
    ${transferCode}
    function show(){document.getElementById('state').textContent = JSON.stringify({refreshes:reloadCount,
      standardHourlyM: config.preferences.enhancementStandardHourlyM, marketHourlyWage:config.features.marketHourlyWage,
      profile:config.virtualProfiles?.[0]?.name, partitions:JSON.parse(localStorage.getItem('${warehousePrefix}11') || '{}').categories,
      login:localStorage.getItem('authToken'), history:localStorage.getItem('Mooncake_marketPersonalTradeHistory_v1:11')},null,2);}
    document.getElementById('transfer').appendChild(mooncakeCreateSettingsTransferSection()); show();
    document.getElementById('device-b').onclick=()=>{config.preferences.enhancementStandardHourlyM=99;config.features.marketHourlyWage=true;config.virtualProfiles=[];
      localStorage.setItem('${configKey}',JSON.stringify(config));localStorage.setItem('${warehousePrefix}11','{"version":1,"categories":[],"memberships":[]}');show();};
    document.getElementById('narrow').onclick=()=>{const panel=document.getElementById('better-loot-tracker-config-panel');panel.style.width=panel.style.width?'':'320px';};
    })();</script></html>`;
    const server = createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(html);
    });
    server.listen(0, '127.0.0.1', () => console.log(`Settings transfer UI: http://127.0.0.1:${server.address().port}/`));
}
