import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readEnhancementSource } from './lib/enhancement-cache-harness.mjs';
import { createMarketDependencyHarness } from './lib/market-dependency-harness.mjs';

const candidate = await readEnhancementSource();
const baseline = await readEnhancementSource('4f73d9a');
const copy = value => JSON.parse(JSON.stringify(value));
const h = createMarketDependencyHarness(candidate), reference = createMarketDependencyHarness(baseline);
let comparisons = 0;
function compareRoutes(message) {
    for (const objective of ['standard', 'hourly', 'profit']) {
        h.context.objective = reference.context.objective = objective;
        for (const item of ['/items/equipment', '/items/equipment_refined']) {
            for (const level of [7, 12, 14]) {
                assert.deepEqual(copy(h.pair(item, level)), copy(reference.pair(item, level)), `${message}: ${objective} ${item} +${level}`);
                comparisons++;
            }
        }
    }
    h.context.objective = reference.context.objective = 'standard';
}

compareRoutes('initial quotes');
assert(h.pair()?.selected, 'fixture must produce a valid route');
const first = h.pair();
const firstBuilds = h.counts.candidateBuilds;
const token = h.context.mooncakeGetItemPricingRevision('/items/equipment');
h.update('/items/unrelated', 101); reference.update('/items/unrelated', 101);
assert.equal(h.context.mooncakeGetItemPricingRevision('/items/equipment'), token);
assert.equal(h.counts.candidateBuilds, firstBuilds);
assert.deepEqual(copy(h.pair()), copy(reference.pair()));
assert.equal(h.counts.candidateBuilds, firstBuilds, 'an unrelated quote must not rebuild candidates');
assert.equal(h.pair().highestHourly, first.highestHourly, 'unrelated quotes preserve cached objective results');
console.log('PASS unrelated prices preserve route candidates and objective comparisons');

// Compare the selective implementation to the released full-invalidation path
// after each change, including alternatives that were not previously chosen.
const updates = [
    ['/items/protection_b', 1e6], ['/items/raw', 90e6], ['/items/part_input', 80e6],
    ['/items/equipment', 1e6], ['/items/part_input', 100], ['/items/raw', 100],
    ['/items/part', 100], ['/items/part', -1, -1],
    ['/items/essence', -1, -1], ['/items/log', 1100], ['/items/essence', 450],
    ['/items/philosophers_mirror', 100], ['/items/mirror_input', 10],
    ['/items/refining_crystal', 100], ['/items/refining_crystal', 50e6]
];
for (const update of updates) {
    h.update(...update); reference.update(...update);
    compareRoutes(`quote ${update.join(',')}`);
    if (update[0] === '/items/raw') assert.equal(h.counts.enhancementRefreshes.at(-1), '/items/equipment', 'a material quote refreshes the current equipment detail');
}
console.log(`PASS ${comparisons} route comparisons: protection, recursive crafting, missing quotes, mirrors and refinement match full invalidation`);

// Identical top prices still carry listing IDs/quantities used by age and
// undercut features. Their notifications must survive the pricing fast path.
const before = { revision: h.context.mooncakeGetItemPricingRevision('/items/equipment'), age: h.counts.ageSchedules, notifications: h.counts.listingNotifications };
h.update('/items/equipment', 1e6);
const stableRevision = h.context.mooncakeGetItemPricingRevision('/items/equipment');
h.update('/items/equipment', 1e6);
assert.equal(h.context.mooncakeGetItemPricingRevision('/items/equipment'), stableRevision);
assert(h.counts.ageSchedules > before.age && h.counts.listingNotifications > before.notifications);
console.log('PASS unchanged prices continue age and listing notifications without invalidating prices');

// A complete reset, record eviction or a foreign market snapshot must never
// make an old cache entry appear current.
{
    const c = h.context, previous = c.mooncakeGetItemPricingRevision('/items/equipment');
    c.mooncakeClearEnhancementRouteCache();
    assert.notEqual(c.mooncakeGetItemPricingRevision('/items/equipment'), previous);
    const afterReset = c.mooncakeGetItemPricingRevision('/items/equipment');
    for (let i = 0; i < 300; i++) c.mooncakeGetItemPricingRevision(`/items/evict_${i}`);
    assert(c.mooncakeMarketPricingDependencies.size <= 256);
    assert.notEqual(c.mooncakeGetItemPricingRevision('/items/equipment'), afterReset);
    const foreign = copy(c.getMarketData());
    foreign.marketData['/items/raw'][0].a = 9e8;
    const external = c.mooncakeResolveObjectiveRoutePair('/items/equipment', 14, foreign, 2800e6);
    reference.context.mooncakeClearEnhancementRouteCache();
    const externalReference = reference.context.mooncakeResolveObjectiveRoutePair('/items/equipment', 14, foreign, 2800e6);
    assert.deepEqual(copy(external), copy(externalReference));
}
console.log('PASS complete resets, bounded dependency records and foreign snapshots remain safe');

