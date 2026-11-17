const assert = require('node:assert/strict');
const { boot } = require('./boot.cjs');
const flush = async (k = 4) => {
  for (let i = 0; i < k; i++) await new Promise(r => setTimeout(r, 0));
};
// 5.6: the cuota is kept in workspace_settings.cuota (shared with partners); without the column it stays on the device.
async function test() {
  const dom = boot(),
    run = s => dom.window.run(s),
    j = s => JSON.parse(run('JSON.stringify(' + s + ')'));
  run(
    `localStorage.clear();window.sent=[];supabase.from=t=>({update:v=>({eq:async(c,id)=>{window.sent.push([t,v,id]);return{error:window.fail?{message:'x'}:null}}})})`
  );
  // Column not there yet: device only, nothing sent.
  run(`S.settings={filament_price_per_kg:1};saveCuota({name:'Impresora',amount:'67633',due:'2026-12-01'})`);
  await flush();
  assert.deepEqual(j('sent'), []);
  assert.deepEqual(j('loadCuota()'), { name: 'Impresora', amount: 67633, due: '2026-12-01' });
  // Column present: saved in the database and read from it (a partner's device has no local copy).
  run(`localStorage.clear();S.settings={cuota:null};saveCuota({name:'Impresora',amount:67633,due:''})`);
  await flush();
  assert.deepEqual(j('sent'), [
    ['workspace_settings', { cuota: { name: 'Impresora', amount: 67633, due: '' } }, run('S.workspace.id')]
  ]);
  run(`localStorage.clear()`);
  assert.equal(run('loadCuota().amount'), 67633);
  // Removing it clears the database and the device.
  run(`sent.length=0;saveCuota(null)`);
  await flush();
  assert.deepEqual(j('sent[0][1]'), { cuota: null });
  assert.equal(run('loadCuota()'), null);
  // A failing save never breaks the screen.
  run(`window.fail=true;saveCuota({name:'a',amount:5})`);
  await flush();
  assert.equal(run('loadCuota().amount'), 5);
  console.log(
    'PASS 5.6 Cuota: se guarda en la base (workspace_settings.cuota) y, sin la columna, en el dispositivo.'
  );
}
test().catch(e => {
  console.error(e);
  process.exit(1);
});
