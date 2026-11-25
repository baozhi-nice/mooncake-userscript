import vm from 'node:vm';
import assert from 'node:assert/strict';

export function characterFixture(id = 'one') {
    return {
        type: 'init_character_data', character: { id },
        characterSkills: [{ skillHrid: '/skills/enhancing', level: 156, experience: 10 }, { skillHrid: '/skills/milking', level: 100, experience: 20 }],
        characterItems: [
            { itemHrid: '/items/starry_enhancer', enhancementLevel: 20, itemLocationHrid: '/item_locations/enhancing_tool', count: 1 },
            { itemHrid: '/items/enchanted_gloves', enhancementLevel: 14, itemLocationHrid: '/item_locations/hands', count: 1 },
            { itemHrid: '/items/milk', enhancementLevel: 0, itemLocationHrid: '/item_locations/inventory', count: 10 }
        ],
        characterBuffs: [], characterHouseRoomMap: { '/house_rooms/laboratory': { houseRoomHrid: '/house_rooms/laboratory', level: 8 } },
        actionTypeDrinkSlotsMap: { '/action_types/enhancing': ['/items/ultra_enhancing_tea', '/items/blessed_tea'] },
        achievementActionTypeBuffsMap: {}, communityActionTypeBuffsMap: {},
        characterActions: [{ id: 1, actionHrid: '/actions/enhancing/enhance', ordinal: 0, isDone: false, primaryItemHash: 'equipment::0' }]
    };
}

