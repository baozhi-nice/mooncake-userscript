import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

assert.match(source, /createTab\('warehouse', isZH \? '背包管理' : 'Inventory'\)/, 'the unified manager needs an inventory tab');
assert.match(source, /\['shortcuts', 'presets', 'warehouse'\]\.includes\(overlay\.dataset\.activeView\)/, 'the renderer must keep the inventory tab active');
assert.match(source, /if \(activeView === 'warehouse'\) \{\s*mooncakeWarehouseOpenManager\(\{ host \}\);\s*return;/, 'inventory content must render inside the unified manager host');
assert.match(source, /return mooncakeOpenLazyEnhancementSettingsManager\(\s*options\?\.trigger \|\| null,\s*'warehouse'/, 'warehouse entry points must open the unified manager on the inventory tab');
assert.match(source, /trigger: inventoryWarehouseManagerButton,\s*onClose: refreshInventoryWarehouseManagerButton/, 'the settings entry must keep its count refresh callback');
assert.match(source, /_mooncakeLazyEnhancementManagerCloseHandlers/, 'the unified manager must retain warehouse close callbacks');

console.log('Unified enhancement manager checks passed.');
