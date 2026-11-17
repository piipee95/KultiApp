const assert = require('node:assert/strict');
const { boot } = require('./boot.cjs');
const flush = async (k = 4) => {
  for (let i = 0; i < k; i++) await new Promise(r => setTimeout(r, 0));
};
// 5.5: Inicio as an operations center: period filter, sales vs cobros vs cost vs profit, variation, chart,
// order/fabrication status, top products, recent activity and the collapsible sidebar.
async function test() {
  const dom = boot(),
    run = s => dom.window.run(s),
    j = s => JSON.parse(run('JSON.stringify(' + s + ')'));
  const today = run('localToday()'),
    day = n => run(`addDays('${today}',${n})`),
    at = d => d + 'T15:00:00Z';
  const prevMonthDay = run(
    `new Date(new Date('${today}T12:00').getFullYear(),new Date('${today}T12:00').getMonth()-1,1).toLocaleDateString('sv-SE')`
  );
  run(`const base={customer_name:'Ana',customer_id:'c1',kind:'customer',iva_enabled:false,iva_rate:.19,inventory_state:'none'};
  S.customers=[{id:'c1',name:'Ana'}];
  S.orders=[
   {...base,id:'o1',order_no:1,title:'Cuadro',product_id:'p1',quantity:2,unit_price:10000,estimated_cost:8000,status:'printing',due_date:'2000-01-01',created_at:'${at(today)}',updated_at:'${at(today)}'},
   {...base,id:'o2',order_no:2,title:'Llavero',product_id:'p2',quantity:10,unit_price:900,estimated_cost:5000,actual_cost:4000,failures_cost:500,status:'shipped',due_date:'2000-01-01',created_at:'${at(today)}',updated_at:'${at(today)}'},
   {...base,id:'o3',order_no:3,title:'Cancelado',quantity:1,unit_price:99999,estimated_cost:1,status:'canceled',created_at:'${at(today)}'},
   {...base,id:'o4',order_no:4,title:'Lote',kind:'stock',quantity:5,unit_price:0,estimated_cost:3000,status:'pending',created_at:'${at(today)}'},
   {...base,id:'o5',order_no:5,title:'Mes pasado',product_id:'p1',quantity:1,unit_price:10000,estimated_cost:6000,status:'delivered',created_at:'${at(prevMonthDay)}'}];
  S.payments=[{id:'a',order_id:'o2',amount:9000,paid_on:'${today}',created_at:'${at(today)}',method:'efectivo'},{id:'b',order_id:'o5',amount:4000,paid_on:'${prevMonthDay}',created_at:'${at(prevMonthDay)}'}];
  S.quotes=[];S.resources=[];S.products=[];S.opsPeriod=null;S.mode='home';render()`);
  // Month is the default; sales, cobros, cost and profit stay distinct.
  const m = j("opsTotals(opsRange('month').from,opsRange('month').to)");
  assert.equal(m.count, 2);
  assert.equal(m.sales, 2 * 10000 + 9000);
  assert.equal(m.collected, 9000);
  assert.equal(m.cost, 8000 + 4500); // real cost (with failures) where it exists, estimate otherwise
  assert.equal(m.profit, 20000 - 8000 + (9000 - 4500));
  assert.equal(m.realCount, 1);
  assert.equal(m.estimatedCount, 1);
  assert.equal(m.profitReal, 4500);
  assert.equal(m.profitEstimated, 12000);
  assert.ok(Math.abs(m.margin - m.profit / 29000) < 1e-9);
  assert.ok(Math.abs(m.markup - m.profit / 12500) < 1e-9); // margin over sales, markup over cost
  assert.equal(m.madeUnits, 5);
  assert.equal(m.madeCost, 3000); // stock fabrication is not a sale
  const kpis = run('q(".ops-kpis").textContent');
  assert.match(kpis, /Ventas\$29\.000\$29 mil2 pedidos190% vs \w+/);
  assert.match(kpis, /Cobros\$9\.000\$9\.0001 pago125% vs \w+/);
  assert.match(kpis, /Costo de fabricación\$12\.500\$13 mil1 real · 1 estimado108% vs \w+/);
  assert.match(kpis, /Ganancia \(real \+ estimada\)\$16\.500\$17 mil/);
  assert.match(kpis, /57% de ganancia · 132% sobre el costo/);
  assert.match(kpis, /Real \$4\.500 · estimada \$12 mil/);
  assert.equal(run('opsSigned(-374)'), '-$374');
  assert.equal(run('q(".ops-col").querySelectorAll("i")[0].getAttribute("style")'), 'height:0;min-height:0');
  assert.match(run('q(".ops-kpis").textContent'), /Real \$4\.500/);
  // Variation: compared with the same elapsed span of the previous month (the +190% above is 29.000 vs 10.000).
  // Existing stock/inventory indicators still live in their own row.
  assert.match(run('q(".kpis").textContent'), /Por cobrar/);
  assert.equal(run('qa(".ops-kpis .kpi").length'), 4);
  // Status of orders and fabrication: shipped counts as open but never late.
  assert.match(
    run('q(".ops-status").textContent'),
    /1Pendientes1En fabricación0Listos para entregar1Enviados1Atrasados/
  );
  assert.match(run('q(".ops-status").textContent'), /1 fabricación para stock en curso/);
  run(`window.went=[];goMode=m=>window.went.push(m);q('[data-ops-go="production:shipped"]').click()`);
  assert.deepEqual(j('went'), ['production']);
  assert.equal(run('S.orderFilter'), 'shipped');
  // Chart: one column per day of the month, bars scaled to the biggest value, empty state without data.
  assert.ok(run('qa(".ops-col").length') >= 28);
  assert.match(run('q(".ops-col[title*=\'ventas $29.000\']").title'), /cobros \$9\.000/);
  // Top products by sales and recent activity.
  assert.match(run('q(".ops-top").textContent'), /Cuadro2 unidades\$20\.000/);
  assert.match(run('q(".ops-top").textContent'), /Llavero10 unidades\$9\.000/);
  assert.ok(!/Cancelado|Lote/.test(run('q(".ops-top").textContent')));
  assert.match(run('q(".ops-activity").textContent'), /Pago de \$9\.000/);
  run(`showOrder=o=>{window.opened=o.id};q('[data-ops-order=o2]').click()`);
  assert.equal(run('window.opened'), 'o2');
  // Period filter: persists, and Hoy/Semana/Año change the numbers.
  run(`q('[data-ops-period=today]').click()`);
  assert.equal(run('S.opsPeriod'), 'today');
  assert.equal(run('localStorage.getItem("kultiapp_ops_period")'), 'today');
  assert.equal(j("opsTotals(opsRange('today').from,opsRange('today').to)").count, 2);
  assert.equal(run('qa(".ops-col").length'), 7); // «Hoy» charts the last seven days
  assert.match(run('q(".ops-kpis").textContent'), /Ventas\$29\.000/);
  run(`q('[data-ops-period=year]').click()`);
  assert.ok(j("opsTotals(opsRange('year').from,opsRange('year').to)").sales >= 29000);
  assert.equal(run('qa(".ops-col").length'), 12);
  run(`q('[data-ops-period=week]').click()`);
  assert.equal(run('qa(".ops-col").length'), 7);
  // Custom range: pick dates, previous span is the same length right before.
  run(`q('[data-ops-period=custom]').click()`);
  run(`q('#opsFrom').value='${prevMonthDay}';q('#opsFrom').dispatchEvent(new Event('change'))`);
  await flush();
  const r = j('opsRange()');
  assert.equal(r.kind, 'custom');
  assert.equal(r.from, prevMonthDay);
  assert.equal(run(`daysBetween('${r.prevFrom}','${r.prevTo}')`), run(`daysBetween('${r.from}','${r.to}')`));
  assert.equal(r.prevTo, run(`addDays('${r.from}',-1)`));
  assert.match(run('q(".ops-kpis").textContent'), /Ventas\$39\.000/);
  assert.match(run('q(".ops-kpis").textContent'), /Cobros\$13\.000/);
  // Empty period: friendly states, no fake numbers.
  run(`S.orders=[];S.payments=[];q('[data-ops-period=today]').click()`);
  assert.match(run('q(".ops-chart-panel").textContent'), /Sin ventas ni cobros/);
  assert.match(run('q(".ops-top").textContent'), /Sin ventas/);
  assert.match(run('q(".ops-activity").textContent'), /Sin actividad/);
  assert.match(run('q(".ops-kpis").textContent'), /Ventas\$0\$00 pedidos/);
  // Collapsible sidebar: persisted per device, nothing lost (labels stay as tooltips).
  assert.equal(run('q("#sideToggle").getAttribute("aria-expanded")'), 'true');
  assert.ok(!run('q("#app").classList.contains("side-collapsed")'));
  run(`q('#sideToggle').click()`);
  assert.ok(run('q("#app").classList.contains("side-collapsed")'));
  assert.equal(run('localStorage.getItem("kultiapp_side")'), '1');
  assert.equal(run('q("#sideToggle").getAttribute("aria-expanded")'), 'false');
  assert.equal(run('q(".nav-item[data-app-mode=home]").title'), 'Inicio');
  run(`render()`);
  assert.ok(run('q("#app").classList.contains("side-collapsed")'));
  run(`q('#sideToggle').click()`);
  assert.ok(!run('q("#app").classList.contains("side-collapsed")'));
  dom.window.close();
  console.log(
    'PASS 5.5 centro de operaciones: periodo (hoy, semana, mes, año, rango), ventas/cobros/costos/utilidad distintos, margen y recargo, variación, gráfico, estado de pedidos, más vendidos, actividad, estados vacíos y menú lateral plegable.'
  );
}
test().catch(e => {
  console.error(e);
  process.exit(1);
});
