import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
test('Express serves the app and rejects unauthenticated database requests', async () => {
  const server = spawn(process.execPath, ['server.js'], {env:{...process.env,PORT:'3107'},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(server.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timed out')),5000).unref())]);
    const base='http://localhost:3107';
    const page=await fetch(base);
    assert.equal(page.status,200);
    assert.match(await page.text(),/js\/vendor\/supabase.js/);
    const config=await (await fetch(base+'/api/config')).json();
    assert.match(config.url,/^https:\/\//);
    assert.ok(config.key);
    for (const [path,method] of [['state','GET'],['action','POST']]) {
      const response=await fetch(base+'/api/'+path,{method});
      assert.equal(response.status,401);
      assert.equal((await response.json()).error,'Sign in to continue.');
    }
    assert.equal((await fetch(base+'/.env')).status,404);
    assert.equal((await fetch(base+'/database/001_supabase_integration.sql')).status,404);
  } finally { server.kill(); }
});
