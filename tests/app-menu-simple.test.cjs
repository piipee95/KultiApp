const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
// 5.5: the sidebar shows what is used every day; the rest sits under «Más» and nothing is removed.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s),j=s=>JSON.parse(run('JSON.stringify('+s+')'));
 run(`localStorage.clear();S.mode='home';S.navMoreOpen=false;S.sideCollapsed=false;render()`);
 const label=b=>`qa('${b}').map(b=>b.dataset.appMode)`;
 assert.deepEqual(j(label('.app-nav > .nav-item')),['home','dashboard','production','cobrar','customers','finance','inventory']);
 assert.deepEqual(j(label('.nav-more-list .nav-item')),['quotes','files','brand','reports','resources']);
 assert.equal(run('qa(".sidebar .nav-item").length'),12);                   // every section is still reachable
 assert.ok(!run('q(".nav-more").open'));assert.equal(run('q(".nav-more > summary").textContent'),'Más');
 // Opens by itself when you are inside one of the hidden sections, and remembers a manual opening.
 run(`S.mode='reports';render()`);assert.ok(run('q(".nav-more").open'));assert.equal(run('q(".nav-item.active").dataset.appMode'),'reports');
 run(`S.mode='home';S.navMoreOpen=false;render();q('.nav-more').open=true;q('.nav-more').dispatchEvent(new Event('toggle'));render()`);assert.ok(run('q(".nav-more").open'));
 // With the menu folded to icons the list is always shown (no hidden icons).
 run(`S.navMoreOpen=false;S.sideCollapsed=true;render()`);assert.ok(run('q(".nav-more").open'));
 run(`q('.nav-more-list [data-app-mode=brand]').click()`);
 dom.window.close();
 console.log('PASS 5.5 menú simple: seis secciones diarias a la vista, el resto bajo «Más», se abre solo en una sección oculta y plegado a íconos las muestra todas.');
}
test().catch(e=>{console.error(e);process.exit(1)});
