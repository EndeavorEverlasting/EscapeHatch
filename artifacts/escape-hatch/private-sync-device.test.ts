import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { readPreferences, savePreferences } from './preference-file.ts';
import { createLocalSyncKey, runPrivateSync } from './private-sync-device.ts';

test('two paired synthetic devices exchange encrypted answers and refuse conflicting offline edits', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'eh-encrypted-devices-'));
  const a=path.join(root,'desktop'),b=path.join(root,'laptop'),carrier=path.join(root,'carrier');
  const aa={dataHome:a,carrier},bb={dataHome:b,carrier};
  const file=home=>path.join(home,'application-question-preferences.json');
  const record=value=>{
    const p=emptyPreferences();
    p.preferences['talent_community.primary_areas']={scope:'profile_preference',source:'user',value,updated_at:'2026-11-03T00:00:00Z'};
    p.application_privacy_acknowledgement_enabled=true;
    return p;
  };
  try {
    await createLocalSyncKey(aa);
    await fs.mkdir(b,{recursive:true});
    await fs.copyFile(path.join(a,'private-sync.key'),path.join(b,'private-sync.key'));
    await savePreferences(record('Synthetic Alpha'),file(a));
    assert.equal((await runPrivateSync(aa,'push')).state,'PUSHED');
    const files=await fs.readdir(carrier);
    assert.equal(files.length,1);
    assert.equal((await fs.readFile(path.join(carrier,files[0]),'utf8')).includes('Synthetic Alpha'),false);
    assert.equal((await runPrivateSync(bb,'pull')).state,'PULLED');
    assert.equal((await readPreferences(file(b))).preferences['talent_community.primary_areas']?.value,'Synthetic Alpha');
    assert.equal((await readPreferences(file(b))).application_privacy_acknowledgement_enabled,false,
      'device-local consent is never synced');
    await savePreferences(record('Synthetic Beta'),file(b));
    assert.equal((await runPrivateSync(bb,'push')).state,'PUSHED');
    assert.equal((await runPrivateSync(aa,'pull')).state,'PULLED');
    assert.equal((await readPreferences(file(a))).preferences['talent_community.primary_areas']?.value,'Synthetic Beta');
    await savePreferences(record('Offline A'),file(a));
    await savePreferences(record('Offline B'),file(b));
    assert.equal((await runPrivateSync(aa,'push')).state,'PUSHED');
    await assert.rejects(runPrivateSync(bb,'push'),/SYNC_CONFLICT_REMOTE_ADVANCED/);
    await assert.rejects(runPrivateSync(bb,'pull'),/SYNC_CONFLICT_LOCAL_CHANGES/);
    assert.equal((await readPreferences(file(b))).preferences['talent_community.primary_areas']?.value,'Offline B');
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
