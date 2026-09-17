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

const buildCandidates = extractFunction('mooncakeBuildEnhancementRouteCandidates');
const getRoute = extractFunction('mooncakeGetEnhancementRoute');

assert.doesNotMatch(
    buildCandidates,
    /traditionalRoutes\.push\(\.\.\.mooncakeBuildRefinementCarryoverPlans/,
    'ordinary-then-refine must not be a standalone protection-route candidate'
);

const sandbox = { calls: [] };
vm.runInNewContext(`
    const MOONCAKE_MIRROR_OUTPUT_MIN_LEVEL = 13;
    function mooncakeGetEnhancementRouteSelectionMode(objective) { return objective || 'hourly'; }
    function mooncakeBuildLegacyTraditionalRoute() { calls.push('legacy'); return { routeType: 'legacy' }; }
    function mooncakeBuildGenericEnhancementRouteCandidates() {
        calls.push('generic');
        return { traditionalRoutes: [{ routeType: 'traditional', protectAt: 6 }], mirrorTemplates: [] };
    }
    function mooncakeSelectEnhancementRoute() { calls.push('select'); return { routeType: 'traditional', protectAt: 6 }; }
    ${getRoute}
    globalThis.getRoute = mooncakeGetEnhancementRoute;
`, sandbox);

const refinedRoute = sandbox.getRoute('/items/example_refined', 12, {}, 100, 'hourly');
assert.equal(refinedRoute?.routeType, 'traditional', 'refined +12 must use generic protection routes');
assert.deepEqual(sandbox.calls, ['generic', 'select'], 'refined +12 must not fall back to the legacy single route');

sandbox.calls.length = 0;
const normalRoute = sandbox.getRoute('/items/example', 12, {}, 100, 'hourly');
assert.equal(normalRoute?.routeType, 'legacy', 'normal +12 should keep the existing legacy route');
assert.deepEqual(sandbox.calls, ['legacy'], 'normal +12 behavior must remain unchanged');

console.log('Refinement route selection checks passed.');
