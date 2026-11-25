import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parse } from '../../node_modules/terser/lib/parse.js';
import { TreeWalker, AST_SymbolRef, AST_VarDef } from '../../node_modules/terser/lib/ast.js';
import '../../node_modules/terser/lib/output.js';
import '../../node_modules/terser/lib/scope.js';
import { createEnhancementHarness } from './enhancement-cache-harness.mjs';

export function marketFixture() {
    const quote = (a, b = a * .9) => ({ 0: { a, b } });
    const prices = {
        '/items/equipment': quote(100e6), '/items/equipment_refined': quote(150e6),
        '/items/other_equipment': quote(40e6), '/items/raw': quote(1e6),
        '/items/part': quote(-1, -1), '/items/part_input': quote(3e6),
        '/items/essence': quote(402), '/items/cheese': quote(4860), '/items/log': quote(896),
        '/items/protection_a': quote(9e6), '/items/protection_b': quote(12e6),
        '/items/philosophers_mirror': quote(90e6), '/items/mirror_input': quote(120e6),
        '/items/refining_crystal': quote(5e6), '/items/unrelated': quote(100)
    };
    for (const item of ['/items/equipment', '/items/equipment_refined', '/items/other_equipment']) {
        for (const level of [7, 10, 11, 12, 13, 14]) prices[item][level] = { a: level * 200e6, b: level * 180e6 };
    }
    const recipes = {
        '/items/equipment': { inputs: [{ itemHrid: '/items/raw', count: 3 }, { itemHrid: '/items/part', count: 2 }], outputCount: 1 },
        '/items/part': { inputs: [{ itemHrid: '/items/part_input', count: 2 }], outputCount: 1 },
        '/items/equipment_refined': { inputs: [{ itemHrid: '/items/equipment', count: 1, isFixedUpgradeItem: true }, { itemHrid: '/items/refining_crystal', count: 10 }], outputCount: 1 },
        '/items/philosophers_mirror': { inputs: [{ itemHrid: '/items/mirror_input', count: 1 }], outputCount: 1 }
    };
    const relation = {
        baseHrid: '/items/equipment', refinedHrid: '/items/equipment_refined', outputCount: 1,
        actionDetail: { retainAllEnhancement: true, inputItems: [{ itemHrid: '/items/refining_crystal', count: 10 }] }
    };
    return { prices, recipes, relation };
}

