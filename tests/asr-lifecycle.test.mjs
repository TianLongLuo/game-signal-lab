import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createBackend} from '../server/app.js';

async function fixture(t) {
 let mode='ok', calls=0, aborted=0;
 const backend=await createBackend({databasePath:':memory:',secureCookies:false,publicOrigin:'http://game.test',env:{CONFIG_MASTER_KEY:randomBytes(32).toString('base64url'),ADMIN_BOOTSTRAP_PASSWORD:'asr-test-password-long',FUNASR_BASE_URL:'http://127.0.0.1:8000'},fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).hostname,'127.0.0.1','audio must never leave loopback');calls++;
  if(mode==='fail')throw new Error('local offline');
  if(mode==='wait')return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>{aborted++;reject(options.signal.reason);},{once:true});});
  return Response.json({text:'你好，今天很好。'});
 }});
 await backend.listen();t.after(()=>backend.close());
 backend.db.prepare("INSERT INTO agent_access_policy(singleton_id,global_enabled,updated_at) VALUES(1,1,'now') ON CONFLICT(singleton_id) DO UPDATE SET global_enabled=1").run();
 const base=`http://127.0.0.1:${backend.server.address().port}`, cookies=new Map();
 const request=async(path,body,signal,method=body?'POST':'GET')=>{
  const response=await fetch(base+path,{method,signal,headers:{Origin:'http://game.test','Content-Type':'application/json','X-CSRF-Token':cookies.get('game_csrf')||cookies.get('game_pre_csrf')||'',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of response.headers.getSetCookie()){const [k,v]=cookie.split(';')[0].split('=');cookies.set(k,v);}
  return {status:response.status,type:response.headers.get('content-type'),body:await response.json()};
 };
 await request('/api/auth/csrf');
 assert.equal((await request('/api/auth/register',{username:'asr-member',password:'asr-member-password-long'})).status,201);
 const me=(await request('/api/me')).body;
 await request('/api/me/external-ai-consent',{accepted:true,policyVersion:me.externalAiConsent.policyVersion},undefined,'PUT');
 const audio={audio:'data:audio/wav;base64,UklGRldBVkU=',priority:'final',language:'zh'};
 return {request,audio,setMode:v=>mode=v,calls:()=>calls,aborted:()=>aborted};
}
test('FunASR failure returns a local error and never falls back; completed audio uses JSON, not simulated streaming',async t=>{
 const h=await fixture(t);h.setMode('fail');
 const bad=await h.request('/api/voice/asr',h.audio);
 assert.equal(bad.status,503);assert.match(bad.body.error.message,/未发送至云端/);assert.equal(h.calls(),1);
 h.setMode('ok');
 for(let i=0;i<2;i++){
  const r=await h.request('/api/voice/asr',{...h.audio,stream:true});
  assert.equal(r.status,200);assert.match(r.type,/application\/json/);assert.equal(r.body.text,'你好，今天很好。');
 }
 assert.equal((await h.request('/api/voice/tts',{text:'hello'})).status,404);
});
test('client disconnect aborts inference and frees the single slot for the next recording',async t=>{
 const h=await fixture(t);h.setMode('wait');const controller=new AbortController();
 const pending=h.request('/api/voice/asr',h.audio,controller.signal);
 while(!h.calls())await delay(5);
 controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');
 for(let i=0;i<100&&!h.aborted();i++)await delay(5);
 assert.equal(h.aborted(),1);
 h.setMode('ok');assert.equal((await h.request('/api/voice/asr',h.audio)).status,200);
});
