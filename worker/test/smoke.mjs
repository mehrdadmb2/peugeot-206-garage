import worker from '../src/index.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const files = new Map();
const sent = [];
let serial = 1;
const config = await readFile(new URL('../../data/config.json', import.meta.url),'utf8');
files.set('data/config.json',{content:config,sha:'sha0'});
files.set('data/index.json',{content:JSON.stringify({schemaVersion:1,updatedAt:null,months:[]}),sha:'sha1'});
function encode(text){const bytes=new TextEncoder().encode(text);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin)}
function decode(text){return new TextDecoder().decode(Uint8Array.from(atob(text),c=>c.charCodeAt(0)))}
globalThis.fetch = async (input, init={}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if(url.hostname==='api.github.com'){
    const path=decodeURIComponent(url.pathname.split('/contents/')[1]||'');
    if(init.method==='PUT'){
      const body=JSON.parse(init.body);
      files.set(path,{content:decode(body.content),sha:`sha${serial++}`});
      return Response.json({content:{path,sha:`sha${serial}`}}, {status:200});
    }
    const data=files.get(path);
    if(!data)return Response.json({message:'Not Found'}, {status:404});
    return Response.json({sha:data.sha,content:encode(data.content),encoding:'base64'}, {status:200});
  }
  if(url.hostname==='api.telegram.org'){
    if(url.pathname.includes('/sendMessage')) sent.push(JSON.parse(init.body));
    if(url.pathname.includes('/sendDocument')) sent.push({document:true});
    return Response.json({ok:true,result:{}},{status:200});
  }
  return Response.json({ok:true},{status:200});
};
const env={GITHUB_OWNER:'testowner',GITHUB_REPO:'peugeot-206-garage',GITHUB_BRANCH:'main',GITHUB_TOKEN:'gh_test',TELEGRAM_BOT_TOKEN:'123:test',TELEGRAM_WEBHOOK_SECRET:'secret_hook_token_123',ALLOWED_TELEGRAM_USER_ID:'111'};
async function message(text){
  const req=new Request('https://worker.test/telegram',{method:'POST',headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':env.TELEGRAM_WEBHOOK_SECRET},body:JSON.stringify({message:{message_id:Date.now(),date:Math.floor(Date.now()/1000),from:{id:111},chat:{id:111,type:'private'},text}})});
  const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return sent.at(-1)?.text||'';
}
console.log((await worker.fetch(new Request('https://worker.test/health'),env,{})).status===200?'PASS health':'FAIL health');
assert.match(await message('/km 156,000'),/ثبت شد/);
assert.match(await message('/trip 85'),/مسافت/);
assert.match(await message('/km 156.085'),/ثبت شد/);
assert.match(await message('/fuel 20l cost=700000 toman km=156200 full'),/سوخت/);
assert.match(await message('/service engine_oil cost=900000 toman km=156200'),/ثبت\/تعویض قطعه|ثبت شد/);
assert.match(await message('/service oil_filter cost=100000 toman km=156200'),/ثبت شد/);
assert.match(await message('روغن موتور و فیلتر روغن را تعویض کردم هزینه 100 هزار تومان کیلومتر 156200'),/جداگانه ثبت شد/);
assert.match(await message('/fine 500000 toman speeding km=156200'),/ثبت شد/);
const index=JSON.parse(files.get('data/index.json').content);
assert.equal(index.months.length,1);
const logfile=JSON.parse(files.get(`data/logs/${index.months[0]}.json`).content);
assert.equal(logfile.events.length,9);
assert.equal(logfile.events.find(e=>e.type==='fuel').liters,20);
assert.equal(logfile.events.find(e=>e.type==='fuel').costRial,7000000);
const engineOilEvent=logfile.events.find(e=>e.serviceKey==='engine_oil'||e.componentKey==='engine_oil');
assert.equal(engineOilEvent?.odometerKm,156200);
assert.ok(logfile.events.some(e=>(e.type==='service'||e.type==='part')&&(e.serviceKey==='oil_filter'||e.componentKey==='oil_filter')));
assert.ok(logfile.events.some(e=>(e.type==='service'||e.type==='part')&&(e.serviceKey==='engine_oil'||e.componentKey==='engine_oil')));
assert.ok(logfile.events.some(e=>(e.type==='service'||e.type==='part')&&(e.serviceKey==='air_filter'||e.componentKey==='air_filter')) === false);
assert.match(await message('/summary today'),/هزینه سوخت/);
assert.match(await message('/interval engine_oil 4000 120'),/بازه .* ذخیره شد/);
assert.match(await message('/fines'),/پرداخت‌نشده/);
const fine=logfile.events.find(e=>e.type==='fine');
assert.match(await message('/paid '+fine.id.slice(0,8)),/پرداخت جریمه ثبت شد/);
const updated=JSON.parse(files.get(`data/logs/${index.months[0]}.json`).content);
assert.equal(updated.events.find(e=>e.type==='fine').paid,true);
await message('/export');
assert.ok(sent.some(x=>x.document));
const forbidden=await worker.fetch(new Request('https://worker.test/telegram',{method:'POST',headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':'wrong'},body:'{}'}),env,{});
assert.equal(forbidden.status,403);
console.log('PASS smoke: odometer formats, trip distance, fuel, service keys, fine payment, summary, CSV export, interval updates, webhook secret.');
console.log('Stored files:', [...files.keys()].join(', '));
