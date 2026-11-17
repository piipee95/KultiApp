const assert = require('node:assert/strict');
const fs = require('fs'),
  path = require('path');
// Contorno 3D para textos (herramientas/contorno-3mf): la triangulación de letras con huecos.
// La «s» de Great Vibes tiene dos huecos pegados; el puente por rayo cruzaba el otro hueco y la herramienta
// terminaba con «No pude triangular el contorno». El fixture son los contornos reales de esa letra.
function load() {
  const html = fs.readFileSync(path.join(__dirname, '../herramientas/contorno-3mf/index.html'), 'utf8');
  const a = html.indexOf('  function area2(P)'),
    a2 = html.indexOf('\n', a);
  const b = html.indexOf('  function douglasPeucker(P, tol)'),
    c = html.indexOf('  // ------------------------------------------------------------ escritura 3MF');
  assert.ok(a > 0 && b > a && c > b, 'no encuentro las funciones de geometría en index.html');
  return new Function(
    html.slice(a, a2) + '\n' + html.slice(b, c) + '\nreturn {extrudeRegions,earClip,earClipOk,polyCrossings};'
  )();
}
// Malla cerrada y bien orientada: cada arista dirigida tiene su inversa exactamente una vez.
function mesh(m) {
  const E = new Map(),
    key = (u, v) => u + '>' + v;
  let vol = 0;
  for (let t = 0; t < m.T.length; t += 3) {
    const a = m.T[t],
      b = m.T[t + 1],
      c = m.T[t + 2];
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a]
    ])
      E.set(key(u, v), (E.get(key(u, v)) || 0) + 1);
    const A = [m.V[3 * a], m.V[3 * a + 1], m.V[3 * a + 2]],
      B = [m.V[3 * b], m.V[3 * b + 1], m.V[3 * b + 2]],
      C = [m.V[3 * c], m.V[3 * c + 1], m.V[3 * c + 2]];
    vol +=
      (A[0] * (B[1] * C[2] - B[2] * C[1]) -
        A[1] * (B[0] * C[2] - B[2] * C[0]) +
        A[2] * (B[0] * C[1] - B[1] * C[0])) /
      6;
  }
  let open = 0,
    repeated = 0;
  for (const [k, n] of E) {
    const [u, v] = k.split('>');
    if (E.get(key(v, u)) !== n) open++;
    if (n > 1) repeated++;
  }
  return { open, repeated, vol };
}
async function test() {
  const { extrudeRegions, earClip, earClipOk, polyCrossings } = load();
  // Un polígono simple se corta igual que siempre: n-2 triángulos que cubren el área exacta.
  const sq = [0, 0, 4, 0, 4, 3, 0, 3],
    tr = earClip(sq);
  assert.equal(tr.length / 3, 2);
  assert.ok(earClipOk(sq, tr));
  assert.equal(polyCrossings([0, 0, 4, 4, 4, 0, 0, 4]), 1);
  assert.equal(polyCrossings(sq), 0); // el lazo en 8 se cruza una vez
  // La «s» de Great Vibes: un contorno y dos huecos. Antes lanzaba «No pude triangular el contorno».
  const loops = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/contorno-3mf-great-vibes-s.json'), 'utf8')
  );
  assert.deepEqual(
    loops.map(l => l.length / 2),
    [73, 29, 17]
  );
  const area = P => {
    let s = 0;
    const n = P.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1];
    }
    return Math.abs(s) / 2;
  };
  const m = extrudeRegions(loops, 0.6, 2.2, 0.01);
  assert.equal(m.loops, 3);
  const r = mesh(m);
  assert.equal(r.open, 0, 'aristas abiertas');
  assert.equal(r.repeated, 0, 'aristas repetidas');
  const expected = (area(loops[0]) - area(loops[1]) - area(loops[2])) * 1.6;
  assert.ok(
    r.vol > 0 && Math.abs(r.vol - expected) / expected < 1e-3,
    'volumen ' + r.vol + ' vs ' + expected
  ); // letra con sus huecos, 1,6 mm de alto
  console.log(
    'PASS Contorno 3MF: triangulación de letras con huecos pegados (la «s» de Great Vibes), malla cerrada, orientada y con el volumen exacto.'
  );
}
test().catch(e => {
  console.error(e);
  process.exit(1);
});
