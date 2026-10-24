import { copyFile, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, "data/config.json");
const templatePath = resolve(root, "data/config-v3.3-template.json");
const backupPath = resolve(root, "data/config.pre-v3.3.json");

function mergeRecords(template = {}, existing = {}) {
  const result = { ...template };
  for (const [key, value] of Object.entries(existing || {})) {
    const templateValue = template?.[key];
    if (value && templateValue && typeof value === "object" && typeof templateValue === "object" && !Array.isArray(value) && !Array.isArray(templateValue)) {
      result[key] = { ...templateValue, ...value };
    } else {
      // Preserve custom entries and per-car settings. Existing values take priority.
      result[key] = value;
    }
  }
  return result;
}

try {
  await access(configPath, constants.R_OK | constants.W_OK);
  await access(templatePath, constants.R_OK);
} catch {
  console.error("❌ فایل data/config.json یا data/config-v3.3-template.json پیدا نشد. اسکریپت را از ریشهٔ مخزن اجرا کن.");
  process.exit(1);
}

let current, template;
try {
  current = JSON.parse(await readFile(configPath, "utf8"));
  template = JSON.parse(await readFile(templatePath, "utf8"));
} catch (error) {
  console.error("❌ خطا در خواندن JSON:", error.message);
  process.exit(1);
}

try {
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
  console.log("🛡 نسخهٔ پشتیبان ساخته شد: data/config.pre-v3.3.json");
} catch (error) {
  if (error.code === "EEXIST") console.log("ℹ️ نسخهٔ پشتیبان قبلی حفظ شد؛ فایل موجود overwrite نشد.");
  else throw error;
}

const merged = { ...template, ...current };
merged.schemaVersion = Math.max(3, Number(current.schemaVersion) || 0);
merged.serviceIntervals = mergeRecords(template.serviceIntervals, current.serviceIntervals);
const currentCatalog = current.partCatalog || {};
const templateCatalog = template.partCatalog || {};
merged.partCatalog = {
  ...templateCatalog,
  ...currentCatalog,
  categories: mergeRecords(templateCatalog.categories, currentCatalog.categories),
  items: mergeRecords(templateCatalog.items, currentCatalog.items),
  services: mergeRecords(templateCatalog.services, currentCatalog.services),
  guidance: { ...(templateCatalog.guidance || {}), ...(currentCatalog.guidance || {}) }
};
merged.updatedAt = new Date().toISOString();

await writeFile(configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
console.log(`✅ config.json ارتقا یافت. ${Object.keys(merged.partCatalog.categories || {}).length} دسته، ${Object.keys(merged.partCatalog.items || {}).length} قطعه و ${Object.keys(merged.partCatalog.services || {}).length} سرویس در کاتالوگ حاضر است.`);
console.log("✅ مقادیر سفارشی فعلی، اشخاص، خودرو، مبنای خرید و بازه‌های موجود حفظ شدند.");
