export const marketPricingFunctionNames = [
    'mooncakeGetMarketPricingDependency', 'mooncakeGetItemPricingRevision',
    'mooncakeBeginMarketPricingCapture', 'mooncakeEndMarketPricingCapture',
    'mooncakeTrackMarketPriceRead', 'mooncakeInvalidateItemPricing',
    'mooncakeIsItemPricingAffected', 'mooncakeMergePricingChanges',
    'mooncakeResetMarketPricingDependencies',
    'mooncakeGetDocumentMutationContext', 'mooncakeQueryDocumentRoots'
];

export function createMarketPricingTestGlobals() {
    return {
        MOONCAKE_MARKET_PRICING_DEPENDENCY_LIMIT: 256,
        mooncakeMarketPricingDependencies: new Map(), mooncakeMarketPricingDependencySerial: 0,
        mooncakeMarketPricingCapture: null, mooncakeMyListingsHourlyChanges: undefined,
        mooncakeOrderBookPricingChanges: undefined, mooncakeSummaryPricingChanges: undefined,
        mooncakeEnhancePricingItemHrid: null,
        mooncakeDocumentMutationContexts: new WeakMap(), mooncakeActiveDocumentMutationContext: null
    };
}

export function marketPricingTestPrelude(omit = []) {
    const keys = Object.keys(createMarketPricingTestGlobals()).filter(key => !omit.includes(key));
    return `let { ${keys.join(', ')} } = (${createMarketPricingTestGlobals.toString()})();`;
}

export function marketPricingTestFunctions(extract) {
    return marketPricingFunctionNames.map(name => extract(name)).join('\n');
}

// Offscreen browser tabs can render less often than their timers fire. Let
// queued table batches and observer work run before asserting the DOM state.
export async function settlePricingBrowserFrames(delay) {
    await new Promise(resolve => setTimeout(resolve, delay));
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
}
