const assert = require('node:assert/strict');
const { boot } = require('./boot.cjs');
// 5.6: CSV downloads (ventas, pagos, gastos, lo que me deben) for Excel: «;», BOM, quotes escaped, only the chosen month.
async function test() {
  const dom = boot(),
    run = s => dom.window.run(s),
    j = s => JSON.parse(run('JSON.stringify(' + s + ')'));
  const today = run('localToday()'),
    ym = today.slice(0, 7),
    at = d => d + 'T15:00:00Z';
  run(`const base={kind:'customer',iva_enabled:false,iva_rate:.19,inventory_state:'none',estimated_cost:0,status:'delivered',quantity:1};
  S.customers=[{id:'c1',name:'Ana',phone:'912345678'}];
  S.orders=[{...base,id:'o1',order_no:1,title:'Cuadro "grande"; azul',customer_id:'c1',customer_name:'Ana',unit_price:20000,created_at:'${at(ym + '-02')}'},
   {...base,id:'o2',order_no:2,title:'Viejo',customer_name:'Beto',unit_price:9000,created_at:'2020-01-05T15:00:00Z'},
   {...base,id:'o3',order_no:3,title:'Lote',kind:'stock',unit_price:0,created_at:'${at(ym + '-02')}'}];
  S.payments=[{id:'a',order_id:'o1',amount:5000,method:'cash',paid_on:'${ym}-03',created_at:'${at(ym + '-03')}'}];
  S.expenses=[{id:'e1',spent_on:'${ym}-04',category:'otros',description:'Cuota',amount:7000},{id:'e2',spent_on:'2020-01-04',category:'otros',description:'Viejo',amount:1}];
  S.mode='reports';window.files=[];downloadBlob=(b,n)=>{window.files.push([n,b])}`);
  const y = run('new Date().getFullYear()'),
    m = run('new Date().getMonth()');
  assert.equal(run("csvCell('a\"b;c')"), '"a""b;c"');
  const sets = `csvSets(${y},${m})`;
  assert.deepEqual(j(`${sets}.ventas.rows()`), [
    ['Pedido', 'Fecha', 'Cliente', 'Detalle', 'Estado', 'Total', 'Pagado', 'Saldo'],
    ['PED-1', ym + '-02', 'Ana', 'Cuadro "grande"; azul', run('ORDER_STATUSES.delivered'), 20000, 5000, 15000]
  ]);
  assert.equal(j(`${sets}.cobros.rows()`).length, 2);
  assert.deepEqual(j(`${sets}.cobros.rows()[1]`).slice(0, 4), [ym + '-03', 'PED-1', 'Ana', 5000]);
  assert.deepEqual(j(`${sets}.gastos.rows()[1]`).slice(2), ['Cuota', 7000]);
  assert.equal(j(`${sets}.gastos.rows()`).length, 2);
  // What is owed ignores the month and includes the customer's phone; old order is included, stock lot is not.
  assert.deepEqual(
    j(`${sets}.deben.rows()`).map(r => r[0]),
    ['Pedido', 'PED-2', 'PED-1']
  );
  assert.equal(j(`${sets}.deben.rows()[2]`)[2], '912345678');
  // The dialog downloads a Excel-friendly file.
  run(`showCsvExport(${y},${m});q('[data-csv=ventas]').click()`);
  assert.match(run('files[0][0]'), /^KultiApp-ventas-\d{4}-\d{2}\.csv$/);
  const text = run(`csvText(${sets}.ventas.rows())`);
  assert.match(text, /^Pedido;Fecha;Cliente;Detalle;Estado;Total;Pagado;Saldo\r\nPED-1;/);
  run(`window.toasted=null;toast=m=>{window.toasted=m};S.expenses=[];q('[data-csv=gastos]').click()`);
  assert.match(run('toasted'), /No hay datos/);
  assert.equal(run('files.length'), 1);
  console.log(
    'PASS 5.6 CSV: ventas, pagos, gastos y lo que me deben, solo del mes elegido, con comillas y BOM para Excel.'
  );
}
test().catch(e => {
  console.error(e);
  process.exit(1);
});
