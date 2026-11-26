import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const serviceCategories = ['engine', 'brakes', 'cooling', 'electrical', 'transmission', 'suspension', 'climate', 'fuel', 'wheels'];

test('home brand logo is constrained and cannot expand the hero layout', async () => {
  const html = await read('index.html');
  const css = await read('assets/css/visual-refresh-v328.css');
  assert.match(html, /class="hero-brand-pill"[\s\S]*?class="hero-brand-monogram"/);
  assert.match(html, /visual-refresh-v328\.css\?v=3\.28\.0/);
  assert.match(css, /\.hero-brand-monogram\s*\{[^}]*width:\s*17px[^}]*height:\s*17px/s);
  assert.match(css, /\.brand-mark-peugeot\s*\{[^}]*max-width:\s*46px !important/s);
});

test('vehicle specification hero image is contained in a compact column', async () => {
  const css = await read('assets/css/visual-refresh-v328.css');
  assert.match(css, /grid-template-columns:\s*minmax\(0, 270px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.specs-hero-art img\s*\{[^}]*max-width:\s*238px !important[^}]*max-height:\s*148px !important/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.specs-hero\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('ambient light field is decorative, low-cost and respects reduced motion', async () => {
  const html = await read('index.html');
  const css = await read('assets/css/visual-refresh-v328.css');
  assert.match(html, /class="garage-lightfield" aria-hidden="true"/);
  assert.match(css, /\.garage-lightfield\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /@keyframes garage-light-drift-a[\s\S]*?transform:\s*translate3d/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?garage-lightfield::before, \.garage-lightfield::after \{ animation: none/);
});

test('service cards map their component group to local generated artwork and unique themes', async () => {
  const app = await read('assets/js/app.js');
  const css = await read('assets/css/visual-refresh-v328.css');
  for (const category of serviceCategories) {
    assert.match(app, new RegExp(`data-category="\\$\\{escapeAttr\\(serviceVisualCategory\\(`));
    assert.match(css, new RegExp(`data-category="${category}"`));
    const asset = path.join(root, 'assets', 'img', 'services', `${category}.webp`);
    const info = await stat(asset);
    assert.ok(info.size > 5_000 && info.size < 300_000, `${category} artwork should be optimized WebP`);
    const bytes = await readFile(asset);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  }
  assert.match(app, /const SERVICE_KEY_CATEGORY/);
  assert.match(app, /function serviceVisualCategory/);
  assert.match(app, /service-category-icon/);
});

test('README and BotFather command list describe release 3.28.0 and remain valid', async () => {
  const readme = await read('README.md');
  const commands = (await read('botfather-commands.txt')).trim().split(/\r?\n/);
  assert.match(readme, /Version 3\.28\.0/);
  assert.match(readme, /visual-refresh-v328\.css/);
  assert.match(readme, /۹ تصویر محلی/);
  assert.ok(commands.length >= 40 && commands.length <= 100);
  const names = new Set();
  for (const line of commands) {
    const match = line.match(/^([a-z][a-z0-9_]{0,31}) - (.{1,256})$/u);
    assert.ok(match, `Invalid BotFather command line: ${line}`);
    assert.ok(!names.has(match[1]), `Duplicate BotFather command: ${match[1]}`);
    names.add(match[1]);
  }
  for (const required of ['start', 'guide', 'vehicle', 'partinfo', 'fuelstats', 'analysis', 'insurance']) assert.ok(names.has(required));
});
