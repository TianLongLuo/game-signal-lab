import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
for(const name of ['Story','Agent']) test(`${name} final transcription releases Send without awaiting punctuation`,async()=>{
 const start=source.indexOf(`async function finalize${name}Recording(`);
 const end=source.indexOf('\nfunction ',start);
 const story={finalizeGeneration:1,active:true,finalizingVoice:true,draftInput:''};
 const agent={generation:1,finalizingVoice:true,voiceDraft:''};
 const context={storyIntake:story,agentVoice:agent,window:{setTimeout:()=>0,clearTimeout:()=>{}},document:{querySelector:()=>null},requestAnimationFrame:()=>{},
 waitForLiveAsrRequest:async()=>{},streamTranscribeRecordedAudio:async()=> '原始转写',
 organizeRecognizedVoice:()=>new Promise(()=>{}),appendVoiceTranscript:(a,b)=>[a,b].filter(Boolean).join('\n'),
 FINAL_ASR_WITH_PREVIEW_TIMEOUT_MS:35000,FINAL_ASR_WITHOUT_PREVIEW_TIMEOUT_MS:35000,
 updateStoryVoiceStatus:()=>{},renderStoryViewPreservingScroll:()=>{},stopStoryLiveAsr:()=>{},
 updateAgentVoiceStatus:()=>{},updateAgentVoiceDraft:t=>agent.voiceDraft=t,updateAgentVoiceButton:()=>{},
 offerVoicePunctuation:()=>{},PlatformError:Error,showToast:()=>{}};
 const finalize=runInNewContext(`(${source.slice(start,end)})`,context);
 const finished=await Promise.race([finalize(new Blob(['wav']),{preview:'',generation:1}).then(()=>true),new Promise(r=>setTimeout(()=>r(false),30))]);
 assert.equal(finished,true);assert.equal(name==='Story'?story.finalizingVoice:agent.finalizingVoice,false);
 assert.equal(name==='Story'?story.draftInput:agent.voiceDraft,'原始转写');
});

for(const mode of ['apply','edited','new-recording']) test(`optional punctuation is nonblocking and guards ${mode}`,async()=>{
 let release,current=true,applied='';const listeners=new Map();
 const input={value:'原文',isConnected:true,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),after:()=>{}};
 const button={dataset:{},disabled:false};
 const context={document:{querySelector:s=>s==='#draft'?input:null,createElement:()=>button},detectLocale:()=> 'zh',AbortController,
 organizeRecognizedVoice:()=>new Promise(r=>release=r)};
 const start=source.indexOf('function offerVoicePunctuation('),end=source.indexOf('\nasync function organizeRecognizedVoice(',start);
 const offer=runInNewContext(`(${source.slice(start,end)})`,context);
 offer('#draft',{isCurrent:()=>current,apply:t=>applied=t,maxLength:100});
 assert.equal(button.type,'button');assert.equal(release,undefined,'no provider request until explicit click');
 const pending=button.onclick();
 if(mode==='edited'){input.value='已编辑';listeners.get('input')();input.value='原文';}
 if(mode==='new-recording')current=false;
 release({text:'原文。'});await pending;
 assert.equal(input.value,mode==='apply'?'原文。':'原文');
 assert.equal(applied,mode==='apply'?'原文。':'');assert.equal(listeners.size,0);
});
