import assert from 'node:assert/strict';
import { readEnhancementSource, createEnhancementHarness, baseParameters } from './lib/enhancement-cache-harness.mjs';
import { createProbabilityHarness } from './lib/probability-task-harness.mjs';

const version = await readEnhancementSource(), baseline = await readEnhancementSource('4f73d9a');
const close = (actual, expected, label) => assert(Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected)), label + ': ' + actual + ' != ' + expected);
{
    const h = createProbabilityHarness(version), c = h.context;
    const first = c.mooncakeEnsureEnhancementRoutePrewarm('/items/a', 12);
    const second = c.mooncakeEnsureEnhancementRoutePrewarm('/items/b', 12);
    const higher = c.mooncakeEnsureEnhancementRoutePrewarm('/items/c', 14);
    assert.equal(c.enhancelateWorkerInFlight.size, 184, 'overlapping surfaces enqueue each probability job once');
    h.tick();
    assert(h.posts[0].jobs.length <= 8, 'a cold profile must not monopolize the worker');
    h.deliver(); await Promise.resolve();
    assert.equal(first.ready, false, 'a partial batch marked an unfinished profile ready');
    await h.drain();
    assert.deepEqual(await Promise.all([first.promise, second.promise, higher.promise]), [true, true, true]);
    const jobs = h.posts.flatMap(post => post.jobs);
    assert.equal(jobs.length, 184); assert.equal(new Set(jobs.map(job => job.key)).size, 184);
    assert(h.posts.every(post => post.jobs.length <= 8));
    assert.equal(c.enhancelateWorkerInFlight.size, 0); assert.equal(h.timers.size, 0);
    const screenshotKey = c.buildEnhancelateCacheKey(12, 7, 90, c.player);
    const screenshot = c.enhancelateCache.get(screenshotKey);
    close(screenshot.actions, 6301.174414285177, 'screenshot attempt count');
    close(screenshot.protectCount, 59.48103203935401, 'screenshot protection count');
    const profit = 1960e6 * .96 - 380010723 - screenshot.actions * 108803 - screenshot.protectCount * 9e6;
    close(profit / (screenshot.actions * c.calcEnhancingSecondsPerAction('/items/a') / 3600), 35584880.47099592, 'screenshot hourly wage');
    const count = h.posts.length;
    assert.equal(c.mooncakeEnsureEnhancementRoutePrewarm('/items/a', 12), first);
    assert.equal(h.posts.length, count, 'hot data restarted a worker batch');
}
console.log('PASS shared/overlapping requests compute 184 distinct jobs in worker batches of at most eight; hot reads remain immediate');

let comparisons = 0;
for (const item of ['/items/gear', '/items/gear_85']) {
    for (const overrides of [
        {}, { tea_ultra_enhancing: false, tea_super_enhancing: true },
        { tea_ultra_enhancing: false, tea_enhancing: true, champion_achievement: false },
        { tea_blessed: false, drink_concentration_bonus: 0 }
    ]) {
        const h = createProbabilityHarness(version), c = h.context, reference = createEnhancementHarness(baseline).context;
        const pending = c.prewarmEnhancelateLevels(item, [7, 12, 14], {
            includeExact: true, startLevels: [3, 6], protectionLevels: [1, 2, 6, 7, 10, 12, 14], overrideParams: overrides
        });
        await h.drain(); assert.equal(await pending, true);
        assert.equal(h.counts.inversions, 0, 'worker preparation performed a main-thread matrix inversion');
        for (const target of [7, 12, 14]) for (const protect of [1, 2, 6, 7, 10, 12, 14].filter(value => value <= target)) {
            const key = c.buildEnhancelateCacheKey(target, protect, c.getBaseItemLevel(item), { ...baseParameters, ...overrides });
            for (const start of [0, 3, 6]) {
                const result = c.enhancelateCache.get(start ? key + ':start=' + start : key);
                const expected = reference.Enhancelate(item, target, protect, overrides, start);
                for (const field of ['actions', 'protectCount', 'exp']) close(result[field], expected[field], item + ' +' + target + ' start ' + start + ' ' + field);
                comparisons++;
            }
            if (overrides.tea_blessed !== false) {
                const result = c.mooncakeExactEnhancelateCache.get('exact:' + key);
                const expected = reference.mooncakeEnhancelateExactLevel(item, target, protect, overrides);
                for (const field of ['actions', 'protectCount', 'exp', 'baseItemCount', 'overshootProbability']) close(result[field], expected[field], 'exact ' + field);
                comparisons++;
            }
        }
    }
}
console.log('PASS ' + comparisons + ' ordinary/exact/nonzero-start worker results match independent production mathjs calculations');

{
    const h = createProbabilityHarness(version), c = h.context;
    const history = c.mooncakeEnsureEnhancementRoutePrewarm('/items/history', 14, { priority: 'background' });
    h.tick();
    const foreground = c.mooncakeEnsureEnhancementRoutePrewarm('/items/current_85', 20);
    h.deliver(); h.tick();
    assert.equal(h.posts[1].context.itemLevel, 85, 'interactive work waited behind an entire historical profile');
    while (h.posts.length < 7) { h.deliver(); h.tick(); }
    assert(h.posts.slice(2, 7).some(post => post.context.itemLevel === 90), 'background jobs starved');
    await h.drain(); assert.equal(await history.promise, true); assert.equal(await foreground.promise, true);
}
console.log('PASS interactive work takes the next worker slot and waiting history still makes progress');

