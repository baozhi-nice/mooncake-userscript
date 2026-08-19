import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const headerPath = resolve(projectRoot, 'src', 'header.js');
const sourcePath = resolve(projectRoot, 'src', 'mooncake.js');
const outputPath = resolve(projectRoot, 'dist', 'mooncake.user.js');
const maxGreasyForkSize = 2 * 1024 * 1024;
const checkOnly = process.argv.includes('--check');

const [header, source] = await Promise.all([
  readFile(headerPath, 'utf8'),
  readFile(sourcePath, 'utf8'),
]);

if (!header.startsWith('// ==UserScript==')) {
  throw new Error('src/header.js must begin with a UserScript metadata block.');
}

if (!header.includes('@version') || !header.includes('@downloadURL') || !header.includes('@updateURL')) {
  throw new Error('src/header.js must define @version, @downloadURL, and @updateURL.');
}

const version = header.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
if (!version) {
  throw new Error('Unable to read @version from src/header.js.');
}

const result = await minify(source, {
  compress: {
    passes: 2,
  },
  mangle: true,
  format: {
    comments: false,
  },
});

if (!result.code) {
  throw new Error('Terser did not produce an output file.');
}

const output = `${header.trimEnd()}\n\n${result.code}\n`;
const outputSize = Buffer.byteLength(output, 'utf8');

if (outputSize > maxGreasyForkSize) {
  throw new Error(
    `Release is ${outputSize.toLocaleString()} bytes, above Greasy Fork's ${maxGreasyForkSize.toLocaleString()}-byte limit.`,
  );
}

if (checkOnly) {
  const currentOutput = await readFile(outputPath, 'utf8').catch(() => null);
  if (currentOutput !== output) {
    throw new Error('dist/mooncake.user.js is stale. Run pnpm build and commit the result.');
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, 'utf8');
}

console.log(`${checkOnly ? 'Validated' : 'Built'} v${version}: ${outputSize.toLocaleString()} bytes.`);
