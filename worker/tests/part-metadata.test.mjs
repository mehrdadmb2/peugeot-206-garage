import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPartMetadata } from "../src/index.js";

test("part metadata parser extracts identity, electrical specs, quantity, warranty and fitment fields", () => {
  const text = "/part باتری تعویض شد 12 ولت 60 آمپر ساعت برند=Bosch مدل=S5 شماره‌قطعه=0092 سریال=ABC123 تعداد=1 ضمانت=2027-03-20 سمت=جلو فروشنده=فروشگاه مهر فاکتور=F-778 قیمت=4500000 تومان";
  const parsed = extractPartMetadata(text);
  assert.equal(parsed.brand, "Bosch");
  assert.equal(parsed.model, "S5");
  assert.equal(parsed.partNumber, "0092");
  assert.equal(parsed.serialNumber, "ABC123");
  assert.equal(parsed.warrantyUntil, "2027-03-20");
  assert.equal(parsed.supplier, "فروشگاه مهر");
  assert.equal(parsed.invoiceRef, "F-778");
  assert.equal(parsed.position, "جلو");
  assert.equal(parsed.quantity, 1);
  assert.equal(parsed.specs.voltageV, 12);
  assert.equal(parsed.specs.capacityAh, 60);
});

test("unprovided part metadata remains null instead of being invented", () => {
  const parsed = extractPartMetadata("/part فیلتر روغن تعویض شد کیلومتر=432500");
  for (const key of ["brand", "model", "partNumber", "serialNumber", "warrantyUntil", "supplier", "invoiceRef", "position", "condition"]) assert.equal(parsed[key], null);
  assert.equal(parsed.quantity, 1);
  assert.equal(parsed.specs, null);
});


test("part warranty parser accepts Persian Solar Hijri dates and rejects impossible dates", () => {
  const parsed = extractPartMetadata("/part باتری تعویض شد ضمانت=۱۴۰۶/۱۲/۲۹");
  assert.equal(parsed.warrantyUntil, "2028-03-19");
  assert.equal(parsed.warrantyUntilJalali, "1406/12/29");
  assert.equal(parsed.warrantyCalendar, "jalali");

  const invalid = extractPartMetadata("/part باتری تعویض شد ضمانت=۱۴۰۶/۱۲/۳۰");
  assert.equal(invalid.warrantyUntil, null);
  assert.equal(invalid.warrantyUntilJalali, null);
  assert.equal(invalid.warrantyCalendar, null);
});

test("expanded catalog contains inspection metadata and separates safety-critical fitment", () => {
  const config = JSON.parse(readFileSync(new URL("../../data/config.json", import.meta.url), "utf8"));
  const items = Object.values(config.partCatalog.items);
  assert.equal(items.length, 126);
  assert.equal(Object.keys(config.partCatalog.categories).length, 15);
  assert.equal(Object.keys(config.partCatalog.services).length, 35);
  assert.ok(items.some(item => item.criticality === "safety_critical"));
  assert.ok(items.some(item => Array.isArray(item.symptoms) && item.symptoms.length));
  assert.ok(items.every(item => item.fitmentStatus && Array.isArray(item.metadataFields)));
});

test("vehicle profile and new user-facing commands are present and clearly flag reference-only specifications", () => {
  const config = JSON.parse(readFileSync(new URL("../../data/config.json", import.meta.url), "utf8"));
  const profile = config.vehicle.profile;
  assert.equal(profile.engine.family, "TU3");
  assert.equal(profile.engine.displacementCc, 1360);
  assert.equal(profile.engine.emissionStandard, "Euro III");
  assert.equal(profile.variant.value, "V20");
  assert.equal(profile.variant.confidence, "probable");
  assert.equal(profile.engine.verification, "reference_only");
  assert.match(profile.engine.emissionStandard, /Euro III/);
  assert.equal(profile.dataQuality.classification, "reference_with_vehicle_specific_confirmation_pending");
  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /async function vehicleProfileCommand/);
  assert.match(source, /async function partInfoCommand/);
  assert.match(source, /partinfo/);
});
