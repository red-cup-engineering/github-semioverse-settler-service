import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { FileReceiptStore } from '../src/file-receipt-store.mjs';
import { retainIntegrationEvent as retain, integrationEvidenceId as id } from '@red-cup-engineering/git-services-section/integration-eligibility';

const target={repository:'house/source',repositoryId:7,number:83},head='a'.repeat(40),base='b'.repeat(40),at='2026-10-16T15:00:00Z',now='2026-10-16T16:00:00Z';
const observation={target,head,expectedHead:head,baseHead:base,baseRef:'main',authorId:1,draft:false,open:true,mergeable:true,
 policy:{state:'known',repositoryId:7,evidence:'fixture:policy',baseRef:'main',baseHead:base,requiredChecks:[],minimumApprovals:0,eligibleReviewerIds:[]},reviews:{complete:true,items:[]},checks:{complete:true,items:[]}};
const first={target,sequence:1,previous:null,type:'observation',at,data:observation};
const next=(prior,type,data)=>({target,sequence:prior.sequence+1,previous:id(prior),type,at,data});
const request=event=>({target:event.target,event,now,maxAgeMs:7200000});
const apply=(path,event)=>retain({...request(event),store:new FileReceiptStore(path)});
function worker(path,event,{pauseMs=0,gate,ready,fence=false,age=false}={}){
 const storeUrl=new URL('../src/file-receipt-store.mjs',import.meta.url).href;
 const reducerUrl=import.meta.resolve('@red-cup-engineering/git-services-section/integration-eligibility');
 const code=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 const path=${JSON.stringify(path)},opts=${JSON.stringify({pauseMs,gate,ready,fence,age})};const original=fs.writeFileSync;
 let paused=false;fs.writeFileSync=function(name,...args){
  if(!paused&&String(name).startsWith(path+'.')&&String(name).endsWith('.tmp')){
   paused=true;
   if(opts.age){const owner=JSON.parse(fs.readFileSync(path+'.lock/owner.json','utf8'));owner.acquiredAt='2000-01-01T00:00:00Z';original(path+'.lock/owner.json',JSON.stringify(owner));}
   if(opts.ready)original(opts.ready,'ready');
   if(opts.pauseMs)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,opts.pauseMs);
   if(opts.gate){const until=Date.now()+15000;while(!fs.existsSync(opts.gate)){if(Date.now()>until)throw new Error('test gate timeout');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}
   if(opts.fence)original(path+'.lock/owner.json',JSON.stringify({lockId:'replacement',pid:process.pid,acquiredAt:'2026-10-16T15:00:00Z'}));
  }
  return original.call(this,name,...args);
 };syncBuiltinESMExports();
 const {FileReceiptStore}=await import(${JSON.stringify(storeUrl)});const {retainIntegrationEvent}=await import(${JSON.stringify(reducerUrl)});
 try{console.log(JSON.stringify(retainIntegrationEvent({...${JSON.stringify(request(event))},store:new FileReceiptStore(path)})));}
 catch(e){console.log(JSON.stringify({error:e.code??e.message}));process.exitCode=2;}`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let output='',errors='';
 child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>errors+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,result:output?JSON.parse(output):null,errors}));});
 return {child,done};
}
async function ready(path){for(let n=0;n<500;n++){if(existsSync(path))return;await wait(10);}throw new Error('worker readiness timeout');}

for(const realTime of [false,true])test(`paused live writer cannot erase denial (${realTime?'actual 34-second pause':'deterministic aged lock'})`,async()=>{
 const dir=mkdtempSync(join(tmpdir(),'receipt-pause-')),path=join(dir,'store.json'),signal=join(dir,'ready'),gate=join(dir,'continue');let a;
 try{
  apply(path,first);const observed=next(first,'observation',observation),denied=next(first,'denial',{id:'must-survive',authority:'host',reason:'held'});
  a=worker(path,observed,{ready:signal,...(realTime?{pauseMs:34000}:{gate,age:true})});await ready(signal);
  if(realTime)await wait(31000);
  const b=await worker(path,denied).done;
  assert.equal(b.code,2,b.errors);assert.equal(b.result.error,'RECEIPT_STORE_LOCK_HELD');
  if(!realTime)writeFileSync(gate,'continue');
  const aResult=await a.done;assert.equal(aResult.code,0,aResult.errors);
  const received=apply(path,next(observed,'denial',denied.data));assert.equal(received.phase,'SUSPENDED');
  assert.equal(apply(path,first).phase,'SUSPENDED');assert.equal(apply(path,first).denials[0].id,'must-survive');
 }finally{a?.child.kill();rmSync(dir,{recursive:true,force:true});}
});
test('replacement token fences stale publication and preserves replacement lock',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'receipt-fence-')),path=join(dir,'store.json');
 try{apply(path,first);const before=readFileSync(path,'utf8');const result=await worker(path,next(first,'observation',observation),{fence:true}).done;
  assert.equal(result.result.error,'RECEIPT_STORE_LOCK_LOST');assert.equal(readFileSync(path,'utf8'),before);
  assert.equal(JSON.parse(readFileSync(path+'.lock/owner.json')).lockId,'replacement');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('different stream keys share the same exclusion and preserve both receipts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'receipt-streams-')),path=join(dir,'store.json'),signal=join(dir,'ready'),gate=join(dir,'continue');let a;
 try{apply(path,first);const observed=next(first,'observation',observation);
  const foreign={target:{...target,number:84},sequence:1,previous:null,type:'denial',at,data:{id:'other-denial',authority:'host',reason:'held'}};
  a=worker(path,observed,{ready:signal,gate,age:true});await ready(signal);
  assert.equal((await worker(path,foreign).done).result.error,'RECEIPT_STORE_LOCK_HELD');
  writeFileSync(gate,'continue');assert.equal((await a.done).code,0);
  assert.equal(apply(path,foreign).phase,'SUSPENDED');assert.equal(apply(path,first).phase,'EVIDENCE_READY');
  assert.equal(apply(path,foreign).denials[0].id,'other-denial');
 }finally{a?.child.kill();rmSync(dir,{recursive:true,force:true});}
});
test('dead-owner and incomplete locks stay preserved for exclusive recovery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'receipt-dead-')),path=join(dir,'store.json');
 try{const child=spawn(process.execPath,['-e','']);await new Promise(resolve=>child.on('close',resolve));
  mkdirSync(path+'.lock');writeFileSync(path+'.lock/owner.json',JSON.stringify({lockId:'dead',pid:child.pid,acquiredAt:at}));
  const store=new FileReceiptStore(path);assert.throws(()=>store.put('denial',{id:'d'}),e=>e.code==='RECEIPT_STORE_LOCK_RECOVERY_REQUIRED');
  assert.equal(JSON.parse(readFileSync(path+'.lock/owner.json')).lockId,'dead');rmSync(path+'.lock/owner.json');
  assert.throws(()=>store.put('denial',{id:'d'}),e=>e.code==='RECEIPT_STORE_LOCK_RECOVERY_REQUIRED');assert.ok(existsSync(path+'.lock'));assert.equal(store.get('denial'),null);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
