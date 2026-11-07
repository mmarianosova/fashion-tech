// Run the full local Sortix demo with one fresh database per invocation.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { prepareTeamDemo, teamDemoBatchId, teamDemoDate } from './prepare-team-demo.ts';

const port = Number(process.env.SORTIX_DEMO_PORT ?? '4319');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Set SORTIX_DEMO_PORT to a valid unprivileged port.');
const origin = `http://127.0.0.1:${port}`;
try {
  await fetch(origin, { signal: AbortSignal.timeout(1000) });
  throw new Error(`Port ${port} already has a server. Choose a different SORTIX_DEMO_PORT.`);
} catch (error) {
  if (!(error instanceof TypeError)) throw error;
}
const dir = mkdtempSync(join(tmpdir(), 'sortix-demo-'));
const db = join(dir, 'inventory.db');
prepareTeamDemo(db);
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: `file:${db}`, DATABASE_AUTH_TOKEN: '', ZOO_MODE: 'fake',
    DEMO_TODAY: teamDemoDate, TEXTILE_FLOW_BRIDGE: '1', TEXTILE_FLOW_ORIGIN: origin,
    INTAKE_WEB_LOOKUP: '0', PACE_MS: '20', DEMO_PICKUP_REVIEW_DELAY_MS: '12000' },
});
const finished = new Promise<number>((resolve) => next.once('exit', (code) => resolve(code ?? 0)));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => next.kill(signal));
try {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 80 && next.exitCode === null; attempt++) {
    try {
      response = await fetch(origin + '/api/runs/intake', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({batch_id:teamDemoBatchId}) });
      break;
    } catch { await wait(250); }
  }
  if (!response?.ok) throw new Error('Could not start the demo intake batch.');
  console.log(`\nOpen Sortix: ${origin}/team-preview.html?mode=live&embed=1&lock=1&api=${origin}&poll=1000\n`);
  process.exitCode = await finished;
} finally {
  if (next.exitCode === null && next.signalCode === null) {
    next.kill();
    await finished;
  }
  rmSync(dir, {recursive:true, force:true});
}
