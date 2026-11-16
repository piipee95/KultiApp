'use strict';
// «Mi plata» (Inicio): lo vendido, lo cobrado, lo que te deben y lo gastado en palabras simples, y el avance de
// una cuota por pagar. Reutiliza opsRange/opsTotals (15-operations.js), receivables y los gastos ya cargados.
const cuotaKey = () => 'kultiapp_cuota:' + (S.workspace?.id || '');
// The cuota is a personal reminder kept on this device (no database change needed).
function loadCuota() {
  try {
    const c = JSON.parse(localStorage.getItem(cuotaKey()));
    return c && n(c.amount) > 0
      ? { name: String(c.name || ''), amount: n(c.amount), due: c.due || '' }
      : null;
  } catch {
    return null;
  }
}
function saveCuota(c) {
  try {
    if (c) localStorage.setItem(cuotaKey(), JSON.stringify(c));
    else localStorage.removeItem(cuotaKey());
  } catch {}
}
const moneyPeriodWord = range =>
  ({ today: 'hoy', week: 'esta semana', month: 'este mes', year: 'este año' })[range.kind] ||
  'en el periodo elegido';
// Money spent (expenses noted in the app) inside the range.
function moneySpent(from, to) {
  return (S.expenses || [])
    .filter(e => e.spent_on >= from && e.spent_on <= to)
    .reduce((s, e) => s + n(e.amount), 0);
}
function cuotaCard(collected, range) {
  const c = loadCuota();
  if (!c)
    return (
      '<section class="panel cuota empty"><div><b>¿Tienes una cuota que pagar?</b><span class="small muted">Anótala y te digo cuánto te falta con lo que te han pagado.</span></div><button type="button" class="btn btn-secondary btn-sm" data-cuota-edit>' +
      icon('plus') +
      'Anotar mi cuota</button></section>'
    );
  const missing = Math.max(0, c.amount - collected),
    enough = collected >= c.amount,
    left = c.due ? daysBetween(localToday(), c.due) : null,
    when =
      left == null
        ? ''
        : left < 0
          ? ' · venció hace ' + -left + (left === -1 ? ' día' : ' días')
          : left === 0
            ? ' · vence hoy'
            : ' · vence en ' + left + (left === 1 ? ' día' : ' días');
  return (
    '<section class="panel cuota"><div class="cuota-head"><div><b>Cuota' +
    (c.name ? ': ' + esc(c.name) : '') +
    '</b><span class="small muted">' +
    clp(c.amount) +
    (c.due ? ' · ' + shortDate(c.due) : '') +
    esc(when) +
    '</span></div><span class="cuota-actions">' +
    (canEdit()
      ? '<button type="button" class="btn btn-secondary btn-sm" data-cuota-paid>' +
        icon('circle-check') +
        'Ya la pagué</button>'
      : '') +
    '<button type="button" class="btn btn-ghost btn-sm" data-cuota-edit>Editar</button></span></div>' +
    '<span class="level cuota-bar ' +
    (enough ? 'ok' : 'low') +
    '"><i style="width:' +
    Math.min(100, Math.round((collected / c.amount) * 100)) +
    '%"></i></span><p class="cuota-text">' +
    (enough
      ? '<b>¡Ya te alcanza!</b> Te pagaron ' +
        clp(collected) +
        ' ' +
        moneyPeriodWord(range) +
        ': te sobran ' +
        clp(collected - c.amount) +
        '.'
      : 'Te pagaron <b>' +
        clp(collected) +
        '</b> ' +
        moneyPeriodWord(range) +
        '. Para la cuota te faltan <b>' +
        clp(missing) +
        '</b>.') +
    '</p><p class="small muted">Cuenta solo lo que te han pagado; no descuenta otros gastos. Se guarda en este dispositivo.</p></section>'
  );
}
function moneyView() {
  const range = opsRange(),
    cur = opsTotals(range.from, range.to),
    owed = receivables().reduce((s, o) => s + orderBalance(o).due, 0),
    owedCount = receivables().length,
    spent = moneySpent(range.from, range.to),
    left = cur.collected - spent,
    word = moneyPeriodWord(range),
    tile = (label, value, foot, go, tone = '') =>
      '<button type="button" class="money-tile' +
      tone +
      '" data-ops-go="' +
      go +
      '"><span>' +
      label +
      '</span><b class="num">' +
      value +
      '</b><small>' +
      foot +
      '</small></button>';
  return (
    '<section class="money"><div class="money-top"><h2>Mi plata</h2>' +
    opsPeriodBar(range) +
    '</div><p class="money-sentence">' +
    (cur.count || cur.collected || spent
      ? 'Vendiste <b>' +
        clp(cur.sales) +
        '</b> y te pagaron <b>' +
        clp(cur.collected) +
        '</b> ' +
        word +
        '. ' +
        (owed > 0 ? 'Te deben <b>' + clp(owed) + '</b>. ' : 'No te deben nada. ') +
        (spent ? 'Gastaste <b>' + clp(spent) + '</b>.' : '')
      : 'Todavía no hay ventas, pagos ni gastos ' + word + '.') +
    '</p><div class="money-tiles">' +
    tile('Vendí', clp(cur.sales), cur.count + (cur.count === 1 ? ' pedido' : ' pedidos'), 'reports') +
    tile(
      'Me pagaron',
      clp(cur.collected),
      cur.payCount + (cur.payCount === 1 ? ' pago' : ' pagos'),
      'reports',
      ' good'
    ) +
    tile(
      'Me deben',
      clp(owed),
      owedCount ? owedCount + (owedCount === 1 ? ' pedido con saldo' : ' pedidos con saldo') : 'Todo cobrado',
      'production:unpaid',
      owed > 0 ? ' warn' : ''
    ) +
    tile('Gasté', clp(spent), 'gastos anotados en Finanzas', 'finance') +
    '</div><div class="money-left' +
    (left < 0 ? ' neg' : '') +
    '"><span>Me queda <small>(lo que me pagaron menos lo que gasté)</small></span><b class="num">' +
    (left < 0 ? '-' : '') +
    clp(Math.abs(left)) +
    '</b></div></section>' +
    cuotaCard(cur.collected, range)
  );
}
function showCuota() {
  const c = loadCuota() || { name: '', amount: '', due: '' },
    dialog = showDialog(
      'cuotaDialog',
      '<div class="section-title"><h2>Mi cuota</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><form id="cuotaForm" class="grid">' +
        fieldHtml('¿Qué cuota es?', 'cuName', c.name, 'text', 'maxlength="60" placeholder="Ej.: impresora"') +
        '<div class="grid grid-2">' +
        fieldHtml(
          'Monto de la cuota (CLP)',
          'cuAmount',
          c.amount,
          'number',
          'min="1" step="1" required inputmode="numeric"'
        ) +
        fieldHtml('Vence (opcional)', 'cuDue', c.due, 'date') +
        '</div><p class="small muted">Se guarda solo en este dispositivo. Te muestra cuánto te falta con lo que te han pagado.</p><div class="dialog-actions">' +
        (loadCuota() ? '<button type="button" class="btn btn-ghost" id="cuotaRemove">Quitar</button>' : '') +
        '<button class="btn btn-primary" type="submit">Guardar</button></div></form>'
    );
  q('#cuotaForm').onsubmit = e => {
    e.preventDefault();
    const amount = Math.round(n(q('#cuAmount').value));
    if (amount < 1) return;
    saveCuota({ name: q('#cuName').value.trim(), amount, due: q('#cuDue').value });
    dialog.close();
    render();
  };
  q('#cuotaRemove')?.addEventListener('click', () => {
    saveCuota(null);
    dialog.close();
    render();
  });
}
function bindMoney() {
  qa('[data-cuota-edit]').forEach(b => (b.onclick = showCuota));
  qa('[data-cuota-paid]').forEach(
    b =>
      (b.onclick = () => {
        const c = loadCuota(),
          before = (S.expenses || []).length;
        if (!c) return;
        // Once the payment is saved as an expense the cuota is done: it is cleared so it is not counted twice.
        showExpense({
          amount: c.amount,
          description: 'Cuota' + (c.name ? ' ' + c.name : ''),
          category: 'otros'
        })?.addEventListener('close', () => {
          if ((S.expenses || []).length <= before) return;
          saveCuota(null);
          toast('Cuota registrada como pagada.');
          if (S.mode === 'home') render();
        });
      })
  );
  const more = q('.home-more');
  if (more) more.ontoggle = () => (S.homeMoreOpen = more.open);
}
