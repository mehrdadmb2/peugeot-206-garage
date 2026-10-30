/* Peugeot 206 Garage · private vehicle documents UI · v3.14.0 */
(() => {
  'use strict';
  const WORKER = 'https://peugeot-206-garage-bot.game-developer-mb.workers.dev';
  const $ = (id) => document.getElementById(id);
  let accessToken = '';
  let documents = null;
  const log = (level, message, details) => {
    try { window.GarageDiagnostics?.log(level, 'vehicle-documents', message, details); } catch (_) {}
  };
  const faDigits = (value) => String(value ?? '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const toFaDigits = (value) => String(value ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  function normalizePlate(plate = {}) {
    const source = faDigits([plate.displayFull, plate.display, plate.number].filter(Boolean).join(' ')).replace(/[يى]/g, 'ی');
    let match = source.match(/(\d{2})\s*[^\d\s]\s*(\d{3})/u);
    if (!match) {
      const reverse = source.match(/(\d{3})\s*[یيىسصالفبجچحخدذرزژشغفقکگلمنوهءئؤۀة]\s*(\d{2})/u);
      if (reverse) match = [reverse[0], reverse[2], reverse[1]];
    }
    const left = faDigits(plate.leftDigits || match?.[1] || '68').replace(/\D/g, '').slice(0, 2) || '68';
    const middle = faDigits(plate.middleDigits || match?.[2] || '127').replace(/\D/g, '').slice(0, 3) || '127';
    const regionMatch = source.match(/(?:ایران|iran)\s*[:：-]?\s*(\d{2})/i);
    const region = faDigits(plate.regionalCode || regionMatch?.[1] || '63').replace(/\D/g, '').slice(0, 2) || '63';
    const display = `${toFaDigits(left)} ی ${toFaDigits(middle)}`;
    return { leftDigits: toFaDigits(left), middleDigits: toFaDigits(middle), letter: 'ی', regionalCode: toFaDigits(region), display, displayFull: `${display} · ایران ${toFaDigits(region)}` };
  }

  const fa = (value) => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const dateText = (value) => value ? esc(String(value).replace(/-/g, '/')) : 'ثبت نشده';
  function jalaliToGregorian(jy,jm,jd){
    jy=Number(jy);jm=Number(jm);jd=Number(jd);let jy2=jy-979;let days=365*jy2+Math.floor(jy2/33)*8+Math.floor(((jy2%33)+3)/4);const jdDays=[31,31,31,31,31,31,30,30,30,30,30,29];for(let i=0;i<jm-1;i++)days+=jdDays[i]||0;days+=jd-1;let gd=days+79;let gy=1600+400*Math.floor(gd/146097);gd%=146097;let leap=true;if(gd>=36525){gd--;gy+=100*Math.floor(gd/36524);gd%=36524;if(gd>=365)gd++;else leap=false;}gy+=4*Math.floor(gd/1461);gd%=1461;if(gd>=366){leap=false;gd--;gy+=Math.floor(gd/365);gd%=365;}const md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];let gm=0;while(gm<12&&gd>=md[gm]){gd-=md[gm];gm++;}return [gy,gm+1,gd+1];
  }
  function daysUntil(jalali){
    const m=faDigits(jalali).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);if(!m)return null;
    const [gy,gm,gd]=jalaliToGregorian(+m[1],+m[2],+m[3]);
    const todayParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const t=Object.fromEntries(todayParts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    const now=Date.UTC(+t.year,+t.month-1,+t.day), target=Date.UTC(gy,gm-1,gd);
    return Math.round((target-now)/86400000);
  }
  function expirationMarkup(label, value, type){
    const days=daysUntil(value);
    if(!value)return `<div class="docs-expiry docs-expiry-muted"><span>${esc(label)}</span><b>تاریخ ثبت نشده</b></div>`;
    let cls='ok',status=`${fa(days)} روز باقی‌مانده`;
    if(days<0){cls='expired';status=`${fa(Math.abs(days))} روز از انقضا گذشته`;}
    else if(days<=7){cls='urgent';status=days===0?'امروز منقضی می‌شود':`${fa(days)} روز تا انقضا`;}
    else if(days<=30){cls='soon';status=`${fa(days)} روز تا انقضا`;}
    return `<div class="docs-expiry ${cls}"><span>${esc(label)} · ${esc(type)}</span><b>${dateText(value)}</b><small>${status}</small></div>`;
  }
  function setStatus(message, error=false){const n=$('docsAuthStatus');if(n){n.textContent=message;n.classList.toggle('is-error',error);}}
  function setInsuranceStatus(message,error=false){const n=$('docsInsuranceStatus');if(n){n.textContent=message;n.classList.toggle('is-error',error);}}
  async function api(path, options={}){
    const response=await fetch(`${WORKER}${path}`,{...options,cache:'no-store',headers:{'Accept':'application/json','Authorization':`Bearer ${accessToken}`,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    let payload={};try{payload=await response.json();}catch{}
    if(!response.ok)throw new Error(payload.message||payload.error||`HTTP ${response.status}`);
    return payload;
  }
  function showPrivate(){
    $('docsLockedPanel')?.setAttribute('hidden','');$('docsContent')?.removeAttribute('hidden');
    $('docsLockState').textContent='باز · نشست خصوصی';$('docsLockState').classList.add('is-unlocked');
  }
  function lock(){
    accessToken='';documents=null;
    $('docsAccessToken').value='';$('docsInsuranceForm')?.reset();$('docsContent')?.setAttribute('hidden','');$('docsLockedPanel')?.removeAttribute('hidden');
    $('docsLockState').textContent='قفل است';$('docsLockState').classList.remove('is-unlocked');
    ['docsRegistrationCard','docsLicenseCard','docsInspectionCard','docsInsuranceCard','docsExpiryAlerts'].forEach(id=>{const n=$(id);if(n)n.replaceChildren();});
    setStatus('نشست خصوصی بسته شد. توکن در حافظه نگهداری نمی‌شود.');
  }
  function kvRows(items){return items.map(([k,v])=>`<div class="docs-kv"><span>${esc(k)}</span><b>${esc(v||'—')}</b></div>`).join('');}
  function render(d){
    documents=d||{};
    const v = d.vehicle || {};
    const p = normalizePlate(d.plate || {});
    const r = d.registration || {};
    const l = d.driverLicense || {};
    const t = d.technicalInspection || {};
    const ins = d.insurance || {};
    $('docsPlateVisual').innerHTML=`<span>${esc(p.leftDigits||'••')}</span><b>${esc(p.letter||'•')}</b><span>${esc(p.middleDigits||'•••')}</span><strong>ایران<br><em>${esc(p.regionalCode||'••')}</em></strong>`;
    $('docsPlateCaption').textContent=p.displayFull;
    $('docsRegistrationCard').innerHTML=`<div class="docs-card-brand"><span>🇮🇷 سند مالکیت وسیله نقلیه</span><small>VEHICLE REGISTRATION</small></div><h3>مشخصات خودرو</h3><div class="docs-registration-model">PEUGEOT <b>206 · SD</b></div><div class="docs-kv-grid">${kvRows([['نام مالک',r.ownerName],['کد ملی مالک',r.ownerNationalId],['نوع کاربری',v.bodyType],['تیپ درج‌شده',v.trimOnCard],['سال ساخت',v.modelYearJalali],['ظرفیت',`${v.seats||'—'} نفر`],['نوع سوخت',v.fuel],['رنگ',v.color],['شماره موتور',r.engineNumber],['شماره شاسی',r.chassisNumber],['VIN',r.vin],['سریال کارت',r.cardSerial]])}</div><div class="docs-card-footer"><span>IRAN · VEHICLE ID</span><b>${esc(p.display||'—')} / ${esc(p.regionalCode||'—')}</b></div>`;
    const licenseCategories=Array.isArray(l.categories)?l.categories:[];
    const licenseCategoryMarkup=licenseCategories.length?`<div class="docs-license-categories"><b>دسته‌های مجاز درج‌شده در پشت کارت</b>${licenseCategories.map(item=>`<div class="docs-license-category"><span>${esc(item.type||'دسته رانندگی')}</span><strong>${esc(item.status||'—')}</strong><small>اولین صدور: ${dateText(item.firstIssueDateJalali)}</small></div>`).join('')}</div>`:'';
    $('docsLicenseCard').innerHTML=`<div class="docs-card-brand"><span>🇮🇷 گواهینامه رانندگی</span><small>DRIVING LICENSE</small></div><div class="docs-license-main"><div><span class="docs-license-kicker">HOLDER</span><h3>${esc(l.holderName||'—')}</h3><p>مشخصات دارندهٔ گواهینامه؛ مستقل از مالک کارت خودرو</p></div><div class="docs-license-seal">✓</div></div><div class="docs-kv-grid">${kvRows([['شماره ملی',l.nationalId],['شماره گواهینامه',l.licenseNumber],['سریال کارت',l.cardSerial],['تاریخ تولد',l.birthDateJalali],['تاریخ صدور کارت',l.issueDateJalali],['مدت اعتبار',l.validityYears?`${fa(l.validityYears)} سال`:'—'],['تاریخ انقضا',l.expiryDateJalali]])}</div>${licenseCategoryMarkup}<div class="docs-card-footer"><span>EXPIRY ${esc(l.expiryDerived?'محاسبه‌شده از اعتبار درج‌شده':'ثبت‌شده روی کارت')}</span><b>${dateText(l.expiryDateJalali)}</b></div>`;
    const plateAtInspection=t.plateAtInspection||'';
    const inspectionPlateNote=plateAtInspection?`<div class="docs-inspection-plate-note"><b>پلاک درج‌شده در برگهٔ معاینه فنی</b><strong>${esc(plateAtInspection)}</strong><small>${esc(t.plateAtInspectionNote||'این شماره مطابق تصویر برگه ثبت شده و الزاماً پلاک فعلی نیست.')}</small></div>`:'';
    $('docsInspectionCard').innerHTML=`<div class="docs-card-brand"><span>🛠 برگه معاینه فنی</span><small>TECHNICAL INSPECTION</small></div><div class="docs-inspection-stamp">مجاز</div><h3>گواهی معاینه فنی خودرو</h3><div class="docs-kv-grid">${kvRows([['شماره گواهی',t.certificateNumber],['مرکز',t.center],['تاریخ صدور',t.issueDateJalali],['تاریخ اعتبار',t.expiryDateJalali],['ساعت ثبت',t.testTime],['تعداد مراجعه',t.visitCount?`${fa(t.visitCount)} بار`:'—'],['نوع سوخت',t.fuel],['مدل درج‌شده',t.inspectionModel],['سال ساخت',t.modelYearJalali||v.modelYearJalali]])}</div>${inspectionPlateNote}${expirationMarkup('اعتبار معاینه فنی',t.expiryDateJalali,'معاینه فنی')}`;
    const hasInsurance=Boolean(ins.expiryDateJalali);
    $('docsInsuranceCard').innerHTML=`<div class="docs-card-brand"><span>🛡 بیمه خودرو</span><small>INSURANCE POLICY</small></div>${hasInsurance?`<h3>${esc(ins.provider||'بیمه شخص ثالث')}</h3><div class="docs-kv-grid">${kvRows([['شماره بیمه‌نامه',ins.policyNumber],['بیمه‌گذار',ins.insuredName],['تاریخ صدور',ins.issueDateJalali],['تاریخ انقضا',ins.expiryDateJalali],['تعهد مالی',ins.thirdPartyCoverage],['پوشش بدنه',ins.bodyCoverage]])}</div>${expirationMarkup('اعتبار بیمه',''+ins.expiryDateJalali,'بیمه')}`:`<div class="docs-missing-insurance"><b>اطلاعات بیمه‌نامه ثبت نشده</b><p>تصویر بیمه‌نامه در آرشیو ارسالی نبود. تاریخ صدور و انقضا را از روی بیمه‌نامه وارد کن تا یادآور فعال شود.</p><span>WAITING FOR POLICY DATA</span></div>`}`;
    $('docsExpiryAlerts').innerHTML=[expirationMarkup('معاینه فنی',t.expiryDateJalali,'سند'),expirationMarkup('بیمه شخص ثالث',ins.expiryDateJalali,'سند'),expirationMarkup('گواهینامه',l.expiryDateJalali,'سند')].join('');
    $('docsUpdatedAt').textContent=d.updatedAt?`آخرین به‌روزرسانی: ${d.updatedAt}`:'اطلاعات خصوصی';
    const form=$('docsInsuranceForm');
    if(form){for(const key of ['provider','policyNumber','insuredName','issueDateJalali','expiryDateJalali','thirdPartyCoverage','bodyCoverage']){const el=form.elements.namedItem(key);if(el)el.value=ins[key]||'';}}
    showPrivate();
  }
  async function unlock(event){
    event.preventDefault();
    const token = $('docsAccessToken').value;

if (token.length === 0) {
  setStatus('لطفاً رمز دسترسی را وارد کن.', true);
  return;
}
    accessToken=token;$('docsAccessToken').value='';$('docsUnlockButton').disabled=true;$('docsUnlockButton').textContent='در حال دریافت مدارک…';
    try{const result=await api('/api/private/documents');if(!result.documents)throw new Error('پاسخ Worker شامل مدارک معتبر نیست.');render(result.documents);renewPrivateSession();setStatus('مدارک خصوصی با موفقیت دریافت شدند.');log('info','دسترسی خصوصی مدارک برقرار شد.',{documentTypes:['registration','driverLicense','technicalInspection','insurance']});}
    catch(error){accessToken='';$('docsAccessToken').value='';setStatus(`دریافت مدارک ناموفق بود: ${error.message}`,true);log('warn','دسترسی به گاوصندوق مدارک ناموفق بود.',{message:error.message});}
    finally{$('docsUnlockButton').disabled=false;$('docsUnlockButton').textContent='🔓 بازکردن گاوصندوق';}
  }
  async function saveInsurance(event){
    event.preventDefault();if(!accessToken){setInsuranceStatus('ابتدا گاوصندوق مدارک را باز کن.',true);return;}
    const form=event.currentTarget;const data=Object.fromEntries(new FormData(form).entries());
    data.issueDateJalali=faDigits(data.issueDateJalali).replace(/-/g,'/');data.expiryDateJalali=faDigits(data.expiryDateJalali).replace(/-/g,'/');
    $('docsInsuranceSave').disabled=true;$('docsInsuranceSave').textContent='در حال ذخیره امن…';
    try{const result=await api('/api/private/documents/insurance',{method:'POST',body:JSON.stringify(data)});render(result.documents);setInsuranceStatus('اطلاعات بیمه در فضای خصوصی Cloudflare ذخیره شد؛ یادآور روزانه فعال است.');log('info','اطلاعات بیمه‌نامه در فضای خصوصی به‌روزرسانی شد.',{hasExpiry:Boolean(data.expiryDateJalali)});}
    catch(error){setInsuranceStatus(`ذخیره انجام نشد: ${error.message}`,true);log('error','ذخیره اطلاعات بیمه‌نامه ناموفق بود.',{message:error.message});}
    finally{$('docsInsuranceSave').disabled=false;$('docsInsuranceSave').textContent='💾 ذخیره امن اطلاعات بیمه';}
  }
  let inactivityTimer=0;
  function renewPrivateSession(){if(!accessToken)return;clearTimeout(inactivityTimer);inactivityTimer=setTimeout(()=>{lock();setStatus('نشست خصوصی به‌دلیل ۱۵ دقیقه عدم فعالیت قفل شد.');},15*60*1000);}
  document.addEventListener('DOMContentLoaded',()=>{
    $('docsUnlockForm')?.addEventListener('submit',unlock);
    $('docsInsuranceForm')?.addEventListener('submit',saveInsurance);
    $('docsLockButton')?.addEventListener('click',lock);
    ['pointerdown','keydown','touchstart'].forEach(type=>document.addEventListener(type,renewPrivateSession,{passive:true}));
    window.addEventListener('pagehide',lock);
    log('info','ماژول مدارک خصوصی آماده شد.');
  });
})();
