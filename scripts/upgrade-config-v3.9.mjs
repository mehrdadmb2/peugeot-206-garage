#!/usr/bin/env node
/**
 * Safe configuration cleanup for Garage OS 3.9.
 * Removes obsolete guessed ownership-distance fields while preserving all other
 * configuration, writes a timestamped backup, and never touches event logs.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'data', 'config.json');
const backupDir = path.join(root, 'data', 'backups');

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

if (!(await exists(configPath))) {
  console.error('❌ data/config.json پیدا نشد. این اسکریپت را از داخل مخزن پروژه اجرا کن.');
  process.exit(1);
}

const originalText = await readFile(configPath, 'utf8');
let config;
try { config = JSON.parse(originalText); }
catch (error) {
  console.error('❌ config.json معتبر نیست؛ هیچ تغییری انجام نشد.', error.message);
  process.exit(1);
}

const ownership = config.ownership && typeof config.ownership === 'object' ? config.ownership : null;
const obsoleteKeys = ['estimatedKmSincePurchaseKm', 'estimatedDrivenSincePurchaseKm'];
const found = ownership ? obsoleteKeys.filter(key => Object.hasOwn(ownership, key)) : [];
if (!found.length) {
  console.log('✅ تنظیم تخمینی قدیمی وجود ندارد؛ فایل بدون تغییر باقی ماند.');
  process.exit(0);
}

await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `config-before-v3.9-${stamp}.json`);
await writeFile(backupPath, originalText.endsWith('\n') ? originalText : `${originalText}\n`, { flag: 'wx' });
for (const key of found) delete ownership[key];
ownership.note = 'کیلومتر خرید مبنای پیمایش است؛ پیمایش فقط از اختلاف آخرین کیلومتر معتبر و کیلومتر خرید محاسبه می‌شود. بدون تاریخ واقعی خرید، روزهای گذشته از خرید محاسبه نمی‌شوند.';
config.ownership = ownership;
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`✅ تنظیم‌های تخمینی حذف شدند: ${found.join(', ')}`);
console.log(`🛡 پشتیبان: ${path.relative(root, backupPath)}`);
console.log('ℹ️ هیچ فایل لاگ، کیلومتر ثبت‌شده، هزینه یا تاریخچه‌ای تغییر نکرد.');
