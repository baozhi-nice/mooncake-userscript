import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

assert.match(source, /@media \(min-width:1320px\)/, 'wide settings layout must have a dedicated breakpoint');
assert.match(
    source,
    /grid-template-areas:"market market listings chat" "enhance enhance enhance enhance" "quote quote quote quote"/,
    'wide settings must keep the quote after the compacted sections'
);
assert.match(
    source,
    /data-mooncake-enhancement-settings-group="market"\] \[data-mooncake-enhancement-settings-rows\] \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    'market settings must use two columns on wide screens'
);
assert.match(
    source,
    /grid-template-areas:"lazy inventory queue-next" "route protection buff" "anti-suicide-enhancement anti-suicide-alchemy style" "reminder reminder-level base-cost"/,
    'enhancement settings must use the compact three-column grid'
);
assert.match(source, /isZH \? '棒棒糖按钮🍭' : 'Lollipop button'/, 'lollipop visibility should use the merged setting title');
assert.match(source, /isZH \? '包子页签或按Ctrl\+Alt\+D隐藏\/显示'/, 'lollipop visibility should explain both restore paths');
assert.doesNotMatch(source, /data-mooncake-enhancement-settings-fab-shortcut/, 'lollipop shortcut must not render as a separate settings card');
assert.match(source, /baseItemCostPricePolicyRow\.setAttribute\('data-mooncake-settings-enhance-row', 'base-cost'\)/, 'base cost policy must live in the enhancement grid');
assert.doesNotMatch(source, /data-mooncake-enhancement-settings-group="market"\] \[data-mooncake-base-item-cost-price-policy\] \{ grid-column:1 \/ -1; \}/, 'base cost policy must not span both market columns');
assert.match(source, /data-mooncake-enhancement-settings-easter-egg\] \{ margin:6px 0 0/, 'quote spacing must stay compact');

console.log('Settings layout checks passed.');
