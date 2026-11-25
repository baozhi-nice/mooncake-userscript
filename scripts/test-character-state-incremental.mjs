import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readEnhancementSource } from './lib/enhancement-cache-harness.mjs';
import { createEnhancementHarness } from './lib/enhancement-cache-harness.mjs';
import { characterFixture, createCharacterStateHarness } from './lib/character-state-harness.mjs';

const source = await readEnhancementSource();
const baselineFile = process.argv.find(value => value.startsWith('--baseline-file='))?.slice(16);
const baseline = await readEnhancementSource('4f73d9a', baselineFile);
const current = createCharacterStateHarness(source), reference = createCharacterStateHarness(baseline);
const initial = characterFixture();
for (const h of [current, reference]) { h.setGame(initial); h.feed(initial); h.advance(120); }
assert.deepEqual(current.state(), reference.state());
const start = { ...current.counts };
const inventory = (hrid, count, level = 0) => ({ itemHrid: hrid, count, enhancementLevel: level, itemLocationHrid: '/item_locations/inventory' });
const action = (id, ordinal = id) => ({ id, ordinal, actionHrid: '/actions/milking/milk', isDone: false });
const messages = [
    ...Array.from({ length: 30 }, (_, index) => ({ type: 'skills_updated', endCharacterSkills: [{ skillHrid: '/skills/milking', level: 100, experience: 100 + index }] })),
    { type: 'items_updated', endCharacterItems: [inventory('/items/milk', 11), inventory('/items/cheese', 4)] },
    { type: 'items_updated', endCharacterItems: [inventory('/items/milk', 0), inventory('/items/cheese', 6), inventory('/items/equipment', 1, 7)] },
    { type: 'items_updated', endCharacterItems: [inventory('/items/equipment', 0, 7), inventory('/items/equipment', 1, 8)] },
    { type: 'skills_updated', endCharacterSkills: [{ skillHrid: '/skills/enhancing', level: 157, experience: 101 }] },
    { type: 'items_updated', endCharacterItems: [{ ...initial.characterItems[0], enhancementLevel: 19 }] },
    { type: 'items_updated', endCharacterItems: [{ ...initial.characterItems[1], count: 0 }] },
    { type: 'house_rooms_updated', characterHouseRoomMap: { '/house_rooms/laboratory': { houseRoomHrid: '/house_rooms/laboratory', level: 9 } } },
    { type: 'action_type_consumable_slots_updated', actionTypeDrinkSlotsMap: { '/action_types/enhancing': ['/items/super_enhancing_tea'] } },
    { type: 'community_buffs_updated', communityActionTypeBuffsMap: { fixtureLevel: 2 } },
    { type: 'actions_updated', endCharacterActions: [action(2), action(3), { id: 1, isDone: true }] },
    { type: 'action_completed', endCharacterAction: { ...action(2), repeatCount: 20 }, endCharacterItems: [inventory('/items/cheese', 8)], endCharacterSkills: [{ skillHrid: '/skills/milking', level: 100, experience: 200 }] },
    { type: 'actions_updated', endCharacterActions: [{ id: 2, isDone: true }, action(3, 0)] }
];
for (const [index, message] of messages.entries()) {
    current.feed(message); reference.feed(message);
    assert.deepEqual(current.state(), reference.state(), `incremental state differs after message ${index}: ${message.type}`);
}
assert.equal(current.counts.signatureBuilds - start.signatureBuilds, 6, 'only enhancement-relevant changes build calculation signatures');
assert.equal(current.context.mooncakeCharacterStateSyncTimer, 0, 'complete deltas should not queue full reads');
current.advance(2500);
assert.equal(current.counts.syncReads, start.syncReads);
assert.equal(JSON.parse(current.storage.get('snapshot')).characterSkills.find(skill => skill.skillHrid === '/skills/milking').experience, 200);
console.log('PASS complete skill, inventory, gear, house, tea, community and action deltas match the baseline; XP and inventory avoid calculation invalidation');

