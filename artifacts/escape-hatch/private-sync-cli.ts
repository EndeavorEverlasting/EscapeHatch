/** Explicit local encrypted sync entrypoint; never prints applicant answers or key. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLocalSyncKey, runPrivateSync } from './private-sync-device.ts';
const action=process.argv[2],carrier=process.argv[3];
if(!['init-key','push','pull'].includes(action)||!carrier||!path.isAbsolute(carrier)) {
  process.stderr.write('Usage: node --experimental-strip-types private-sync-cli.ts init-key|push|pull ABSOLUTE_CARRIER_PATH\n');
  process.exitCode=2;
} else {
  try {
    if(action==='push')await fs.mkdir(carrier,{recursive:true});
    const result=action==='init-key'?await createLocalSyncKey({carrier}):
      await runPrivateSync({carrier},action as 'push'|'pull');
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch(e) {
    const code=e instanceof Error&&/^[A-Z_]+$/.test(e.message)?e.message:'SYNC_FAILED';
    process.stderr.write('Sync refused: '+code+'; existing profile preserved or checkpointed for review.\n');
    process.exitCode=1;
  }
}