export function createCharacterStateHarness(version) {
    let now = 1000000, nextId = 0;
    const timers = new Map(), storage = new Map(), listeners = new Map();
    const counts = { syncReads: 0, signatureBuilds: 0, snapshotWrites: 0, calculationRefreshes: 0, inventoryRefreshes: 0 };
    let gameState = null;
    const noop = () => {};
    const c = vm.createContext({
        console, Date: { now: () => now }, JSON,
        characterItems: null, characterInventoryItems: null, characterSkills: null, characterBuffs: null,
        characterHouseRoomMap: null, characterActionTypeDrinkSlotsMap: null,
        characterAchievementActionTypeBuffsMap: null, characterCommunityActionTypeBuffsMap: null,
        mooncakeCharacterId: null, mooncakeCharacterDataSource: 'none', mooncakeCharacterCalcSignature: '',
        mooncakeCharacterActions: [], mooncakeCharacterActionsRevision: 0, mooncakeCharacterActionsSource: 'none',
        mooncakeCharacterStateSyncTimer: 0, mooncakeInventoryLiveSyncAt: 0,
        mooncakeCharacterIncrementalReady: false, mooncakeCharacterStreamId: null, mooncakeLastCharacterStateSyncAt: 0,
        MOONCAKE_CHARACTER_RECONCILE_INTERVAL_MS: 60000,
        MOONCAKE_ENHANCING_ACTION_TYPE_HRID: '/action_types/enhancing',
        mooncakeCharacterSnapshotTimer: 0, mooncakeCharacterSnapshotContent: '', mooncakeCharacterSnapshotWrittenAt: 0,
        MOONCAKE_CHARACTER_SNAPSHOT_KEY: 'snapshot', MOONCAKE_CHARACTER_SNAPSHOT_TTL: 12 * 60 * 60 * 1000,
        mooncakeWarehouseObservedRoot: null, mooncakeWarehouseObservedRootVisible: false, mooncakeWarehouseInventoryStateSignature: '',
        mooncakePendingInstantMarketTrades: [], config: { virtual: { enabled: false } }, itemDetailMap: {},
        window: { addEventListener(name, callback) { listeners.set(name, callback); } },
        sessionStorage: { setItem(key, value) { counts.snapshotWrites++; storage.set(key, value); }, getItem: key => storage.get(key) ?? null },
        setTimeout(callback, delay) { timers.set(++nextId, { callback, at: now + delay }); return nextId; },
        clearTimeout: id => timers.delete(id),
        mooncakeFindGameStateNode() { counts.syncReads++; return gameState; },
        mooncakeGetLiveEnhancingCommunityBuffLevel: () => Number(c.characterCommunityActionTypeBuffsMap?.fixtureLevel) || 0,
        mooncakeGetVirtualEnhancingCommunityBuffLevel: () => 'system',
        mooncakeScheduleCharacterDependentRefresh: () => counts.calculationRefreshes++,
        mooncakeIsEnhancementInventoryWarehouseEnabled: () => false,
        mooncakeScheduleWarehouseRender: () => counts.inventoryRefreshes++,
        mooncakeWarehouseHandleCharacterChange: noop, mooncakeWarehouseSyncStableQueueActions: noop,
        mooncakeWarehouseApplyAuthoritativeActionUpdates: noop, mooncakeWarehouseStageCompletedEnhanceAction: noop,
        mooncakeScheduleEnhancementStopReminder: noop, mooncakeCaptureOwnListingAnchors: noop,
        mooncakeUpdateListingFundsListings: noop, mooncakeScheduleMarketTradeLogCapture: noop,
        mooncakeRecordMarketPersonalTradeHistory: noop, mooncakeResolvePendingInstantMarketTrades: noop,
        scheduleMooncakeEnhanceProtectionBuyBox: noop
    });
    const names = ['mooncakeCollectionValues', 'mooncakeCollectionEntries', 'mooncakeMapToObject', 'mooncakeGetMapEntry',
        'mooncakeRelevantCharacterItems', 'mooncakeInventoryCharacterItems', 'mooncakeCollectItemHrids', 'mooncakeGetEnhancingDrinkHrids',
        'mooncakeGetAchievementTierState', 'mooncakeHasChampionAchievement', 'mooncakeGetHouseSignatureEntries', 'mooncakeBuildCharacterCalcSignature',
        'mooncakePersistCharacterSnapshot', 'mooncakeScheduleCharacterSnapshot', 'mooncakeApplyCharacterData', 'mooncakeRestoreCharacterSnapshot',
        'mooncakeHasUsableCharacterData', 'mooncakeSyncCharacterDataFromGameState', 'mooncakeEnsureCharacterData',
        'mooncakeScheduleCharacterStateSync', 'mooncakeFinishCharacterDelta', 'mooncakeIsCompleteCharacterDelta',
        'mooncakeMergeCharacterSkills', 'mooncakeMergeCharacterItems', 'mooncakeBuildCharacterItemDelta',
        'mooncakeGetCharacterActionKey', 'mooncakeSortCharacterActions', 'mooncakeSetCharacterActions',
        'mooncakeReplaceCharacterActions', 'mooncakeMergeCharacterActionUpdates', 'mooncakeApplyCompletedCharacterAction',
        'mooncakeHandleCharacterWebSocketMessage', 'mooncakeApplyCharacterEndDeltas'];
    vm.runInContext(names.filter(name => version.functions.has(name)).map(name => version.functions.get(name)).join('\n'), c);
    const signature = c.mooncakeBuildCharacterCalcSignature;
    c.mooncakeBuildCharacterCalcSignature = () => { counts.signatureBuilds++; return signature(); };
    function advance(ms) {
        const end = now + ms;
        let iterations = 0;
        while (true) {
            const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!due) break;
            assert(++iterations < 1000, 'timer loop in character-state harness');
            timers.delete(due[0]); now = due[1].at; due[1].callback();
        }
        now = end;
    }
    function setGame(snapshot) {
        gameState = snapshot ? { character: snapshot.character, characterSkills: snapshot.characterSkills,
            characterItems: snapshot.characterItems, characterBuffs: snapshot.characterBuffs,
            characterHouseRoomMap: snapshot.characterHouseRoomMap, actionTypeDrinkSlotsMap: snapshot.actionTypeDrinkSlotsMap,
            achievementActionTypeBuffsMap: snapshot.achievementActionTypeBuffsMap,
            communityActionTypeBuffsMap: snapshot.communityActionTypeBuffsMap, characterActions: snapshot.characterActions } : null;
    }
    function state() {
        return JSON.parse(JSON.stringify({ id: c.mooncakeCharacterId, skills: c.characterSkills,
            equipment: c.characterItems, inventory: c.characterInventoryItems,
            house: c.characterHouseRoomMap, drinks: c.characterActionTypeDrinkSlotsMap,
            achievements: c.characterAchievementActionTypeBuffsMap, community: c.characterCommunityActionTypeBuffsMap,
            actions: c.mooncakeCharacterActions, signature: c.mooncakeCharacterCalcSignature }));
    }
    return { context: c, counts, advance, setGame, state, storage, listeners, timers,
        feed: payload => c.mooncakeHandleCharacterWebSocketMessage(JSON.parse(JSON.stringify(payload))) };
}
