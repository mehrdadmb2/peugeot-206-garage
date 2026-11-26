(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const fa = value => {
    if (value === null || value === undefined || value === '') return '—';
    try { return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value); }
    catch { return String(value); }
  };
  const fact = (label, value, detail = '', badge = '') => `
    <article class="spec-fact">
      <small>${esc(label)}</small>
      <b>${esc(value)}</b>
      ${detail ? `<span>${esc(detail)}</span>` : ''}
      ${badge ? `<em>${esc(badge)}</em>` : ''}
    </article>`;

  function render(config = {}) {
    const vehicle = config.vehicle || {};
    const profile = vehicle.profile || {};
    const engine = profile.engine || {};
    const transmission = profile.transmission || {};
    const capacity = profile.capacities || {};
    const dimensions = profile.dimensions || {};
    const wheels = profile.wheels || {};
    const performance = profile.performance || {};
    const safety = profile.safety || {};
    const chassis = profile.chassis || {};
    const variant = profile.variant || {};
    const quality = profile.dataQuality || {};
    const dynamic = document.getElementById('vehicleSpecDynamicGrid');
    if (!dynamic) return;

    const isVerified = variant.confidence === 'verified';
    const statusText = isVerified ? 'تأییدشده با مدرک' : 'تطبیق مرجع · نیازمند تأیید';
    const engineName = [engine.code, engine.family].filter(Boolean).join(' · ') || vehicle.engine || 'ثبت نشده';
    const engineId = document.getElementById('specEngineIdentity');
    if (engineId) engineId.textContent = `${engineName} · ${engine.displacementCc ? `${fa(engine.displacementCc)} cc` : ''}`;
    const caution = document.getElementById('specEngineCaution');
    if (caution) caution.textContent = `تیپ ${variant.value || vehicle.variant || 'نامشخص'} و استاندارد آلایندگی، اطلاعات مرجع‌اند؛ کارت خودرو، کد حک‌شده موتور و مدارک معاینه فنی ملاک نهایی هستند.`;
    const title = document.getElementById('specVehicleNameHero');
    if (title) title.textContent = `${vehicle.make || 'Peugeot'} ${vehicle.model || '206 SD'}`;
    const year = document.getElementById('specVehicleYear');
    if (year) year.textContent = fa(vehicle.modelYear);
    const badges = document.getElementById('specVehicleBadges');
    if (badges) {
      const badgeStatus = isVerified
        ? '<span class="data-badge badge-live">مشخصات سندی تأیید شده</span>'
        : '<span class="data-badge badge-confirm">تطبیق نهایی با مدارک لازم</span>';
      badges.innerHTML = [
        `<span class="data-badge badge-reference">تیپ ${esc(variant.value || vehicle.variant || 'نامشخص')} · ${esc(statusText)}</span>`,
        `<span class="data-badge badge-reference">${esc(engine.emissionStandard || vehicle.emissionStandard || 'استاندارد آلایندگی نامشخص')} · مرجع</span>`,
        badgeStatus,
        `<span class="data-badge badge-live">${esc(engine.family || vehicle.engine || 'TU3')}</span>`
      ].join('');
    }

    const displacement = Number(engine.displacementCc) || 0;
    const boreStroke = engine.boreMm && engine.strokeMm ? `${fa(engine.boreMm)} × ${fa(engine.strokeMm)} mm` : 'ثبت نشده';
    const weight = dimensions.curbWeightKg && typeof dimensions.curbWeightKg === 'object'
      ? `${fa(dimensions.curbWeightKg.min)} تا ${fa(dimensions.curbWeightKg.max)} kg`
      : 'ثبت نشده';
    const pressure = wheels.coldPressureFrontBar || wheels.coldPressureRearBar
      ? `جلو ${fa(wheels.coldPressureFrontBar)} · عقب ${fa(wheels.coldPressureRearBar)} bar${wheels.coldPressureRearLoadedBar ? ` · عقب با بار ${fa(wheels.coldPressureRearLoadedBar)}` : ''}`
      : 'طبق برچسب خودرو';
    const referenceBadge = 'مرجع تیپ · نیازمند تطبیق';

    const facts = [
      fact('کد موتور / خانواده', engineName, `${fa(displacement)} سی‌سی · ${fa(engine.cylinders || 4)} سیلندر · ${fa(engine.valves || 0)} سوپاپ`, referenceBadge),
      fact('استاندارد آلایندگی', engine.emissionStandard || vehicle.emissionStandard || 'تعیین نشده', 'استاندارد مرجع تیپ؛ سند خودرو مقدم است', referenceBadge),
      fact('توان و دور نامی', `${fa(engine.maxPowerHp)} hp`, `${fa(engine.maxPowerRpm)} rpm`, referenceBadge),
      fact('گشتاور و دور نامی', `${fa(engine.maxTorqueNm)} Nm`, `${fa(engine.maxTorqueRpm)} rpm`, referenceBadge),
      fact('هندسه موتور', boreStroke, engine.compressionRatio ? `نسبت تراکم مرجع ${fa(engine.compressionRatio)}:1` : 'نسبت تراکم در پرونده ثبت نشده', referenceBadge),
      fact('سامانه سوخت‌رسانی', engine.fuelSystem || 'ثبت نشده', engine.fuelType || vehicle.fuel || 'نوع سوخت ثبت نشده'),
      fact('گیربکس و انتقال قدرت', `${fa(transmission.forwardGears || 0)} دنده · ${transmission.type || 'نامشخص'}`, `${transmission.drivetrain || 'نوع انتقال قدرت نامشخص'} · کد گیربکس ${transmission.gearboxCode || 'ثبت نشده'}`, referenceBadge),
      fact('ظرفیت باک', `${fa(capacity.fuelTankLiters || 50)} لیتر`, 'ظرفیت اسمی؛ سطح واقعی باک جداگانه است', referenceBadge),
      fact('روغن موتور با فیلتر', `${fa(capacity.engineOilWithFilterLiters)} لیتر`, 'پس از سرویس با گیج و سطح نهایی کنترل شود', referenceBadge),
      fact('روغن گیربکس دستی', `${fa(capacity.manualGearboxOilLiters)} لیتر`, 'نوع روغن و سطح‌گیری به کد گیربکس وابسته است', referenceBadge),
      fact('مایع خنک‌کننده / ترمز', `${fa(capacity.coolingSystemDryLiters)} L / ${fa(capacity.brakeFluidLiters)} L`, 'ظرفیت خشک با مقدار تخلیه‌شده برابر نیست', referenceBadge),
      fact('ابعاد بدنه', `${fa(dimensions.lengthMm)} × ${fa(dimensions.widthMm)} × ${fa(dimensions.heightMm)} mm`, `فاصله محوری ${fa(dimensions.wheelbaseMm)} mm`, referenceBadge),
      fact('صندوق و وزن خالص', `${fa(dimensions.bootLiters)} لیتر`, `وزن مرجع ${weight}`, referenceBadge),
      fact('تایر و رینگ', wheels.tyreSize || 'ثبت نشده', `رینگ ${wheels.rimSize || 'نامشخص'}`),
      fact('فشار باد مرجع', pressure, 'مقدار قطعی با برچسب ستون در یا دفترچه تطبیق داده شود', referenceBadge),
      fact('مصرف سوخت مرجع', `${fa(performance.referenceCombinedLPer100Km)} L/100km`, `شهری ${fa(performance.referenceCityLPer100Km)} · جاده ${fa(performance.referenceHighwayLPer100Km)}`, referenceBadge),
      fact('عملکرد مرجع', `${fa(performance.referenceTopSpeedKph)} km/h`, `شتاب ۰ تا ۱۰۰: ${fa(performance.referenceZeroTo100Seconds)} ثانیه`, referenceBadge),
      fact('تعلیق جلو و عقب', `${chassis.frontSuspension || '—'}`, chassis.rearSuspension || 'اطلاعات عقب ثبت نشده', referenceBadge),
      fact('ترمز و فرمان', `${chassis.frontBrakes || '—'} جلو · ${chassis.rearBrakes || '—'} عقب`, chassis.steering || 'نوع فرمان ثبت نشده', referenceBadge),
      fact('ایمنی و ABS', safety.airbags || 'ایربگ نامشخص', `ABS: ${safety.abs || 'نیازمند بررسی'} · EBD: ${safety.ebd || 'نیازمند بررسی'}`, 'تجهیزات تیپ‌محور')
    ];
    dynamic.innerHTML = facts.join('');
    dynamic.dataset.profileStatus = quality.classification || 'reference';

    const qualityNode = document.getElementById('vehicleProfileQuality');
    if (qualityNode) {
      const verified = Array.isArray(quality.verifiedFields) ? quality.verifiedFields.length : 0;
      const pending = Array.isArray(quality.unverifiedFields) ? quality.unverifiedFields.length : 0;
      qualityNode.innerHTML = `<span class="data-badge badge-live">${fa(verified)} فیلد تأییدشده</span><span class="data-badge badge-reference">${fa(pending)} فیلد نیازمند تطبیق</span><span class="data-badge badge-confirm">مدرک خودرو ملاک نهایی</span>`;
    }
  }

  window.GarageVehicleProfile = { render };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.peugeot-official-mark').forEach(image => image.addEventListener('error', () => image.closest('.brand-mark-peugeot')?.classList.add('logo-failed'), { once: true }));
    const config = window.GARAGE_BOOTSTRAP?.config;
    if (config) render(config);
  }, { once: true });
})();
