#!/usr/bin/env node
/**
 * Prepare an existing data/config.json for Garage OS v3.7.
 * Run from the repository root: node ./scripts/upgrade-config-v3.7.mjs
 * This is an idempotent migration: it preserves all existing keys and values,
 * and only adds missing maintenance structures / advances schemaVersion.
 * A backup is created once and never overwritten.
 */
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const configPath = resolve(process.cwd(), 'data', 'config.json');
const backupPath = resolve(process.cwd(), 'data', 'config.pre-v3.7.json');

try {
  await access(configPath, constants.R_OK | constants.W_OK);
} catch {
  console.error('❌ data/config.json پیدا نشد یا قابل نوشتن نیست. این دستور را از ریشهٔ مخزن اجرا کن.');
  process.exit(1);
}

let source;
let config;
try {
  source = await readFile(configPath, 'utf8');
  config = JSON.parse(source);
} catch (error) {
  console.error(`❌ خواندن data/config.json ناموفق بود: ${error.message}`);
  process.exit(1);
}
if (!config || typeof config !== 'object' || Array.isArray(config)) {
  console.error('❌ ریشهٔ config.json باید یک شیء JSON باشد.');
  process.exit(1);
}

try {
  await access(backupPath, constants.F_OK);
  console.log('ℹ️ پشتیبان قبلی وجود دارد؛ بازنویسی نمی‌شود: data/config.pre-v3.7.json');
} catch {
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
  console.log('🛡 پشتیبان ایجاد شد: data/config.pre-v3.7.json');
}

const original = JSON.stringify(config);
config.serviceIntervals ||= {};
config.maintenanceOverrides ||= {};
config.schemaVersion = Math.max(Number(config.schemaVersion) || 1, 6);
const updated = JSON.stringify(config, null, 2) + '\n';

if (original !== JSON.stringify(config)) {
  await writeFile(configPath, updated, 'utf8');
  console.log('✅ data/config.json برای ساختار v3.7 به‌روزرسانی شد.');
} else {
  console.log('✅ تنظیمات از قبل با v3.7 سازگار است؛ تغییر لازم نبود.');
}
console.log(`🔧 برنامه‌های سرویس: ${Object.keys(config.serviceIntervals).length}`);
console.log(`📝 تنظیمات اختصاصی نگهداری: ${Object.keys(config.maintenanceOverrides).length}`);
console.log('🔐 تمام مقادیر سفارشی موجود حفظ شده‌اند.');
