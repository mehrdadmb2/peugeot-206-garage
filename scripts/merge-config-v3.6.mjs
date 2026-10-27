import { copyFile, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, "data/config.json");
const templatePath = resolve(root, "data/config-v3.6-template.json");
const backupPath = resolve(root, "data/config.pre-v3.6.json");

function mergeRecordMaps(template = {}, existing = {}) {
  const result = {};
  for (const key of new Set([...Object.keys(template || {}), ...Object.keys(existing || {})])) {
    const fresh = template?.[key] || {};
    const current = existing?.[key] || {};
    result[key] = { ...fresh, ...current };
    if (Array.isArray(fresh.aliases) || Array.isArray(current.aliases)) {
      result[key].aliases = [...new Set([...(fresh.aliases || []), ...(current.aliases || [])])];
    }
    // Prefer user-specific settings/notes and other current values, but fill new fields from the template.
  }
  return result;
}

try {
  await access(configPath, constants.R_OK | constants.W_OK);
  await access(templatePath, constants.R_OK);
} catch {
  console.error("❌ data/config.json یا data/config-v3.6-template.json پیدا نشد؛ اسکریپت را از ریشه مخزن اجرا کن.");
  process.exit(1);
}

let current, template;
try {
  current = JSON.parse(await readFile(configPath, "utf8"));
  template = JSON.parse(await readFile(templatePath, "utf8"));
} catch (error) {
  console.error("❌ فایل تنظیمات JSON معتبر نیست:", error.message);
  process.exit(1);
}

try {
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
  console.log("🛡 نسخه پشتیبان ساخته شد: data/config.pre-v3.6.json");
} catch (error) {
  if (error.code === "EEXIST") console.log("ℹ️ نسخه پشتیبان قبلی حفظ شد؛ overwrite نشد.");
  else throw error;
}

const merged = { ...template, ...current };
merged.schemaVersion = Math.max(5, Number(current.schemaVersion) || 0);
merged.serviceIntervals = { ...(template.serviceIntervals || {}), ...(current.serviceIntervals || {}) };
const freshCatalog = template.partCatalog || {};
const oldCatalog = current.partCatalog || {};
merged.partCatalog = {
  ...freshCatalog,
  ...oldCatalog,
  categories: mergeRecordMaps(freshCatalog.categories, oldCatalog.categories),
  items: mergeRecordMaps(freshCatalog.items, oldCatalog.items),
  services: mergeRecordMaps(freshCatalog.services, oldCatalog.services),
  guidance: { ...(freshCatalog.guidance || {}), ...(oldCatalog.guidance || {}) }
};
// This legacy catalog entry represented a leak condition, not a physical replacement part.
// The condition is tracked as an open/closed issue by the Worker.
delete merged.partCatalog.items.gearbox_oil_leak;
merged.updatedAt = new Date().toISOString();
await writeFile(configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
console.log(`✅ تنظیمات v3.6 ادغام شد: ${Object.keys(merged.partCatalog.categories).length} دسته، ${Object.keys(merged.partCatalog.items).length} قطعه و ${Object.keys(merged.partCatalog.services).length} نوع سرویس.`);
console.log("✅ اشخاص، خودرو، مبنای کیلومتر خرید و فاصله‌های سفارشی حفظ شدند؛ aliasهای جدید نیز به aliasهای موجود اضافه شدند.");
