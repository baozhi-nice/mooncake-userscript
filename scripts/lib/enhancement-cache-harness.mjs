import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { create, all } from 'mathjs';
import { parse } from '../../node_modules/terser/lib/parse.js';
import { TreeWalker, AST_Defun } from '../../node_modules/terser/lib/ast.js';
import { createMarketPricingTestGlobals, marketPricingFunctionNames } from './market-pricing-test-support.mjs';
import { createProbabilityTaskState, probabilityTaskFunctionNames } from './probability-task-test-support.mjs';

const math = create(all);
const projectRoot = new URL('../../', import.meta.url);
export const baseParameters = {
    enhancing_level: 156, laboratory_level: 8, enhancer_bonus: 8.4,
    enhancers_top_speed: 15.02, enhancers_bottom_speed: 15.02, glove_bonus: 15.02,
    necklace_speed: 10.68, chance_cape_speed: 20.358, drink_concentration_bonus: 15.7,
    tea_enhancing: false, tea_super_enhancing: false, tea_ultra_enhancing: true,
    tea_blessed: true, champion_achievement: true, community_enhancing_speed_bonus: 0
};

export async function readEnhancementSource(ref = null, filePath = null) {
    const source = filePath ? await readFile(filePath, 'utf8') : ref
        ? execFileSync('git', ['show', `${ref}:src/mooncake.js`], {
            cwd: projectRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024
        })
        : await readFile(new URL('../../src/mooncake.js', import.meta.url), 'utf8');
    const functions = new Map();
    parse(source).walk(new TreeWalker(node => {
        if (node instanceof AST_Defun) {
            functions.set(node.name.name, source.slice(node.start.pos, node.end.pos + 1));
        }
    }));
    return { source, functions, label: filePath || ref || 'working-tree' };
}

