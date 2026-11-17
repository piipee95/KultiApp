'use strict';
// «Cobrar»: quién te debe, cuánto y desde cuándo, con un recordatorio listo para WhatsApp.
// Reutiliza receivables/orderBalance/orderMessage (10-payments.js) y showQuickPayment (16-money.js).
function cobrarRows() {
  const today = localToday();
  return receivables()
    .filter(o => o.status !== 'canceled' && o.kind !== 'stock')
    .map(o => {
      const b = orderBalance(o),
        since = String(o.created_at || '').slice(0, 10),
        days = since ? Math.max(0, daysBetween(since, today)) : 0;
      return { o, b, days, customer: customerFor(o.customer_id, o.customer_name) };
    })
    .sort((a, b) => b.days - a.days || b.b.due - a.b.due);
}
function cobrarAge(days) {
  return days === 0 ? 'hoy' : days === 1 ? 'hace 1 día' : 'hace ' + days + ' días';
}
function cobrarRow({ o, b, days, customer }) {
  const phone = customer?.phone || '',
    wa = waUrl(phone, orderMessage(o, 'reminder')),
    ratio = b.total > 0 ? Math.min(100, Math.round((b.paid / b.total) * 100)) : 0;
  return (
    '<article class="panel cobrar-row' +
    (days >= 30 ? ' old' : '') +
    '"><div class="cobrar-main"><div><b>' +
    esc(o.customer_name || 'Sin cliente') +
    '</b><span class="small muted">PED-' +
    o.order_no +
    ' · ' +
    esc(o.title) +
    ' · pedido ' +
    cobrarAge(days) +
    '</span></div><b class="cobrar-due">' +
    clp(b.due) +
    '</b></div><span class="level cobrar-bar ' +
    (b.paid > 0 ? 'ok' : 'low') +
    '"><i style="width:' +
    ratio +
    '%"></i></span><div class="cobrar-foot"><span class="small muted">Total ' +
    clp(b.total) +
    ' · pagado ' +
    clp(b.paid) +
    '</span><span class="cobrar-actions"><a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="' +
    esc(wa) +
    '">' +
    icon('message-circle') +
    (phone ? 'Recordar' : 'Recordar (sin número)') +
    '</a>' +
    (canEdit()
      ? '<button type="button" class="btn btn-primary btn-sm" data-cobrar-pay="' +
        o.id +
        '">' +
        icon('circle-check') +
        'Me pagaron</button>'
      : '') +
    '</span></div></article>'
  );
}
function cobrarView() {
  const rows = cobrarRows(),
    total = rows.reduce((s, r) => s + r.b.due, 0),
    oldest = rows[0];
  root.innerHTML =
    header('Cobrar') +
    '<main class="shell cobrar">' +
    (rows.length
      ? '<section class="panel money-left"><span>Te deben</span><b>' +
        clp(total) +
        '</b><small>' +
        rows.length +
        (rows.length === 1 ? ' pedido' : ' pedidos') +
        ' con saldo' +
        (oldest && oldest.days > 0 ? ' · el más antiguo es ' + cobrarAge(oldest.days) : '') +
        '</small></section>' +
        rows.map(cobrarRow).join('')
      : '<section class="panel empty-state"><b>Todo cobrado</b><span class="small muted">Nadie te debe nada ahora.</span></section>') +
    '</main>';
  common();
  bindCobrar();
}
function bindCobrar() {
  qa('[data-cobrar-pay]').forEach(b => (b.onclick = () => showQuickPayment(b.dataset.cobrarPay)));
}
