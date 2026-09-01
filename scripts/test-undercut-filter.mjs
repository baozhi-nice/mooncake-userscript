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
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unable to extract ${name}`);
}

const functionNames = [
    'mooncakeNormalizeMyListingId',
    'mooncakeNormalizeMyListingComparablePrice',
    'mooncakeIsMyListingStrictlyUndercut',
    'mooncakeGetMyListingPriceGroupKey',
    'mooncakeGetMyListingSidePriceGroupKey',
    'mooncakeIsMyListingActiveForUndercut',
    'mooncakeGetMyListingBestOtherOrderPrice',
    'mooncakeMyListingMatchesTargetHourly'
];

const sandbox = {};
vm.runInNewContext(`
    let liveBook = null;
    const mooncakeGetMyListingsLiveOrderBook = () => liveBook;
    const mooncakeGetItemDetailOfHrid = () => ({});
    const mooncakeIsEnhanceableItem = () => true;
    const getPriceTier = price => price - 1;
    const calcHourlyWageAndMetrics = () => ({ hourlyWage: 20_000_000 });
    ${functionNames.map(extractFunction).join('\n')}
    globalThis.helpers = {
        setBook: value => { liveBook = value; },
        bestOther: mooncakeGetMyListingBestOtherOrderPrice,
        matches: mooncakeMyListingMatchesTargetHourly
    };
`, sandbox);

const listing = {
    listingId: 11,
    itemHrid: '/items/test_item',
    enhancementLevel: 10,
    isSell: true,
    isActive: true,
    price: 100
};
const groupKey = 'sell\u0000/items/test_item\u000010';
const context = {
    activeListingIdsBySideAndGroup: new Map([[groupKey, new Set([11])]]),
    activePricesBySideAndGroup: new Map([[groupKey, new Set([100])]])
};
const marketData = { marketData: { '/items/test_item': { 10: { a: 100 } } } };

sandbox.helpers.setBook({ asks: [{ listingId: 11, price: 100 }, { listingId: 99, price: 105 }] });
assert.equal(
    sandbox.helpers.bestOther(listing, context).price,
    105,
    'the live book must skip the player\'s own left-one order by listing ID'
);
const ownFirstRow = {};
assert.equal(
    sandbox.helpers.matches(ownFirstRow, marketData, 10_000_000, { ...context, descriptors: new Map([[ownFirstRow, listing]]) }),
    false,
    'a higher external ask must not make the player undercut their own left-one order'
);

const qualifyingRow = {};
sandbox.helpers.setBook({ asks: [{ listingId: 99, price: 80 }, { listingId: 11, price: 100 }] });
assert.equal(
    sandbox.helpers.matches(qualifyingRow, marketData, 10_000_000, { ...context, descriptors: new Map([[qualifyingRow, listing]]) }),
    true,
    'a lower external ask must remain eligible when the next undercut meets the target'
);

const fallbackRow = {};
sandbox.helpers.setBook(null);
assert.equal(
    sandbox.helpers.matches(fallbackRow, marketData, 10_000_000, { ...context, descriptors: new Map([[fallbackRow, listing]]) }),
    false,
    'the quote fallback must not treat a known own price as an external left-one order'
);

assert.match(source, /const message = isZH \? `符合 \$\{shown\}\/\$\{rows\.length\}`/, 'status must only show the compact match count');
assert.doesNotMatch(source, /保留 \$\{unresolved\} 条未判定/, 'status must not append unresolved-row details');
assert.match(source, /const needsExactOrderBook = mooncakeMyListingsTargetFilterActive \|\|/, 'active target filtering must retain exact live order books');

console.log('Undercut filter checks passed.');
