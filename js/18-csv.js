'use strict';
// Descargas en CSV (se abren en Excel o Google Sheets): ventas, cobros, gastos y lo que te deben.
// Usa «;» como separador y BOM UTF-8, que es lo que Excel en español espera.
const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvText = rows => rows.map(r => r.map(csvCell).join(';')).join('\r\n');
const csvBlob = rows => new Blob(['﻿' + csvText(rows)], { type: 'text/csv;charset=utf-8' });
const monthRange = (y, m) => [
  y + '-' + String(m + 1).padStart(2, '0') + '-01',
  y + '-' + String(m + 1).padStart(2, '0') + '-' + String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')
];
const orderLabel = o => 'PED-' + o.order_no;
function csvSets(y, m) {
  const [from, to] = monthRange(y, m),
    inMonth = d => String(d || '').slice(0, 10) >= from && String(d || '').slice(0, 10) <= to,
    orderById = id => (S.orders || []).find(o => o.id === id);
  return {
    ventas: {
      label: 'Ventas del mes',
      note: 'Pedidos de clientes creados en el mes, con lo pagado y el saldo.',
      rows: () => [
        ['Pedido', 'Fecha', 'Cliente', 'Detalle', 'Estado', 'Total', 'Pagado', 'Saldo'],
        ...(S.orders || [])
          .filter(o => o.kind !== 'stock' && o.status !== 'canceled' && inMonth(o.created_at))
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .map(o => {
            const b = orderBalance(o);
            return [
              orderLabel(o),
              String(o.created_at).slice(0, 10),
              o.customer_name || '',
              o.title,
              ORDER_STATUSES[o.status] || o.status,
              b.total,
              b.paid,
              b.due
            ];
          })
      ]
    },
    cobros: {
      label: 'Pagos recibidos del mes',
      note: 'Cada pago que te hicieron en el mes y de qué pedido.',
      rows: () => [
        ['Fecha', 'Pedido', 'Cliente', 'Monto', 'Medio', 'Lo recibió'],
        ...(S.payments || [])
          .filter(p => inMonth(p.paid_on || p.created_at))
          .sort((a, b) => String(a.paid_on || a.created_at).localeCompare(String(b.paid_on || b.created_at)))
          .map(p => {
            const o = orderById(p.order_id);
            return [
              String(p.paid_on || p.created_at).slice(0, 10),
              o ? orderLabel(o) : '',
              o?.customer_name || '',
              n(p.amount),
              PAY_METHODS[p.method] || p.method || '',
              p.received_by || ''
            ];
          })
      ]
    },
    gastos: {
      label: 'Gastos del mes',
      note: 'Los gastos que anotaste en el mes.',
      rows: () => [
        ['Fecha', 'Tipo', 'Detalle', 'Monto'],
        ...(S.expenses || [])
          .filter(e => inMonth(e.spent_on))
          .sort((a, b) => String(a.spent_on).localeCompare(String(b.spent_on)))
          .map(e => [
            e.spent_on,
            EXPENSE_CATEGORIES[e.category] || e.category || '',
            e.description || '',
            n(e.amount)
          ])
      ]
    },
    deben: {
      label: 'Lo que me deben (hoy)',
      note: 'Pedidos con saldo pendiente, del más antiguo al más nuevo. No depende del mes.',
      rows: () => [
        ['Pedido', 'Cliente', 'Teléfono', 'Detalle', 'Desde', 'Total', 'Pagado', 'Me deben'],
        ...cobrarRows().map(({ o, b, customer }) => [
          orderLabel(o),
          o.customer_name || '',
          customer?.phone || '',
          o.title,
          String(o.created_at).slice(0, 10),
          b.total,
          b.paid,
          b.due
        ])
      ]
    }
  };
}
function csvFileName(key, y, m) {
  return (
    'KultiApp-' +
    key +
    (key === 'deben' ? '-' + localToday() : '-' + y + '-' + String(m + 1).padStart(2, '0')) +
    '.csv'
  );
}
function showCsvExport(y, m) {
  const sets = csvSets(y, m),
    dialog = showDialog(
      'csvDialog',
      '<div class="section-title"><h2>Descargar en CSV</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p class="small muted">Archivos que abres en Excel o Google Sheets. Mes: <b>' +
        esc(new Date(y, m, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })) +
        '</b>.</p><div class="menu-list">' +
        Object.entries(sets)
          .map(
            ([k, s]) =>
              '<button type="button" class="menu-item" data-csv="' +
              k +
              '">' +
              icon('download') +
              '<span><b>' +
              s.label +
              '</b><br><small class="muted">' +
              s.note +
              '</small></span></button>'
          )
          .join('') +
        '</div>'
    );
  dialog.querySelectorAll('[data-csv]').forEach(
    b =>
      (b.onclick = () => {
        const rows = sets[b.dataset.csv].rows();
        if (rows.length < 2) return toast('No hay datos para descargar en ese archivo.');
        downloadBlob(csvBlob(rows), csvFileName(b.dataset.csv, y, m));
        toast('Archivo descargado (' + (rows.length - 1) + ' filas).');
      })
  );
  return dialog;
}