{
    const { context: c } = createMarketDependencyHarness(candidate);
    const getPlayer = c.getPlayerEnhanceParams;
    c.getPlayerEnhanceParams = () => { throw new Error('fixture input failure'); };
    assert.throws(() => c.mooncakeGetEnhancementRoute('/items/equipment', 14, c.getMarketData(), 2800e6), /fixture input failure/);
    assert.equal(c.mooncakeMarketPricingCapture, null, 'an exception must restore the capture stack');
    assert.equal(c.mooncakeMarketPricingDependencies.get('/items/equipment').complete, false);
    assert(c.mooncakeIsItemPricingAffected('/items/equipment', new Set(['/items/unrelated'])), 'an incomplete dependency record uses a full refresh');
    c.getPlayerEnhanceParams = getPlayer;
    assert(c.mooncakeGetEnhancementRoute('/items/equipment', 14, c.getMarketData(), 2800e6));
    assert.equal(c.mooncakeMarketPricingDependencies.get('/items/equipment').complete, true, 'a successful retry restores selective refresh');
}
console.log('PASS failed calculations restore dependency capture and recover conservatively');

{
    const { context: c, pair } = createMarketDependencyHarness(candidate);
    pair();
    let scheduled = 0;
    const rows = [{ listing: { isSell: true, itemHrid: '/items/equipment', enhancementLevel: 12 } }];
    Object.assign(c, {
        mooncakeIsMyListingsTargetFilterEnabled: () => true, mooncakeMyListingsTargetFilterActive: true,
        mooncakeGetVisibleMyListingsTable: () => ({ querySelectorAll: () => rows }),
        mooncakeGetMyListingRowDescriptor: row => row.listing,
        mooncakeScheduleMyListingsTargetFilter: () => scheduled++
    });
    vm.runInContext(candidate.functions.get('mooncakeNotifyMyListingsTargetFilterMarketUpdate'), c);
    const levels = level => vm.runInContext(`new Set([${level}])`, c);
    c.mooncakeNotifyMyListingsTargetFilterMarketUpdate('/items/unrelated', levels(0), c.mooncakeInvalidateItemPricing('/items/unrelated'));
    assert.equal(scheduled, 0, 'unrelated quotes leave the completed filter intact');
    c.mooncakeNotifyMyListingsTargetFilterMarketUpdate('/items/raw', levels(0), c.mooncakeInvalidateItemPricing('/items/raw'));
    assert.equal(scheduled, 1, 'cost changes re-evaluate the target hourly filter');
    c.mooncakeNotifyMyListingsTargetFilterMarketUpdate('/items/equipment', levels(12));
    assert.equal(scheduled, 2, 'order-ID-only notifications still recheck the exact sale level');
    c.mooncakeNotifyMyListingsTargetFilterMarketUpdate('/items/equipment', levels(13));
    assert.equal(scheduled, 2, 'order-ID-only updates for a different level do not restart the filter');
}
console.log('PASS target hourly filters respond to cost dependencies and retain order-ID updates');

{
    const { context: c, pair, fixture } = createMarketDependencyHarness(candidate);
    pair('/items/equipment', 7);
    const entry = c.mooncakeMarketPricingDependencies.get('/items/equipment');
    assert(!entry.dependencies.has('/items/refining_crystal'));
    c.mooncakeGetRefinementActionForItem = () => ({ ...fixture.relation, shardInputs: [{ itemHrid: '/items/refining_crystal', rawCount: 10 }] });
    c.mooncakeGetRefinementShardQuantity = count => count;
    vm.runInContext(candidate.functions.get('mooncakeBuildRefinementComparison'), c);
    const comparison = c.mooncakeBuildRefinementComparison('/items/equipment', 1400e6, c.getMarketData());
    assert.equal(comparison.refinementCost, 50e6);
    assert(c.mooncakeInvalidateItemPricing('/items/refining_crystal').has('/items/equipment'), 'a refinement comparison adds its shard quote dependency');
    c.mooncakeResetMarketPricingDependencies();
    const incomplete = c.mooncakeGetMarketPricingDependency('/items/equipment');
    c.mooncakeBuildRefinementComparison('/items/equipment', 1400e6, c.getMarketData());
    assert.equal(incomplete.complete, false, 'a tooltip comparison must not mark an uncalculated route as complete');
}
console.log('PASS tooltip refinement comparisons track their own shard quotes without completing unknown routes');
