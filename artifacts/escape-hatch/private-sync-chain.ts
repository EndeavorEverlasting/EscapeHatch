/** Deterministic immutable branch detector. Never choose a winner by timestamp. */
import type { SyncEnvelope, ReusableProjection } from './private-sync-crypto.ts';
export type CarrierEntry = { file: string; envelope: SyncEnvelope; answers: ReusableProjection };
export function uniqueCarrierHead(entries: CarrierEntry[]) {
  if (!entries.length) return null;
  const byId = new Map(entries.map(x => [x.file.replace(/\.ehsync$/, ''), x]));
  if (byId.size !== entries.length) throw new Error('DUPLICATE_CAPSULE');
  const children = new Map<string, number>();
  let roots=0;
  for(const entry of entries) {
    const parent=entry.envelope.parent;
    if(!parent) roots++;
    else {
      if(!byId.has(parent)) throw new Error('MISSING_PARENT_CAPSULE');
      children.set(parent,(children.get(parent)||0)+1);
    }
  }
  if(roots!==1||[...children.values()].some(n=>n>1)) throw new Error('SYNC_CONFLICT_FORK');
  const heads=entries.filter(x=>!children.has(x.file.replace(/\.ehsync$/,'')));
  if(heads.length!==1) throw new Error('SYNC_CONFLICT_FORK');
  return heads[0];
}
export function isDescendantOf(entries: CarrierEntry[], ancestor: string|null, head: CarrierEntry) {
  if(ancestor===null)return true;
  const byId=new Map(entries.map(x=>[x.file.replace(/\.ehsync$/,''),x]));
  let current: CarrierEntry|undefined=head;
  while(current) {
    const id=current.file.replace(/\.ehsync$/,'');
    if(id===ancestor)return true;
    current=current.envelope.parent?byId.get(current.envelope.parent):undefined;
  }
  return false;
}
