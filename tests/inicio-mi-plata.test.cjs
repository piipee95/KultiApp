const assert = require('node:assert/strict');
const { boot } = require('./boot.cjs');
const flush = async (k = 4) => {
  for (let i = 0; i < k; i++) await new Promise(r => setTimeout(r, 0));
};
// 5.5: «Mi plata» in plain words (vendí, me pagaron, me deben, gasté, me queda) and the cuota tracker.
async function test() {
  const dom = boot(),
    run = s => dom.window.run(s),
    j = s => JSON.parse(run('JSON.stringify(' + s + ')'));
  const today = run('localToday()'),
    old = run(`addDays('${today}',-70)`),
    at = d => d + 'T15:00:00Z';
  run(`const base={customer_name:'Ana',customer_id:'c1',kind:'customer',iva_enabled:false,iva_rate:.19,inventory_state:'none',estimated_cost:0,status:'delivered'};
  S.customers=[{id:'c1',name:'Ana'}];
  S.orders=[{...base,id:'o1',order_no:1,title:'Cuadro',quantity:1,unit_price:20000,created_at:'${at(today)}'},
   {...base,id:'o2',order_no:2,title:'Llavero',quantity:1,unit_price:10000,created_at:'${at(today)}'},
   {...base,id:'o3',order_no:3,title:'Lote',kind:'stock',quantity:3,unit_price:0,created_at:'${at(today)}'}];
  S.payments=[{id:'a',order_id:'o1',amount:10000,paid_on:'${today}',created_at:'${at(today)}'},{id:'b',order_id:'o2',amount:10000,paid_on:'${today}',created_at:'${at(today)}'}];
  S.expenses=[{id:'e1',spent_on:'${today}',category:'otros',description:'Cuota impresora',amount:7000},{id:'e2',spent_on:'${old}',category:'otros',description:'Viejo',amount:5000}];
  S.quotes=[];S.resources=[];S.products=[];S.opsPeriod=null;S.mode='home';localStorage.clear();render()`);
  const text = s => run(`q('${s}').textContent`);
  // The four numbers, in the user's words, and what is left.
  assert.match(
    text('.money-sentence'),
    /Vendiste \$30\.000 y te pagaron \$20\.000 este mes\. Te deben \$10\.000\. Gastaste \$7\.000\./
  );
  assert.match(
    text('.money-tiles'),
    /Vendí\$30\.0002 pedidosMe pagaron\$20\.0002 pagosMe deben\$10\.0001 pedido con saldoGasté\$7\.000/
  );
  assert.match(text('.money-left'), /Me queda.*\$13\.000/);
  assert.ok(!run('q(".money-left").classList.contains("neg")'));
  // The old expense is outside the month; «me deben» is what is owed today whatever the period.
  run(`q('[data-ops-period=year]').click()`);
  assert.match(text('.money-tiles'), /Gasté\$12\.000/);
  assert.match(text('.money-tiles'), /Me deben\$10\.000/);
  assert.match(text('.money-sentence'), /este año/);
  run(`q('[data-ops-period=month]').click()`);
  // Tapping a number opens the right place.
  run(`window.went=[];goMode=m=>window.went.push(m);q('[data-ops-go="production:unpaid"]').click()`);
  assert.deepEqual(j('went'), ['production']);
  assert.equal(run('S.orderFilter'), 'unpaid');
  // Spending more than collected shows a negative balance in red.
  run(`S.expenses.push({id:'e3',spent_on:'${today}',category:'otros',amount:50000});render()`);
  assert.match(text('.money-left'), /-\$37\.000/);
  assert.ok(run('q(".money-left").classList.contains("neg")'));
  run(`S.expenses.pop();render()`);
  // Quick actions: record a payment or an expense without leaving Inicio.

  assert.match(text('.money-hint'), /solo cuenta lo que anotas/);
  run(
    `window.exp2=null;window.closeExp=null;showExpense=e=>{window.exp2=e;return{addEventListener:(t,f)=>{window.closeExp=f}}};q('[data-money-expense]').click()`
  );
  assert.deepEqual(j('exp2'), {});
  run(`window.rendered=0;const r=render;render=()=>{window.rendered++;return r()};closeExp();render=r`);
  assert.equal(run('window.rendered'), 1);
  run(`window.paid=null;addPayment=async(...a)=>{window.paid=a};q('[data-money-paid]').click()`);
  assert.match(text('#quickPayDialog select'), /PED-1 · Cuadro · Ana · debe \$10\.000/);
  assert.equal(run('q("#qpAmount").value'), '10000');
  run(`q('#qpAmount').value='25000';q('#quickPayForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
  await flush();
  assert.match(text('#qpFeedback'), /solo debe \$10\.000/);
  assert.equal(run('window.paid'), null); // never more than what is owed
  run(
    `q('#qpAmount').value='4000';q('#qpMethod').value='cash';q('#quickPayForm').dispatchEvent(new Event('submit',{cancelable:true}))`
  );
  await flush();
  assert.deepEqual(j('paid.slice(1,3)'), [4000, 'cash']);
  assert.equal(run('paid[0].id'), 'o1');
  assert.ok(!run('q("#quickPayDialog")?.open'));
  run(
    `window.toasted=null;toast=m=>{window.toasted=m};S.payments.push({id:'z',order_id:'o1',amount:10000,paid_on:localToday(),created_at:'${at(today)}'});q('[data-money-paid]').click()`
  );
  assert.equal(run('window.toasted'), 'No te deben nada: todo está cobrado.');
  run(`S.payments.pop();S.workspace.role='viewer';render()`);
  assert.ok(run('!q("[data-money-paid]")&&!q("[data-money-expense]")'));
  run(`S.workspace.role='owner';render()`);
  // Detail (chart, top products, activity) is folded away until asked for, and stays open across changes.
  assert.ok(run('!!q(".home-more")&&!q(".home-more").open') && run('!!q(".home-more .ops-kpis")'));
  run(`q('.home-more').open=true;q('.home-more').dispatchEvent(new Event('toggle'))`);
  run(`q('[data-ops-period=week]').click()`);
  assert.ok(run('q(".home-more").open'));
  run(`S.homeMoreOpen=false;q('[data-ops-period=month]').click()`);
  // Cuota: first invitation, then record it.
  assert.match(text('.cuota'), /¿Tienes una cuota que pagar\?/);
  run(`q('[data-cuota-edit]').click()`);
  run(
    `q('#cuName').value='impresora';q('#cuAmount').value='67633';q('#cuForm,#cuotaForm').dispatchEvent(new Event('submit',{cancelable:true}))`
  );
  await flush();
  assert.match(text('.cuota'), /Cuota: impresora\$67\.633/);
  assert.match(text('.cuota-text'), /Te pagaron \$20\.000 este mes\. Para la cuota te faltan \$47\.633\./);
  assert.equal(run('q(".cuota-bar i").style.width'), '30%');
  assert.ok(run('q(".cuota-bar").classList.contains("low")'));
  assert.match(text('.cuota'), /Cuenta solo lo que te han pagado/);
  // It survives a reload on this device and is separate per workspace.
  assert.equal(j('JSON.parse(localStorage.getItem("kultiapp_cuota:"+S.workspace.id)).amount'), 67633);
  const ws = run('S.workspace.id');
  run(`S.workspace.id='otro-taller';render()`);
  assert.match(text('.cuota'), /¿Tienes una cuota que pagar\?/);
  run(`S.workspace.id='${ws}'`);
  // Enough money: green, and the leftover is shown. A due date counts the days.
  run(
    `localStorage.setItem('kultiapp_cuota:'+S.workspace.id,JSON.stringify({name:'',amount:15000,due:addDays(localToday(),5)}));render()`
  );
  assert.match(text('.cuota-text'), /¡Ya te alcanza! Te pagaron \$20\.000 este mes: te sobran \$5\.000\./);
  assert.ok(run('q(".cuota-bar").classList.contains("ok")'));
  assert.match(text('.cuota'), /vence en 5 días/);
  // «Ya la pagué» opens a new expense already filled in.
  run(
    `window.exp=null;window.closeFn=null;showExpense=e=>{window.exp=e;return{addEventListener:(t,f)=>{window.closeFn=f}}};q('[data-cuota-paid]').click()`
  );
  assert.deepEqual(j('exp'), { amount: 15000, description: 'Cuota', category: 'otros' });
  // Closing without saving keeps the cuota; saving the expense clears it (no double counting).
  run(`closeFn()`);
  assert.ok(run('!!loadCuota()'));
  run(`S.expenses.push({id:'e9',spent_on:localToday(),category:'otros',amount:15000});closeFn()`);
  assert.ok(run('!loadCuota()'));
  assert.match(text('.cuota'), /¿Tienes una cuota que pagar\?/);
  run(
    `S.expenses.pop();localStorage.setItem('kultiapp_cuota:'+S.workspace.id,JSON.stringify({name:'',amount:15000,due:addDays(localToday(),5)}));render()`
  );
  // Overdue wording, removing the cuota, and viewers (they see it but cannot register a payment).
  run(
    `localStorage.setItem('kultiapp_cuota:'+S.workspace.id,JSON.stringify({name:'',amount:15000,due:addDays(localToday(),-2)}));render()`
  );
  assert.match(text('.cuota'), /venció hace 2 días/);
  run(`S.workspace.role='viewer';render()`);
  assert.ok(run('!q("[data-cuota-paid]")&&!!q("[data-cuota-edit]")'));
  run(`S.workspace.role='owner';render()`);
  run(`q('[data-cuota-edit]').click();q('#cuotaRemove').click()`);
  await flush();
  assert.match(text('.cuota'), /¿Tienes una cuota que pagar\?/);
  assert.equal(run('localStorage.getItem("kultiapp_cuota:"+S.workspace.id)'), null);
  // Nothing yet: a friendly sentence instead of zeros.
  run(`S.orders=[];S.payments=[];S.expenses=[];render()`);
  assert.match(text('.money-sentence'), /Todavía no hay ventas, pagos ni gastos este mes\./);
  dom.window.close();
  console.log(
    'PASS 5.5 Mi plata: vendí, me pagaron, me deben, gasté y me queda en palabras simples, por periodo; detalle plegado; cuota con avance, vencimiento, «ya la pagué», guardada por taller en el dispositivo.'
  );
}
test().catch(e => {
  console.error(e);
  process.exit(1);
});