// Install the production call graph. Only input metadata and UI side effects
// are fixtures; recipe costing, Markov expectations, mirror/refinement routes,
// cache reads/writes and live quote normalization are the real functions.
export function createMarketDependencyHarness(version, fixture = marketFixture()) {
    const h = createEnhancementHarness(version), c = h.context;
    const counts = { candidateBuilds: 0, routeSelections: 0, recipeCosts: 0, tableSchedules: 0, ageSchedules: 0, listingSchedules: 0, modalRefreshes: 0, enhanceSchedules: 0, listingNotifications: 0, enhancementRefreshes: [] };
    Object.assign(c, {
        marketDataCache: fixture.prices, marketDetailSnapshotCache: {},
        mooncakeBaseItemCostResolutionCaches: new WeakMap(), objective: 'standard',
        mooncakeHourlyWageColorProfileRevision: 0,
        currentMarketItem: { itemHrid: '/items/equipment', enhancementLevel: 14 },
        mooncakeMarketplacePricingSurfaceState: true,
        MOONCAKE_MARKET_QUOTE_SOURCE_GAME: 'game-order-book',
        mooncakeCacheQ7MarketOrderBooks() {}, mooncakeScheduleOrderBookArchiveCapture() {},
        mooncakeIsMarketListingAgeEnabled: () => true, mooncakeShouldCacheMyListingsLiveOrderBooks: () => false,
        mooncakeCacheMyListingsLiveOrderBooks() {},
        mooncakeGetOrderBookPriceBandValue: (values, level) => values?.[level] ?? null,
        getEnhancementCosts: item => item.includes('equipment') ? [
            { itemHrid: '/items/essence', count: 100 }, { itemHrid: '/items/cheese', count: 12 },
            { itemHrid: '/items/log', count: 8 }, { itemHrid: '/items/coin', count: 3115 }
        ] : null,
        getProtectionItems: () => ['/items/protection_a', '/items/protection_b'],
        getCraftingRecipe: item => fixture.recipes[item] || null,
        getDrinkConcentrationBonus: () => c.player.drink_concentration_bonus,
        getEnhancementRouteObjective: () => c.objective,
        mooncakeGetRefinementActionForItem: item => item === fixture.relation.refinedHrid ? fixture.relation : null,
        getMarketData: () => ({ marketData: c.marketDataCache }),
        scheduleMooncakeEnhanceProtectionBuyBox() { counts.enhanceSchedules++; },
        mooncakeRefreshOrderModalEconomics() { counts.modalRefreshes++; },
        mooncakeScheduleMyListingsHourlyWages() { counts.listingSchedules++; },
        scheduleMarketplaceOrderBookHourlyWageRefresh() { counts.ageSchedules++; },
        scheduleMarketplaceHourlyWageRefresh() { counts.tableSchedules++; },
        mooncakeScheduleCurrentEnhancementMarketRefresh(itemHrid) { counts.enhancementRefreshes.push(itemHrid); },
        mooncakeNotifyMyListingsTargetFilterMarketUpdate() { counts.listingNotifications++; },
        mooncakeNotifyMyListingsManagementMarketUpdate() { counts.listingNotifications++; }
    });
    c.config.preferences = { enhancementRouteObjective: 'standard', enhancementStandardHourlyM: 12 };
    const roots = [
        'mooncakeGetEnhancementRouteSelectionMode', 'mooncakeBuildGenericEnhancementCostContext',
        'mooncakeResolveGenericBaseItemPrice', 'mooncakeGetEnhancementRoute',
        'mooncakeResolveObjectiveRoutePair', 'mooncakeCalculateEnhancementRouteAtPrice',
        'mooncakeGetEnhancementRouteSignature', 'mooncakeGetOrderBookBestPrice', 'updateMarketCacheFromWS',
        'mooncakeBuildRefinementComparison'
    ];
    const declarations = new Map();
    parse(version.source).walk(new TreeWalker(node => {
        if (node instanceof AST_VarDef && node.name.name?.startsWith('MOONCAKE_') && node.value) {
            declarations.set(node.name.name, node.value);
        }
    }));
    const installed = new Set(), constants = new Map(), functions = [];
    function visit(name) {
        if (installed.has(name)) return;
        installed.add(name);
        const source = version.functions.get(name);
        assert(source, `Missing production dependency ${name}`);
        parse(source).walk(new TreeWalker(node => {
            if (node instanceof AST_SymbolRef) {
                const child = node.name;
                if (version.functions.has(child) && (roots.includes(child) || typeof c[child] !== 'function')) visit(child);
            }
            if (node instanceof AST_SymbolRef && declarations.has(node.name) && !(node.name in c)) {
                constants.set(node.name, declarations.get(node.name).print_to_string());
            }
        }));
        functions.push(source);
    }
    roots.forEach(visit);
    vm.runInContext([...constants].map(([name, value]) => `const ${name} = ${value};`).join('\n') + '\n' + functions.join('\n'), c);
    for (const [name, counter] of [
        ['mooncakeBuildEnhancementRouteCandidates', 'candidateBuilds'],
        ['mooncakeSelectEnhancementRoute', 'routeSelections'], ['getCraftingCost', 'recipeCosts']
    ]) {
        const fn = c[name];
        c[name] = (...args) => { counts[counter]++; return fn(...args); };
    }
    return {
        ...h, counts, fixture,
        pair(item = '/items/equipment', level = 14, price = 2800e6) {
            return c.mooncakeResolveObjectiveRoutePair(item, level, c.getMarketData(), price);
        },
        update(item, a, b = a > 0 ? a * .9 : -1, level = 0, extra = {}) {
            const books = []; books[level] = { asks: a > 0 ? [[a, 1]] : [], bids: b > 0 ? [[b, 1]] : [] };
            c.updateMarketCacheFromWS({ itemHrid: item, orderBooks: books, ...extra });
        }
    };
}
