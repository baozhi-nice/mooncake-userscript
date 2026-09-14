import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

assert.match(
    source,
    /if \(previousVirtualEnabled && !enabled\) \{\s*if \(!config\.features\) config\.features = \{\};\s*config\.features\.enhancingCommunityBuff = false;\s*\} else if \(profileCommunityBuffEnabled !== null\)/,
    'turning virtual configuration off must also turn the enhancement buff off before any profile value can apply'
);
assert.match(
    source,
    /else if \(profileCommunityBuffEnabled !== null\) \{\s*if \(!config\.features\) config\.features = \{\};\s*config\.features\.enhancingCommunityBuff = profileCommunityBuffEnabled;/,
    'applying a virtual profile must keep its explicit community-buff choice'
);

console.log('Virtual community buff checks passed.');