export function createEnhancementHarness(version) {
    const counts = { inversions: 0, totalSkillReads: 0, snapshotRefreshes: 0 };
    const timers = new Map();
    let timerId = 0;
    const context = vm.createContext({
        console,
        ...createMarketPricingTestGlobals(), marketDataCache: null, mooncakeMarketPricingRevision: 0,
        mooncakeProbabilityTasks: createProbabilityTaskState(), enhancelateWorkerInFlight: new Map(), enhancelateWorkerPending: new Map(),
        mooncakeDeferVisibleRefresh: () => false,
        math: { ...math, inv(...args) { counts.inversions++; return math.inv(...args); } },
        player: { ...baseParameters }, totalSkills: 1874,
        config: { virtual: { enabled: false } }, currentMarketItem: null,
        SUCCESS_RATE: [50, 45, 45, 40, 40, 40, 35, 35, 35, 35, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        ENHANCELATE_CACHE_LIMIT: 512, MOONCAKE_EXACT_ENHANCELATE_CACHE_LIMIT: 512,
        MOONCAKE_MIRROR_OUTPUT_MIN_LEVEL: 13,
        MOONCAKE_ENHANCE_SIMULATION_PROFILE_CACHE_LIMIT: 256,
        MOONCAKE_TRADITIONAL_RISK_CACHE_LIMIT: 192, MOONCAKE_TRADITIONAL_RISK_COST_CACHE_LIMIT: 96,
        enhancelateCache: new Map(), mooncakeExactEnhancelateCache: new Map(),
        mooncakeEnhanceSimulationProfileCache: new Map(), mooncakeTraditionalEnhancementRiskCache: new Map(),
        mooncakeTraditionalEnhancementRiskCostCache: new Map(), mooncakeEnhancementRouteCandidateCache: new Map(),
        mooncakeEnhancementRoutePairCache: new Map(), mooncakeVirtualRivalHourlyCache: new Map(),
        mooncakeEnhancementRoutePrewarmState: new Map(), mooncakeMyListingsHourlyRevision: 0,
        mooncakeCharacterRefreshTimer: 0, mooncakeCharacterCalcSignature: 'fixture-character',
        mooncakeCharacterPendingVirtualBuffRefresh: false,
        mooncakePlayerEnhanceParamsCacheKey: '', mooncakePlayerEnhanceParamsCacheItemDetailMap: null,
        mooncakePlayerEnhanceParamsCache: null, itemDetailMap: {},
        getBaseItemLevel: item => item.endsWith('_85') ? 85 : item.endsWith('_200') ? 200 : 90,
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        processLootLogs() { counts.snapshotRefreshes++; },
        refreshMooncakeChatLabor() {}, scheduleMooncakeEnhanceProtectionBuyBox() {},
        mooncakeRefreshOrderModalEconomics() {}, scheduleMarketplaceHourlyWageRefresh() {},
        mooncakeRefreshEnhancementSettingsPanel() {}, mooncakeScheduleMyListingsHourlyWages() {},
        mooncakeGetNearLowestAskProtectionCandidates: () => [{ hrid: '/items/protection', ask: 9e6 }],
        mooncakeResolveEnhancementStartItemPrice: () => ({ price: 380010723, source: 'craft' }),
        mooncakeGetEnhancementRouteSelectionMode: () => 'standard',
        mooncakeGetEnhancementStandardHourlyWage: () => 12e6
    });
    context.getPlayerEnhanceParams = () => context.player;
    context.getEnhancelateTotalSkillLevel = () => { counts.totalSkillReads++; return context.totalSkills; };
    context.mooncakeBuildGenericEnhancementCostContext = item => ({
        perActionCost: 108803, secondsPerAction: context.calcEnhancingSecondsPerAction(item)
    });
    const names = [
        'mooncakeSetBoundedMapEntry', 'cacheEnhancelateResult', 'cacheMooncakeExactEnhancelateResult',
        'mooncakeCacheTraditionalEnhancementRisk', 'mooncakeClearTraditionalEnhancementRiskPriceCaches',
        'mooncakeClearTraditionalEnhancementRiskCaches', 'mooncakeClearEnhancementRouteCache',
        'mooncakeClearEnhancementRoutePrewarmState', 'mooncakeClearEnhancementCalculationCaches',
        'buildEnhancelateCacheKey', 'Enhancelate', 'mooncakeEnhancelateExactLevel',
        'calcEnhancingSecondsPerAction', 'calcEnhancingTimeSeconds',
        'mooncakeGetEnhanceSimulationProfiles', 'mooncakeBuildEnhancePanelPricingContext',
        'mooncakeScheduleCharacterDependentRefresh', 'mooncakeRefreshEnhancingCommunityBuffCalculations',
        'mooncakeBuildTraditionalEnhancementRiskModel', 'mooncakeBuildTraditionalEnhancementRiskEntry',
        'mooncakeTraditionalRiskClamp', 'mooncakeTraditionalRiskMatrixVector', 'mooncakeTraditionalRiskRowMatrix',
        'mooncakeTraditionalRiskMatrixMultiply', 'mooncakeTraditionalRiskInvert',
        'mooncakeTraditionalRiskBuildSystem', 'mooncakeTraditionalRiskActionCdf',
        'mooncakeTraditionalRiskFindActionQuantile'
    ];
    names.push(...marketPricingFunctionNames.filter(name => version.functions.has(name)));
    names.push(...probabilityTaskFunctionNames.filter(name => version.functions.has(name)));
    vm.runInContext(names.map(name => {
        assert(version.functions.has(name), `Missing ${name} in ${version.label}`);
        return version.functions.get(name);
    }).join('\n'), context);
    return {
        context, counts,
        flushTimers() {
            const pending = [...timers.values()]; timers.clear();
            pending.forEach(fn => fn());
        }
    };
}

export function snapshotResult(context, target = 12, protection = 7, start = 0, item = '/items/starry_hatchet') {
    const ordinary = context.Enhancelate(item, target, protection, null, start);
    const exact = context.mooncakeEnhancelateExactLevel(item, target, protection);
    const seconds = context.calcEnhancingSecondsPerAction(item);
    const hours = ordinary.actions * seconds / 3600;
    const cost = 380010723 + ordinary.actions * 108803 + ordinary.protectCount * 9e6;
    return JSON.parse(JSON.stringify({ ordinary, exact, seconds, hours, cost, hourly: (1960e6 * .96 - cost) / hours }));
}
