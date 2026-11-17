const assert = require('node:assert/strict');
const { boot } = require('./boot.cjs');
const flush = async (k = 4) => {
  for (let i = 0; i < k; i++) await new Promise(r => setTimeout(r, 0));
};
// 5.6: «Cobrar» lists who owes what, oldest first, with a ready WhatsApp reminder and a quick «Me pagaron».
async function test() {
  const dom = boot(),
    run = s => dom.window.run(s),
    j = s => JSON.parse(run('JSON.stringify(' + s + ')'));
  const today = run('localToday()'),
    old = run(`addDays('${today}',-45)`),
    at = d => d + 'T15:00:00Z';
  run(`const base={kind:'customer',iva_enabled:false,iva_rate:.19,inventory_state:'none',estimated_cost:0,status:'delivered',quantity:1};
  S.customers=[{id:'c1',name:'Ana',phone:'912345678'},{id:'c2',name:'Beto'}];
  S.orders=[{...base,id:'o1',order_no:1,title:'Cuadro',customer_id:'c1',customer_name:'Ana',unit_price:20000,created_at:'${at(today)}'},
   {...base,id:'o2',order_no:2,title:'Llavero',customer_id:'c2',customer_name:'Beto',unit_price:10000,created_at:'${at(old)}'},
   {...base,id:'o3',order_no:3,title:'Pagado',customer_id:'c1',customer_name:'Ana',unit_price:5000,created_at:'${at(today)}'},
   {...base,id:'o4',order_no:4,title:'Lote',kind:'stock',unit_price:0,created_at:'${at(today)}'},
   {...base,id:'o5',order_no:5,title:'Cancelado',status:'canceled',unit_price:9000,created_at:'${at(today)}'}];
  S.payments=[{id:'a',order_id:'o1',amount:5000,paid_on:'${today}',created_at:'${at(today)}'},{id:'b',order_id:'o3',amount:5000,paid_on:'${today}',created_at:'${at(today)}'}];
  S.expenses=[];S.quotes=[];S.resources=[];S.products=[];S.mode='cobrar';render()`);
  const text = s => run(`q('${s}').textContent`);
  assert.match(text('.money-left'), /Te deben\$25\.000.*2 pedidos con saldo.*hace 45 días/);
  // Oldest first; stock fabrication, canceled and paid orders never appear.
  const rows = j(`qa('.cobrar-row').map(r=>r.querySelector('b').textContent)`);
  assert.deepEqual(rows, ['Beto', 'Ana']);
  assert.ok(run(`qa('.cobrar-row')[0].classList.contains('old')`));
  assert.match(text('.cobrar-row:nth-of-type(2)'), /PED-1.*Cuadro.*\$15\.000.*pagado \$5\.000/);
  // The reminder opens WhatsApp with the customer's number and the saldo message.
  const href = run(`qa('.cobrar-row')[1].querySelector('a').href`);
  assert.match(href, /^https:\/\/wa\.me\/56912345678\?text=/);
  assert.match(decodeURIComponent(href), /saldo de tu pedido PED-1 \(Cuadro\): \$15\.000/);
  assert.match(text('.cobrar-row a'), /Recordar \(sin número\)/); // Beto has no phone
  // «Me pagaron» opens the payment form with that order and its saldo.
  run(`window.paid=null;addPayment=async(...a)=>{window.paid=a};qa('[data-cobrar-pay]')[1].click()`);
  assert.equal(run('q("#qpOrder").value'), 'o1');
  assert.equal(run('q("#qpAmount").value'), '15000');
  run(`q('#quickPayForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
  await flush();
  assert.equal(run('paid[0].id'), 'o1');
  assert.equal(run('paid[1]'), 15000);
  // The sidebar shows the number of people who owe, and viewers cannot register payments.
  assert.equal(run('navCount("cobrar")'), 2);
  run(`S.workspace.role='viewer';render()`);
  assert.ok(run('!q("[data-cobrar-pay]")'));
  // Nobody owes anything.
  run(
    `S.workspace.role='owner';S.payments.push({id:'c',order_id:'o1',amount:15000,paid_on:'${today}',created_at:'${at(today)}'},{id:'d',order_id:'o2',amount:10000,paid_on:'${today}',created_at:'${at(today)}'});render()`
  );
  assert.match(text('.empty-state'), /Todo cobrado/);
  console.log(
    'PASS 5.6 Cobrar: deudores del más antiguo al más nuevo, recordatorio por WhatsApp y Me pagaron.'
  );
}
test().catch(e => {
  console.error(e);
  process.exit(1);
});
