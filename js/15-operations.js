'use strict';
// Centro de operaciones (Inicio): ventas, cobros, costos y utilidad por periodo con su variación, gráfico,
// estado de pedidos, productos más vendidos y actividad reciente. Todo sale de los pedidos, pagos y
// cotizaciones cargados; nada se simula.
const OPS_PERIODS = [
  ['today', 'Hoy'],
  ['week', 'Semana'],
  ['month', 'Mes'],
  ['year', 'Año'],
  ['custom', 'Rango']
];
const OPS_KEY = 'kultiapp_ops_period';
const OPS_RANGE_KEY = 'kultiapp_ops_range';
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
// Local calendar day (YYYY-MM-DD) of a timestamp or a date-only value.
const dayOf = iso =>
  !iso ? '' : String(iso).length === 10 ? String(iso) : new Date(iso).toLocaleDateString('sv-SE');
function opsPeriod() {
  if (!S.opsPeriod) {
    try {
      const saved = localStorage.getItem(OPS_KEY);
      S.opsPeriod = OPS_PERIODS.some(p => p[0] === saved) ? saved : 'month';
    } catch {
      S.opsPeriod = 'month';
    }
  }
  return S.opsPeriod;
}
function opsCustom() {
  if (!S.opsRange) {
    const today = localToday();
    S.opsRange = { from: today.slice(0, 8) + '01', to: today };
    try {
      const saved = JSON.parse(localStorage.getItem(OPS_RANGE_KEY));
      if (/^\d{4}-\d{2}-\d{2}$/.test(saved?.from) && /^\d{4}-\d{2}-\d{2}$/.test(saved?.to))
        S.opsRange = saved;
    } catch {}
  }
  return S.opsRange;
}
function saveOps(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
// The calendar period plus the previous one over the same elapsed span, so a half-finished month is
// compared with the same days of the last one.
function opsRange(kind = opsPeriod()) {
  const today = localToday(),
    t = new Date(today + 'T12:00'),
    y = t.getFullYear(),
    m = t.getMonth(),
    ymd = d => d.toLocaleDateString('sv-SE');
  let from, to, prevFrom, prevEnd, label, prevLabel;
  if (kind === 'today') {
    from = to = today;
    prevFrom = prevEnd = addDays(today, -1);
    label = 'Hoy';
    prevLabel = 'ayer';
  } else if (kind === 'week') {
    from = addDays(today, -((t.getDay() + 6) % 7));
    to = addDays(from, 6);
    prevFrom = addDays(from, -7);
    prevEnd = addDays(prevFrom, 6);
    label = 'Esta semana';
    prevLabel = 'la semana pasada';
  } else if (kind === 'year') {
    from = y + '-01-01';
    to = y + '-12-31';
    prevFrom = y - 1 + '-01-01';
    prevEnd = y - 1 + '-12-31';
    label = String(y);
    prevLabel = String(y - 1);
  } else if (kind === 'custom') {
    ({ from, to } = opsCustom());
    prevEnd = addDays(from, -1);
    prevFrom = addDays(from, -(daysBetween(from, to) + 1));
    label = shortDate(from) + ' – ' + shortDate(to);
    prevLabel = 'el periodo anterior';
  } else {
    from = ymd(new Date(y, m, 1));
    to = ymd(new Date(y, m + 1, 0));
    prevFrom = ymd(new Date(y, m - 1, 1));
    prevEnd = ymd(new Date(y, m, 0));
    label = MONTHS[m].charAt(0).toUpperCase() + MONTHS[m].slice(1);
    prevLabel = MONTHS[(m + 11) % 12];
  }
  const elapsed =
      kind === 'custom' ? daysBetween(from, to) : Math.max(0, daysBetween(from, today < to ? today : to)),
    prevTo = addDays(prevFrom, elapsed) < prevEnd ? addDays(prevFrom, elapsed) : prevEnd;
  return { kind, from, to, prevFrom, prevTo, label, prevLabel };
}
// Orders and payments older than the startup window are only there if Reportes fetched them.
function opsCovers(day) {
  const loaded = S.older?.from || S.historyFrom;
  return !loaded || day >= loaded.slice(0, 10);
}
// Sales: customer orders created in the range, VAT included. Cobros: payments received. Cost: the real
// cost where the order has one, the estimate otherwise. Margin is over net sales; markup is over cost.
function opsTotals(from, to) {
  const within = iso => {
      const d = dayOf(iso);
      return !!d && d >= from && d <= to;
    },
    all = reportRows('orders'),
    sold = all.filter(o => o.kind !== 'stock' && o.status !== 'canceled' && within(o.created_at)),
    made = all.filter(o => o.kind === 'stock' && o.status !== 'canceled' && within(o.created_at)),
    pays = reportRows('payments').filter(p => within(p.paid_on));
  let sales = 0,
    net = 0,
    cost = 0,
    profit = 0,
    profitReal = 0,
    real = 0;
  for (const o of sold) {
    const t = orderNumbers(o),
      p = t.actualProfit ?? t.estimatedProfit;
    sales += t.sales;
    net += t.net;
    cost += t.actualCost ?? n(o.estimated_cost);
    profit += p;
    if (t.actualCost != null) {
      real++;
      profitReal += p;
    }
  }
  return {
    orders: sold,
    count: sold.length,
    sales,
    net,
    cost,
    profit,
    profitReal,
    profitEstimated: profit - profitReal,
    realCount: real,
    estimatedCount: sold.length - real,
    margin: net > 0 ? profit / net : null,
    markup: cost > 0 ? profit / cost : null,
    collected: pays.reduce((s, p) => s + n(p.amount), 0),
    payCount: pays.length,
    madeUnits: made.reduce((s, o) => s + n(o.quantity), 0),
    madeCost: made.reduce((s, o) => s + n(o.estimated_cost), 0)
  };
}
function opsDelta(cur, prev, range, inverse = false) {
  if (!opsCovers(range.prevFrom)) return '<span class="muted">Sin datos de ' + range.prevLabel + '</span>';
  if (!(prev > 0)) return '<span class="muted">Sin base de comparación</span>';
  const d = (cur - prev) / prev,
    good = inverse ? d <= 0 : d >= 0;
  return (
    '<span class="' +
    (good ? 'up' : 'down') +
    '">' +
    icon(d >= 0 ? 'trending-up' : 'trending-down') +
    Math.abs(Math.round(d * 100)) +
    '% vs ' +
    range.prevLabel +
    '</span>'
  );
}
const opsMoney = v =>
  '<span class="full">' + clp(v) + '</span><span class="short">' + clpShort(v) + '</span>';
function opsKpi(label, ic, value, foot, go) {
  return (
    '<button type="button" class="kpi ops-kpi" data-ops-go="' +
    go +
    '"><div class="kpi-h"><span>' +
    label +
    '</span>' +
    icon(ic) +
    '</div><div class="kpi-v num">' +
    value +
    '</div><div class="kpi-f">' +
    foot +
    '</div></button>'
  );
}
// Daily columns up to 31 days, monthly beyond that. «Hoy» shows the last seven days for context.
function opsBuckets(range) {
  const from = range.kind === 'today' ? addDays(range.to, -6) : range.from,
    to = range.to,
    out = [];
  if (daysBetween(from, to) <= 31) {
    const total = daysBetween(from, to) + 1;
    for (let i = 0; i < total; i++) {
      const d = addDays(from, i),
        dt = new Date(d + 'T12:00'),
        label =
          total <= 7
            ? dt.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '') + ' ' + dt.getDate()
            : i % 5 === 0 || i === total - 1
              ? String(dt.getDate())
              : '';
      out.push({ from: d, to: d, label, full: shortDate(d) });
    }
    return out;
  }
  const [fy, fm] = from.split('-').map(Number),
    [ty, tm] = to.split('-').map(Number),
    several = fy !== ty;
  for (let y = fy, m = fm - 1; y < ty || (y === ty && m <= tm - 1); m++) {
    if (m > 11) {
      m = 0;
      y++;
    }
    const first = new Date(y, m, 1).toLocaleDateString('sv-SE'),
      last = new Date(y, m + 1, 0).toLocaleDateString('sv-SE'),
      name = MONTHS[m].slice(0, 3);
    out.push({
      from: first,
      to: last,
      label: several ? name + ' ' + String(y).slice(2) : name,
      full: MONTHS[m] + ' ' + y
    });
  }
  return out.slice(-36);
}
function opsSeries(range) {
  const orders = reportRows('orders').filter(o => o.kind !== 'stock' && o.status !== 'canceled'),
    pays = reportRows('payments');
  return opsBuckets(range).map(b => {
    const inB = iso => {
      const d = dayOf(iso);
      return d >= b.from && d <= b.to;
    };
    return {
      ...b,
      sales: orders.filter(o => inB(o.created_at)).reduce((s, o) => s + orderNumbers(o).sales, 0),
      cash: pays.filter(p => inB(p.paid_on)).reduce((s, p) => s + n(p.amount), 0)
    };
  });
}
// An empty day draws no bar at all, so a quiet month does not look like a dotted line.
const opsBar = (v, max) => (v > 0 ? 'height:' + Math.round((v / max) * 100) + '%' : 'height:0;min-height:0');
// clpShort with the sign in front: -$374, not $-374.
const opsSigned = v => (v < 0 ? '-' + clpShort(-v) : clpShort(v));
function opsChartPanel(range) {
  const series = opsSeries(range),
    max = Math.max(1, ...series.map(s => Math.max(s.sales, s.cash))),
    empty = !series.some(s => s.sales || s.cash),
    shown = range.kind === 'today' ? 'Últimos 7 días' : range.label;
  return (
    '<section class="panel ops-chart-panel"><div class="panel-h"><h2>Ventas y cobros</h2><span class="legend"><i class="l-sales"></i>Ventas <i class="l-cash"></i>Cobros</span></div>' +
    (empty
      ? '<div class="panel-empty">' +
        icon('chart-column') +
        '<b>Sin ventas ni cobros</b><span>' +
        esc(shown) +
        ': aún no hay movimientos en este periodo.</span></div>'
      : '<div class="ops-chart" role="img" aria-label="Ventas y cobros de ' +
        esc(shown) +
        '" style="grid-template-columns:repeat(' +
        series.length +
        ',minmax(0,1fr))">' +
        series
          .map(
            s =>
              '<div class="ops-col" title="' +
              esc(s.full + ': ventas ' + clp(s.sales) + ' · cobros ' + clp(s.cash)) +
              '"><div class="ops-pair"><i class="b-sales" style="' +
              opsBar(s.sales, max) +
              '"></i><i class="b-cash" style="' +
              opsBar(s.cash, max) +
              '"></i></div><span>' +
              esc(s.label) +
              '</span></div>'
          )
          .join('') +
        '</div>') +
    '</section>'
  );
}
function opsStatusPanel() {
  const open = S.orders.filter(orderIsOpen),
    count = f => open.filter(f).length,
    today = localToday(),
    tiles = [
      ['pending', 'Pendientes', count(o => o.status === 'pending'), 'c-pend'],
      ['printing', 'En fabricación', count(o => ['printing', 'assembly'].includes(o.status)), 'c-print'],
      ['ready', 'Listos para entregar', count(o => o.status === 'ready' && o.kind !== 'stock'), 'c-ready'],
      ['shipped', 'Enviados', count(o => o.status === 'shipped'), 'c-ship'],
      ['late', 'Atrasados', count(orderIsLate), 'c-late']
    ],
    stock = count(o => o.kind === 'stock'),
    dueToday = count(o => o.due_date === today && o.status !== 'shipped');
  return (
    '<section class="panel ops-status"><div class="panel-h"><h2>Pedidos y fabricación</h2><button type="button" class="link-btn" data-ops-go="production">Ver pedidos</button></div><div class="ops-tiles">' +
    tiles
      .map(
        ([key, label, total, tone]) =>
          '<button type="button" class="ops-tile ' +
          tone +
          (total ? '' : ' zero') +
          '" data-ops-go="production:' +
          key +
          '"><b class="num">' +
          total +
          '</b><span>' +
          label +
          '</span></button>'
      )
      .join('') +
    '</div><p class="small muted ops-foot">' +
    (stock
      ? stock + (stock === 1 ? ' fabricación para stock en curso' : ' fabricaciones para stock en curso')
      : 'Sin fabricación para stock en curso') +
    (dueToday ? ' · ' + dueToday + (dueToday === 1 ? ' entrega hoy' : ' entregas hoy') : '') +
    '</p></section>'
  );
}
function opsTopPanel(totals, range) {
  const byProduct = new Map();
  for (const o of totals.orders) {
    const key = o.product_id || 'title:' + o.title,
      p = byProduct.get(key) || { name: o.title, units: 0, sales: 0 };
    p.units += n(o.quantity);
    p.sales += orderNumbers(o).sales;
    byProduct.set(key, p);
  }
  const top = [...byProduct.values()].sort((a, b) => b.sales - a.sales).slice(0, 5),
    max = Math.max(1, ...top.map(p => p.sales));
  return (
    '<section class="panel ops-top"><div class="panel-h"><h2>Más vendidos</h2><button type="button" class="link-btn" data-ops-go="reports">Reportes</button></div>' +
    (top.length
      ? top
          .map(
            p =>
              '<div class="ops-top-row"><span class="ops-top-main"><b>' +
              esc(p.name) +
              '</b><span class="small muted">' +
              p.units +
              (p.units === 1 ? ' unidad' : ' unidades') +
              '</span></span><b class="num">' +
              clp(p.sales) +
              '</b><span class="bar"><b style="width:' +
              Math.max(4, Math.round((p.sales / max) * 100)) +
              '%"></b></span></div>'
          )
          .join('')
      : '<div class="panel-empty">' +
        icon('package') +
        '<b>Sin ventas</b><span>' +
        esc(range.label) +
        ': todavía no hay pedidos de clientes.</span></div>') +
    '</section>'
  );
}
function opsAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 6e4) return 'ahora';
  if (ms < 36e5) return 'hace ' + Math.round(ms / 6e4) + ' min';
  if (ms < 864e5) return 'hace ' + Math.round(ms / 36e5) + ' h';
  if (ms < 2 * 864e5) return 'ayer';
  return shortDate(dayOf(iso));
}
// Latest movements across orders, payments and quotes.
function opsActivity() {
  const events = [];
  for (const o of S.orders || []) {
    const changed = o.updated_at && new Date(o.updated_at) - new Date(o.created_at) > 6e4,
      ref = 'PED-' + o.order_no + ' · ' + o.title;
    events.push({
      at: changed ? o.updated_at : o.created_at,
      icon: changed ? 'clipboard-check' : 'clipboard-list',
      text: ref,
      sub: changed
        ? (ORDER_STATUSES[o.status] || o.status) + (o.kind === 'stock' ? ' · fabricación' : '')
        : 'Pedido creado',
      order: o.id
    });
  }
  for (const p of S.payments || []) {
    const o = (S.orders || []).find(x => x.id === p.order_id);
    events.push({
      at: p.created_at || p.paid_on,
      icon: 'wallet',
      text: 'Pago de ' + clp(p.amount),
      sub: o ? 'PED-' + o.order_no + ' · ' + o.title : 'Pedido',
      order: o?.id
    });
  }
  for (const qt of S.quotes || [])
    events.push({
      at: qt.updated_at || qt.created_at,
      icon: 'file-text',
      text: 'Cotización ' + quoteFolioNo(qt.quote_no),
      sub: qt.title + (qt.client_name ? ' · ' + qt.client_name : ''),
      quote: qt.id
    });
  return events
    .filter(e => e.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8);
}
function opsActivityPanel() {
  const list = opsActivity();
  return (
    '<section class="panel ops-activity"><div class="panel-h"><h2>Actividad reciente</h2></div>' +
    (list.length
      ? list
          .map(
            e =>
              '<button type="button" class="list-row ops-event"' +
              (e.order ? ' data-ops-order="' + e.order + '"' : '') +
              (e.quote ? ' data-ops-quote="' + e.quote + '"' : '') +
              '><span class="rem-ic">' +
              icon(e.icon) +
              '</span><span class="lr-main"><b>' +
              esc(e.text) +
              '</b><span>' +
              esc(e.sub) +
              '</span></span><span class="small muted">' +
              opsAgo(e.at) +
              '</span></button>'
          )
          .join('')
      : '<div class="panel-empty">' +
        icon('history') +
        '<b>Sin actividad</b><span>Los pedidos, pagos y cotizaciones aparecerán aquí.</span></div>') +
    '</section>'
  );
}
// Period selector (today, week, month, year, custom range), shared by «Mi plata» and the detail below it.
function opsPeriodBar(range = opsRange()) {
  const custom = range.kind === 'custom';
  return (
    '<section class="ops-bar"><div class="pills ops-pills" role="group" aria-label="Periodo">' +
    OPS_PERIODS.map(
      ([key, text]) =>
        '<button type="button" class="pill' +
        (key === range.kind ? ' on' : '') +
        '" data-ops-period="' +
        key +
        '" aria-pressed="' +
        (key === range.kind) +
        '">' +
        text +
        '</button>'
    ).join('') +
    '</div>' +
    (custom
      ? '<div class="ops-range">' +
        fieldHtml('Desde', 'opsFrom', range.from, 'date', 'max="' + range.to + '"') +
        fieldHtml('Hasta', 'opsTo', range.to, 'date', 'min="' + range.from + '"') +
        '</div>'
      : '<span class="small muted ops-label">' + esc(range.label) + '</span>') +
    '</section>'
  );
}
function operationsView(opts = {}) {
  const range = opsRange(),
    cur = opsTotals(range.from, range.to),
    prev = opsTotals(range.prevFrom, range.prevTo),
    label =
      cur.estimatedCount === 0 && cur.count
        ? 'Ganancia real'
        : cur.realCount === 0
          ? 'Ganancia estimada'
          : 'Ganancia (real + estimada)',
    plural = (k, one, many) => k + (k === 1 ? one : many);
  return (
    (opts.bar === false ? '' : opsPeriodBar(range)) +
    (opsCovers(range.from)
      ? ''
      : '<p class="small warn ops-note">' +
        icon('info') +
        'Parte de este rango es anterior a los datos cargados (12 meses). Abre Reportes para traer meses anteriores.</p>') +
    '<div class="ops-kpis">' +
    opsKpi(
      'Ventas',
      'wallet',
      opsMoney(cur.sales),
      '<span class="muted">' +
        plural(cur.count, ' pedido', ' pedidos') +
        '</span>' +
        opsDelta(cur.sales, prev.sales, range),
      'reports'
    ) +
    opsKpi(
      'Cobros',
      'circle-check',
      opsMoney(cur.collected),
      '<span class="muted">' +
        plural(cur.payCount, ' pago', ' pagos') +
        '</span>' +
        opsDelta(cur.collected, prev.collected, range),
      'reports'
    ) +
    opsKpi(
      'Costo de fabricación',
      'layers',
      opsMoney(cur.cost),
      '<span class="muted">' +
        cur.realCount +
        ' real · ' +
        cur.estimatedCount +
        ' estimado</span>' +
        opsDelta(cur.cost, prev.cost, range, true),
      'reports'
    ) +
    opsKpi(
      label,
      'trending-up',
      '<span class="' + (cur.profit < 0 ? 'down' : '') + '">' + opsMoney(cur.profit) + '</span>',
      '<span class="muted">' +
        (cur.margin == null
          ? 'Sin ventas'
          : pct(cur.margin) +
            ' de ganancia' +
            (cur.markup == null ? '' : ' · ' + pct(cur.markup) + ' sobre el costo')) +
        '</span>' +
        (cur.realCount && cur.estimatedCount
          ? '<span class="muted">Real ' +
            opsSigned(cur.profitReal) +
            ' · estimada ' +
            opsSigned(cur.profitEstimated) +
            '</span>'
          : '') +
        opsDelta(cur.profit, prev.profit, range),
      'finance'
    ) +
    '</div><details class="ops-help"><summary>' +
    icon('info') +
    '¿Cómo se calcula?</summary><p class="small muted"><b>Ventas</b>: pedidos de clientes creados en el periodo, con IVA. <b>Cobros</b>: pagos recibidos en el periodo, sean de pedidos de este u otros periodos. <b>Costo</b>: el real del pedido si ya lo registraste y, si no, el estimado. <b>Ganancia</b>: lo que queda de la venta sin IVA después de pagar el costo. <b>% de ganancia</b>: cuánto de cada $100 de venta (sin IVA) es ganancia; <b>sobre el costo</b>: cuánto ganas por cada $100 que te costó fabricar. Las cancelaciones y la fabricación para stock no cuentan como venta' +
    (cur.madeUnits
      ? ' (en el periodo se fabricaron ' + cur.madeUnits + ' un. para stock por ' + clp(cur.madeCost) + ')'
      : '') +
    '.</p></details><div class="ops-grid">' +
    opsChartPanel(range) +
    opsStatusPanel() +
    '</div><div class="ops-grid ops-grid-even">' +
    opsTopPanel(cur, range) +
    opsActivityPanel() +
    '</div>'
  );
}
function bindOperations() {
  qa('[data-ops-period]').forEach(
    b =>
      (b.onclick = () => {
        S.opsPeriod = b.dataset.opsPeriod;
        saveOps(OPS_KEY, S.opsPeriod);
        render();
      })
  );
  const pickRange = () => {
    const from = q('#opsFrom')?.value,
      to = q('#opsTo')?.value;
    if (!from || !to) return;
    S.opsRange = from <= to ? { from, to } : { from: to, to: from };
    saveOps(OPS_RANGE_KEY, JSON.stringify(S.opsRange));
    render();
  };
  q('#opsFrom')?.addEventListener('change', pickRange);
  q('#opsTo')?.addEventListener('change', pickRange);
  qa('[data-ops-go]').forEach(
    b =>
      (b.onclick = () => {
        const [mode, filter] = b.dataset.opsGo.split(':');
        if (filter) S.orderFilter = filter;
        goMode(mode);
      })
  );
  qa('[data-ops-order]').forEach(
    b => (b.onclick = () => showOrder(S.orders.find(o => o.id === b.dataset.opsOrder)))
  );
  qa('[data-ops-quote]').forEach(
    b => (b.onclick = () => showSavedQuote(S.quotes.find(x => x.id === b.dataset.opsQuote)))
  );
}
