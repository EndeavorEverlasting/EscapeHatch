/**
 * Private, conflict-safe sync of the existing preference file.
 * A locally configured encrypted carrier is a transport, not a second profile.
 * A key is provisioned out of band and NEVER written into the carrier.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { userDataRoot } from './user-data.ts';
import { readPreferences, updatePreferences } from './preference-file.ts';
import { readCarrier } from './private-sync-carrier.ts';
import { uniqueCarrierHead, isDescendantOf } from './private-sync-chain.ts';
import { generateSyncKey, sealProjection, envelopeDigest, projectReusablePreferences, projectionDigest, vaultIdForKey } from './private-sync-crypto.ts';

const SCHEMA='escapehatch/private-sync-device/v1';
type State={schema:typeof SCHEMA; vaultId:string; deviceId:string; head:string|null; localDigest:string};
export type Options={carrier:string; dataHome?:string; preferencesFile?:string};
function paths(o:Options) {
  if(!path.isAbsolute(o.carrier))throw new Error('ABSOLUTE_CARRIER_REQUIRED');
  const root=path.resolve(o.dataHome||userDataRoot()),carrier=path.resolve(o.carrier);
  if(root===carrier||carrier.startsWith(root+path.sep)||root.startsWith(carrier+path.sep))throw new Error('CARRIER_OVERLAPS_PRIVATE_ROOT');
  return {root,carrier,key:path.join(root,'private-sync.key'),state:path.join(root,'private-sync-device.json'),
    prefs:o.preferencesFile||path.join(root,'application-question-preferences.json')};
}
async function keyAt(p:string) { const key=await fs.readFile(p); if(key.length!==32)throw new Error('INVALID_SYNC_KEY'); return key; }
async function stateAt(p:string,vaultId:string):Promise<State|null>{
  let raw:string;
  try{raw=await fs.readFile(p,'utf8')}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e}
  if(raw.length>4096)throw new Error('INVALID_SYNC_STATE');
  const s=JSON.parse(raw) as State;
  if(s?.schema!==SCHEMA||s.vaultId!==vaultId||!(/^[a-f0-9]{32}$/).test(s.deviceId)||
    (s.head!==null&&!(/^[a-f0-9]{64}$/).test(s.head))||!(/^[a-f0-9]{64}$/).test(s.localDigest))throw new Error('INVALID_SYNC_STATE');
  return s;
}
async function stateWrite(p:string,s:State) {
  const temp=p+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,JSON.stringify(s),{flag:'wx',mode:0o600});await fs.rename(temp,p)}
  finally{await fs.rm(temp,{force:true})}
}
export async function createLocalSyncKey(o:Options) {
  const p=paths(o);await fs.mkdir(p.root,{recursive:true,mode:0o700});
  const key=generateSyncKey();
  await fs.writeFile(p.key,key,{flag:'wx',mode:0o600});
  return {state:'KEY_CREATED_LOCAL_ONLY',vaultId:vaultIdForKey(key)};
}
export async function runPrivateSync(o:Options,action:'push'|'pull') {
  const p=paths(o),key=await keyAt(p.key),vaultId=vaultIdForKey(key);
  const entries=await readCarrier(p.carrier,key);
  const tip=uniqueCarrierHead(entries),state=await stateAt(p.state,vaultId);
  const local=await readPreferences(p.prefs),projection=projectReusablePreferences(local),digest=projectionDigest(projection);
  const head=tip?.file.replace(/\.ehsync$/,'')||null;
  if(action==='push') {
    if(!Object.keys(projection.entries).length)throw new Error('EMPTY_EXPORT_REFUSED');
    if(!state&&tip)throw new Error('PAIR_BY_PULL_FIRST');
    if(state&&state.head!==head)throw new Error('SYNC_CONFLICT_REMOTE_ADVANCED');
    if(state&&state.localDigest===digest)return {state:'UP_TO_DATE',vaultId,count:entries.length};
    const deviceId=state?.deviceId||randomUUID().replaceAll('-','');
    const capsule=sealProjection(projection,key,head,deviceId);
    const id=envelopeDigest(capsule);
    await fs.mkdir(p.carrier,{recursive:true});
    await fs.writeFile(path.join(p.carrier,id+'.ehsync'),JSON.stringify(capsule),{flag:'wx',mode:0o600});
    await stateWrite(p.state,{schema:SCHEMA,vaultId,deviceId,head:id,localDigest:digest});
    return {state:'PUSHED',vaultId,count:entries.length+1};
  }
  if(!tip)return {state:'NO_REMOTE',vaultId,count:0};
  if(state&&!isDescendantOf(entries,state.head,tip))throw new Error('SYNC_CONFLICT_REMOTE_DIVERGED');
  if(state?.head===head) {
    if(state.localDigest!==digest)throw new Error('LOCAL_UNSYNCED_CHANGES');
    return {state:'UP_TO_DATE',vaultId,count:entries.length};
  }
  const remoteDigest=projectionDigest(tip.answers);
  const blank=Object.keys(projection.entries).length===0;
  if((state?digest!==state.localDigest:!blank)&&digest!==remoteDigest)throw new Error('SYNC_CONFLICT_LOCAL_CHANGES');
  if(digest!==remoteDigest)await updatePreferences(current=>{
    const localNow=projectReusablePreferences(current);
    if(projectionDigest(localNow)!==digest)throw new Error('SYNC_CONFLICT_LOCAL_CHANGES');
    const next={...current,preferences:{...current.preferences}};
    for(const id of Object.keys(localNow.entries))delete next.preferences[id];
    Object.assign(next.preferences,tip.answers.entries);
    return next;
  },p.prefs);
  await stateWrite(p.state,{schema:SCHEMA,vaultId,deviceId:state?.deviceId||randomUUID().replaceAll('-',''),
    head,localDigest:remoteDigest});
  return {state:'PULLED',vaultId,count:entries.length};
}
