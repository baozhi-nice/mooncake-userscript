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
    const parameterStart = source.indexOf('(', start);
    let parameterDepth = 0;
    let parameterEnd = -1;
    for (let index = parameterStart; index < source.length; index += 1) {
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

const selectorStart = source.indexOf('const MOONCAKE_SUNNY_MARKET_INFO_SELECTOR');
const selectorEnd = source.indexOf(';', selectorStart);
assert.notEqual(selectorStart, -1, 'Sunny market-info selector must exist');
assert.match(
    source.slice(selectorStart, selectorEnd + 1),
    /\[id\*="sunny" i\][\s\S]*\[class\*="sunny" i\]/,
    'Sunny detection must cover both id and class based market integrations'
);

const conflictStart = source.indexOf('function mooncakeHasSunnyMarketInfoConflict(');
const conflictEnd = source.indexOf('\n    function mooncakeYieldMarketHistoryCardToSunny(', conflictStart);
assert.notEqual(conflictStart, -1, 'Sunny conflict detector must exist');
assert.notEqual(conflictEnd, -1, 'Sunny conflict detector must have a stable boundary');
const conflictDetector = source.slice(conflictStart, conflictEnd);
assert.match(
    conflictDetector,
    /MarketplacePanel_infoContainer/,
    'Sunny coexistence must start from the selected marketplace info container'
);
assert.match(
    conflictDetector,
    /MarketplacePanel_marketplacePanel/,
    'Sunny coexistence must also cover versions that mount beside the info container'
);
assert.match(
    conflictDetector,
    /currentItem\.contains\(marker\)/,
    'a small Sunny control attached directly to the item icon must not suppress the card'
);
assert.match(
    conflictDetector,
    /mooncakeFindSunnyMarketInfoSurface\(marker, container\)/,
    'a nested Sunny marker must resolve to its visible market surface'
);
assert.match(
    conflictDetector,
    /mooncakeDoesSunnyMarketSurfaceOverlapHistoryCard\(surface, currentItem\)/,
    'only Sunny surfaces in the card zone may suppress the transaction card'
);

const overlapHelper = extractFunction('mooncakeDoesSunnyMarketSurfaceOverlapHistoryCard');
const overlapSandbox = {
    document: { getElementById: () => null },
    MOONCAKE_MARKET_HISTORY_CARD_ID: 'MooncakeMarketHistoryCard',
    MOONCAKE_MARKET_HISTORY_ANCHOR_MARGIN: 120,
    Math
};
vm.runInNewContext(`${overlapHelper}\nglobalThis.overlaps = mooncakeDoesSunnyMarketSurfaceOverlapHistoryCard;`, overlapSandbox);
const item = {
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 160, bottom: 160, width: 60, height: 60 })
};
assert.equal(
    overlapSandbox.overlaps({ getBoundingClientRect: () => ({ left: 400, top: 120, right: 700, bottom: 160, width: 300, height: 40 }) }, item),
    true,
    'a Sunny surface over the desktop card area must be treated as a conflict'
);
assert.equal(
    overlapSandbox.overlaps({ getBoundingClientRect: () => ({ left: 180, top: 110, right: 260, bottom: 150, width: 80, height: 40 }) }, item),
    false,
    'a Sunny control outside the card area must not be treated as a conflict'
);

const yieldStart = source.indexOf('function mooncakeYieldMarketHistoryCardToSunny(');
const yieldEnd = source.indexOf('\n    function mooncakeRemoveMarketPersonalTradeHistoryDisplay(', yieldStart);
assert.notEqual(yieldStart, -1, 'Sunny yield helper must exist');
const yieldHelper = source.slice(yieldStart, yieldEnd);
assert.match(yieldHelper, /mooncakeMarketHistoryCardAbortController\?\.abort\(\)/, 'Sunny takeover must abort an in-flight card request');
assert.match(yieldHelper, /mooncakeRemoveMarketHistoryCards\(\{ includeFloating: true \}\)/, 'Sunny takeover must remove both anchored and floating Mooncake cards');

assert.match(
    source,
    /if \(!isMobile && mooncakeYieldMarketHistoryCardToSunny\(target\.currentItem\)\) return null;/,
    'direct card rendering must yield to Sunny before the anchored card is inserted'
);
assert.match(
    source,
    /if \(!mooncakeIsPhoneMarketUi\(\) && mooncakeYieldMarketHistoryCardToSunny\(target\.currentItem\)\) return;/,
    'the async card loader must yield before starting a market-history request'
);

console.log('Sunny market card avoidance checks passed.');