{
    const h = createProbabilityHarness(version), c = h.context;
    const first = c.prewarmEnhancelateLevels('/items/a', [12]);
    c.player = { ...c.player, glove_bonus: 25, community_enhancing_speed_bonus: 10 };
    const speed = c.prewarmEnhancelateLevels('/items/b', [12]);
    assert.equal(c.enhancelateWorkerInFlight.size, 11, 'speed changes duplicated pending probability tasks');
    c.player = { ...c.player, champion_achievement: false };
    const champion = c.prewarmEnhancelateLevels('/items/c', [12]);
    assert.equal(c.enhancelateWorkerInFlight.size, 22, 'champion probability inputs were incorrectly shared');
    await h.drain(); assert.deepEqual(await Promise.all([first, speed, champion]), [true, true, true]);
}
console.log('PASS speed-only changes share pending tasks while changed probability inputs remain isolated');

for (const failure of ['unavailable', 'post', 'error', 'timeout']) {
    const h = createProbabilityHarness(version, { worker: failure !== 'unavailable', failPost: failure === 'post' }), c = h.context;
    const first = c.prewarmEnhancelateLevels('/items/a', [12], { startLevel: 3, includeExact: true });
    const second = c.prewarmEnhancelateLevels('/items/b', [12], { startLevel: 3, includeExact: true });
    h.tick();
    if (failure === 'error') c.enhancelateWorker.onerror();
    if (failure === 'timeout') [...h.timers.values()].find(timer => timer.delay === 5000).callback();
    const result = await h.drain();
    assert.deepEqual(await Promise.all([first, second]), [true, true], failure + ' did not recover');
    assert(result.maxInversionsPerTurn <= 1, failure + ' fell back to a burst of main-thread inversions');
    assert.equal(c.enhancelateWorkerInFlight.size, 0); assert.equal(c.enhancelateWorkerPending.size, 0);
    assert.equal(h.timers.size, 0);
}
console.log('PASS unavailable/error/timeout/post failures share paced fallback, at most one main-thread solve per turn');

{
    const h = createProbabilityHarness(version), c = h.context;
    const old = c.prewarmEnhancelateLevels('/items/a', [12]); h.tick(); const stale = h.posts[0];
    c.mooncakeClearEnhancementCalculationCaches(); assert.equal(await old, false);
    const fresh = c.prewarmEnhancelateLevels('/items/a', [12]); h.tick();
    h.deliver(stale); assert.equal(c.enhancelateCache.size, 0, 'a stale reply repopulated cleared data');
    await h.drain(); assert.equal(await fresh, true);
    let current = true;
    const obsolete = c.mooncakeWaitForEnhancementRoutePrewarm('/items/later_85', 12, { isCurrent: () => current });
    current = false; await h.drain(); assert.equal(await obsolete, false);
}
console.log('PASS full resets reject late replies and closed/changed consumers cannot publish old prepared results');

{
    const h = createProbabilityHarness(version), c = h.context;
    c.ENHANCELATE_CACHE_LIMIT = c.MOONCAKE_EXACT_ENHANCELATE_CACHE_LIMIT = 16;
    const first = c.mooncakeEnsureEnhancementRoutePrewarm('/items/a', 5); await h.drain(); assert(first.ready);
    const other = c.mooncakeEnsureEnhancementRoutePrewarm('/items/b_85', 5); await h.drain(); assert(other.ready);
    const restored = c.mooncakeEnsureEnhancementRoutePrewarm('/items/a', 5);
    assert.equal(restored.ready, false, 'evicted probabilities incorrectly remained ready');
    await h.drain(); assert.equal(await restored.promise, true);
}
console.log('PASS bounded cache eviction wakes preparation rather than falling back to synchronous cold calculations');

{
    const h = createProbabilityHarness(version, { worker: false }), c = h.context;
    const states = ['/items/a', '/items/b_85'].map(item => c.mooncakeEnsureEnhancementRoutePrewarm(item, 20));
    const result = await h.drain();
    assert.deepEqual(await Promise.all(states.map(state => state.promise)), [true, true], 'full +1..20 fallback did not prepare every required matrix');
    assert(result.maxInversionsPerTurn <= 1);
    const ordinary = c.Enhancelate('/items/a', 1, 1);
    const exact = c.mooncakeEnhancelateExactLevel('/items/a', 1, 1);
    const blessedEffect = .01 * (1 + c.player.drink_concentration_bonus / 100);
    assert.equal(exact.exactTarget, true, 'the scalar matrix fell through to an approximate +1 result');
    close(exact.actions, ordinary.actions / (1 - blessedEffect), 'scalar exact +1 attempts');
    close(exact.baseItemCount, 1 / (1 - blessedEffect), 'scalar exact +1 replacement bases');
}
{
    const h = createProbabilityHarness(version), c = h.context;
    const current = c.mooncakeEnsureEnhancementRoutePrewarm('/items/a', 12, { onlyTarget: true });
    assert.equal(c.enhancelateWorkerInFlight.size, 11, 'a simple +12 price warmed unrelated target levels');
    await h.drain(); assert.equal(await current.promise, true);
    const states = Array.from({ length: 300 }, (_, index) => c.mooncakeEnsureEnhancementRoutePrewarm('/items/item_' + index, 1, { onlyTarget: true }));
    assert(c.mooncakeEnhancementRoutePrewarmState.size <= 256);
    await h.drain(); assert((await Promise.all(states.map(state => state.promise))).every(Boolean));
}
console.log('PASS full +1..20 fallback, selective low-level preparation and bounded ready-state records');
