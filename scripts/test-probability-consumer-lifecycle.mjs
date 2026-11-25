import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readEnhancementSource } from './lib/enhancement-cache-harness.mjs';
import { createProbabilityHarness } from './lib/probability-task-harness.mjs';

const version = await readEnhancementSource();
for (const change of ['latest-cost', 'generation', 'recycled-message', 'closed', 'hidden', 'profile']) {
    const h = createProbabilityHarness(version), c = h.context, bubbles = [];
    const link = {}, message = { removeAttribute() {} };
    const parsed = { hrid: '/items/gear', level: 12, price: 1960e6, isEnhanceable: true, marketLink: link };
    const placeholder = { isConnected: true, remove() { this.isConnected = false; } };
    let queued, rescans = 0, drains = 0, cost = 100, hidden = false, current = [parsed];
    Object.assign(c, {
        mooncakeChatComputeGeneration: 0, mooncakeChatSeqBusy: true, MOONCAKE_CHAT_INJECTED_ATTR: 'processed',
        insertMooncakeChatPlaceholder: () => placeholder, enqueueMooncakeChatCompute: fn => { queued = fn; },
        isChatLaborEnabled: () => true, parseMooncakeChatListingLinks: () => current,
        processMooncakeChatMessage: () => rescans++, drainMooncakeChatSeq: () => drains++,
        mooncakeDeferVisibleRefresh: name => hidden && name === 'chat-labor', refreshMooncakeChatLabor() {},
        getMarketData: () => ({ cost }),
        calcHourlyWageAndMetrics: (item, level, data) => ({ cost: data.cost, simulation: c.Enhancelate(item, level, 7) }),
        injectMooncakeChatLaborBubble: (element, result, item) => bubbles.push({ result, item })
    });
    vm.runInContext(version.functions.get('stepMooncakeChatSeq'), c);
    const entry = { msgEl: message, parsedList: [parsed], idx: 0 };
    c.stepMooncakeChatSeq(entry); const pending = queued();
    if (change === 'latest-cost') cost = 200;
    if (change === 'generation') { c.mooncakeChatComputeGeneration++; c.mooncakeChatSeqBusy = true; }
    if (change === 'recycled-message') current = [{ ...parsed, hrid: '/items/other' }];
    if (change === 'closed') placeholder.isConnected = false;
    if (change === 'hidden') hidden = true;
    if (change === 'profile') c.player = { ...c.player, tea_ultra_enhancing: false, tea_super_enhancing: true };
    await h.drain(); await pending;
    if (change === 'latest-cost') {
        assert.equal(bubbles[0].result.cost, 200, 'chat used pre-wait material prices');
        assert.equal(h.counts.inversions, 0);
    } else if (change === 'profile') {
        assert.equal(bubbles.length, 1);
        assert(Math.abs(bubbles[0].result.simulation.actions - 6381.187242935053) < 1e-6);
        assert.equal(h.counts.inversions, 0, 'new parameters fell through to a synchronous cold solve');
    } else {
        assert.equal(bubbles.length, 0, change + ' published an obsolete chat bubble');
        if (change === 'generation') assert.equal(c.mooncakeChatSeqBusy, true, 'old completion cleared the new consumer lock');
        else assert.equal(drains, 1, 'chat queue did not continue after skipping old work');
        if (change === 'recycled-message') { assert.equal(rescans, 1); assert.equal(entry.idx, entry.parsedList.length); }
    }
}
console.log('PASS chat uses latest costs/profile and skips closed, hidden, recycled or replaced consumers without blocking its queue');

for (const change of ['latest-record', 'recycled-row', 'closed', 'new-wait']) {
    const h = createProbabilityHarness(version), c = h.context, rendered = [];
    let signature = 'record-one', pendingNode = null;
    const data = { itemHrid: '/items/gear', startLevel: 3, enhanceCount: 10, drops: { 12: 1 } };
    const row = {
        isConnected: true, current: data,
        ownerDocument: { createElement: () => ({ style: {}, remove() { pendingNode = null; } }) },
        querySelector(selector) {
            if (selector === '.enhancement-loot-tracker-pending') return pendingNode;
            if (selector.startsWith('div > span')) return { after(node) { pendingNode = node; } };
            return null;
        }
    };
    Object.assign(c, {
        isZH: true, lootConfigs: new WeakMap(), getGlobalPreferenceLevels: () => [12],
        applyPreferredTarget: value => value, mooncakeResolveGenericBaseItemPrice: () => ({ price: 100e6 }),
        getLootLogRecordSignature: () => signature, parseEnhancementLoot: element => element.current,
        getMarketData: () => ({ marketData: {} }), processLootLogs() {}
    });
    vm.runInContext(version.functions.get('analyzeEnhancementResult') + '\n' + version.functions.get('displayEnhancementInfo'), c);
    const display = c.displayEnhancementInfo;
    // The production function performs its real preparation. Its completion
    // invokes the renderer again; capture that call before unrelated UI layout.
    c.displayEnhancementInfo = (...args) => rendered.push(args);
    display(row, data, c.analyzeEnhancementResult(data), c.getMarketData());
    assert(pendingNode, 'loot did not expose pending work');
    if (change === 'latest-record') row.current = { ...data, enhanceCount: 99, drops: { 12: 2 } };
    if (change === 'recycled-row') signature = 'record-two';
    if (change === 'closed') row.isConnected = false;
    if (change === 'new-wait') row._mooncakeLootProbabilityWait = {};
    await h.drain();
    if (change === 'latest-record') {
        assert.equal(rendered.length, 1);
        assert.equal(rendered[0][1].enhanceCount, 99, 'loot replayed an obsolete parsed snapshot');
        assert.equal(rendered[0][2].targetLevel, 13, 'loot did not re-analyze updated native drops');
    } else assert.equal(rendered.length, 0, change + ' accepted old loot work');
}
console.log('PASS loot re-reads native results after preparation and rejects reused, closed or replaced rows');

{
    const h = createProbabilityHarness(version), c = h.context;
    let hidden = true, resume;
    c.mooncakeDeferVisibleRefresh = (name, callback) => { if (!hidden) return false; resume = callback; return true; };
    const pending = c.prewarmEnhancelateLevels('/items/a', [12]); h.tick();
    assert.equal(h.posts.length, 0, 'hidden probability work was dispatched');
    assert(c.mooncakeProbabilityTasks.queue.size > 0);
    hidden = false; resume(); await h.drain(); assert.equal(await pending, true);
}
console.log('PASS hidden-page probability preparation pauses and resumes without losing waiting consumers');