// Recovery reads get the native model, so malformed or incomplete updates are
// repaired rather than being declared complete and cached indefinitely.
for (const message of [
    { type: 'skills_updated', endCharacterSkills: [{ skillHrid: '/skills/enhancing', experience: 999 }] },
    { type: 'items_updated', endCharacterItems: [{ itemHrid: '/items/milk', count: 2 }] },
    { type: 'actions_updated', endCharacterActions: [{ id: 30 }] },
    { type: 'house_rooms_updated' }, { type: 'community_buffs_updated', communityActionTypeBuffsMap: 'invalid' },
    { type: 'action_completed', endCharacterItems: [] }
]) {
    current.setGame(initial); current.feed(message);
    const before = current.counts.syncReads;
    current.advance(100);
    assert.equal(current.counts.syncReads, before + 1, `no recovery for ${message.type}`);
    assert.equal(current.state().skills[0].level, 156);
}
console.log('PASS incomplete deltas, missing fields and unrecognized action shapes recover from full native state');

const stable = { ...current.counts };
current.context.mooncakeSyncCharacterDataFromGameState();
current.context.mooncakeSyncCharacterDataFromGameState();
assert.equal(current.counts.snapshotWrites, stable.snapshotWrites, 'identical native snapshots should not rewrite session storage');
current.advance(60001);
current.feed({ type: 'skills_updated', endCharacterSkills: [{ skillHrid: '/skills/milking', level: 100, experience: 300 }] });
const reads = current.counts.syncReads;
current.advance(100);
assert.equal(current.counts.syncReads, reads + 1, 'periodic consistency recovery was removed');
console.log('PASS unchanged snapshot writes are deduplicated and periodic consistency reads remain');

current.feed({ type: 'achievement_buffs_updated', achievementActionTypeBuffsMap: { '/action_types/enhancing': [{ uniqueHrid: '/buff_uniques/achievement_champion_enhancing' }] } });
assert.equal(current.context.mooncakeHasChampionAchievement(), true);
const other = characterFixture('two');
current.feed(other); current.setGame(initial); current.advance(120);
assert.equal(current.state().id, 'two', 'a delayed old-character native snapshot replaced the new character');
assert.equal(current.context.mooncakeHasChampionAchievement(), false);
current.setGame(other); current.context.mooncakeScheduleCharacterStateSync(); current.advance(100);
assert.equal(current.state().id, 'two');
current.setGame({ ...initial, character: undefined });
assert.equal(current.context.mooncakeSyncCharacterDataFromGameState(), false, 'a native state without a character identity was accepted after a stream switch');
assert.equal(current.state().id, 'two');
console.log('PASS achievement buffs update directly; switching characters rejects stale native state');

current.feed({ type: 'loot_opened', endCharacterItems: [inventory('/items/milk', 15)], endCharacterSkills: [{ skillHrid: '/skills/milking', level: 100, experience: 400 }] });
assert.equal(current.state().inventory.find(item => item.itemHrid === '/items/milk').count, 15);
current.feed({ type: 'market_listings_updated', endCharacterItems: [inventory('/items/milk', 12)] });
assert.equal(current.state().inventory.find(item => item.itemHrid === '/items/milk').count, 12);
const filterConstants = source.source.slice(source.source.indexOf('    const BLT_WS_MESSAGE_TYPES ='), source.source.indexOf('    const BLT_WS_MARKET_ITEM_HRID_PATTERN ='));
vm.runInContext(filterConstants + '\n' + source.functions.get('shouldParseBltWsMessage'), current.context);
assert(current.context.shouldParseBltWsMessage(JSON.stringify({ type: 'loot_opened', endCharacterItems: [] })));
assert(!current.context.shouldParseBltWsMessage(JSON.stringify({ type: 'chat_message', text: 'hello' })));
console.log('PASS trade and other native end-item/skill deltas stay current without parsing unrelated chat');

const virtual = createEnhancementHarness(source);
virtual.context.config.virtual.enabled = true;
virtual.context.mooncakeScheduleCharacterDependentRefresh({ refreshVirtualCommunityBuff: true });
virtual.context.mooncakeScheduleCharacterDependentRefresh({ refreshVirtualCommunityBuff: false });
virtual.flushTimers();
assert(virtual.counts.snapshotRefreshes > 0, 'a later ordinary update suppressed the pending virtual community-buff refresh');
console.log('PASS merged refresh requests retain the virtual community-buff update');
