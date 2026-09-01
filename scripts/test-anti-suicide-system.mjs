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

const stoneClassifier = extractFunction('mooncakeAntiSuicideDropTableHasPhilosophersStone');
const sandbox = {};
vm.runInNewContext(`
    const MOONCAKE_ANTI_SUICIDE_PHILOSOPHERS_STONE_HRID = '/items/philosophers_stone';
    ${stoneClassifier}
    globalThis.classifier = mooncakeAntiSuicideDropTableHasPhilosophersStone;
`, sandbox);

assert.equal(sandbox.classifier([
    { itemHrid: '/items/crushed_philosophers_stone' },
    { itemHrid: '/items/coin' }
]), false, 'crushed Philosopher Stone must not trigger the alchemy guard');
assert.equal(sandbox.classifier([
    { itemHrid: '/items/crushed_philosophers_stone' },
    { itemHrid: '/items/philosophers_stone' }
]), true, 'a direct Philosopher Stone output must trigger the alchemy guard');
assert.equal(sandbox.classifier(null), false, 'missing output data must not be treated as a confirmed stone pool');

assert.match(source, /antiSuicideEnhancement:\s*true/, 'enhancement protection needs a default-on setting');
assert.match(source, /antiSuicideAlchemy:\s*true/, 'alchemy protection needs a default-on setting');
assert.match(source, /mooncakeSetAntiSuicideAlchemyEnabled\(false\);[\s\S]{0,180}close\(true\)/, 'planned alchemy branch must disable only alchemy protection before replaying');
assert.match(source, /mooncakeSetAntiSuicideEnhancementEnabled\(enabled\)/, 'enhancement protection needs an independent settings setter');
assert.match(source, /hookMooncakeAntiSuicideSystem\(\);/, 'the anti-suicide hook must be installed during initialization');
assert.match(source, /function mooncakeBuildEnhancementRouteNotice\(/, 'Mirror recommendation needs a dedicated route notice');
assert.match(source, /routeNotice = mooncakeBuildEnhancementRouteNotice\(routeRecommendation\)/, 'the protection helper must render the route notice');
assert.match(source, /isZH \? '严禁自杀' : 'Enhancement safety'/, 'enhancement safety must use the requested Chinese setting label');
assert.match(source, /isZH \? '炼金戒赌' : 'Alchemy safety'/, 'alchemy safety must use the requested Chinese setting label');
assert.match(source, /关闭“炼金戒赌”/, 'planned conversion copy must use the renamed alchemy setting');

console.log('Anti-suicide system checks passed.');
