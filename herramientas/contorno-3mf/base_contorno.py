#!/usr/bin/env python3
"""
base_contorno.py  -  Agrega un contorno (base fina) de borde suave a textos en relieve de un 3MF.

Uso:
    py base_contorno.py mi_texto.3mf
    py base_contorno.py mi_texto.3mf -o resultado.3mf --margen 1.0 --base 0.6 --relieve 1.6

Entrada : un 3MF exportado desde tu slicer (Anycubic Slicer Next / Bambu Studio) con el/los textos.
          Cada objeto de la placa se trata como "letras" y recibe su propio contorno.
Salida  : un 3MF nuevo donde cada objeto tiene 2 partes:
            - Contorno (base)  -> filamento 1
            - Letras           -> filamento 2
          Se conservan los ajustes de impresora/filamentos del archivo original.

Instalar una sola vez:   py -m pip install numpy scipy pillow contourpy
"""
import argparse, re, sys, zipfile, os, math
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import contourpy

NS = {'c': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
      'p': 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'}
RES = 0.05  # mm por pixel al calcular el contorno


# ---------------------------------------------------------------- lectura 3MF
def parse_transform(s):
    if not s:
        return np.eye(3), np.zeros(3)
    v = [float(x) for x in s.split()]
    return np.array(v[:9]).reshape(3, 3), np.array(v[9:12])


def read_mesh(obj):
    mesh = obj.find('c:mesh', NS)
    V = np.array([[float(v.get(k)) for k in 'xyz'] for v in mesh.find('c:vertices', NS)])
    T = np.array([[int(t.get(k)) for k in ('v1', 'v2', 'v3')] for t in mesh.find('c:triangles', NS)])
    return V, T


def load_objects(z):
    """Devuelve lista de (nombre, V, T) en coordenadas de la placa, una por cada item de 'build'."""
    root = ET.fromstring(z.read('3D/3dmodel.model'))
    cache = {}

    def objects_of(path):
        if path not in cache:
            r = ET.fromstring(z.read(path.lstrip('/'))) if path else root
            cache[path] = {o.get('id'): o for o in r.find('c:resources', NS).findall('c:object', NS)}
        return cache[path]

    # nombres desde model_settings.config (si existe)
    names = {}
    if 'Metadata/model_settings.config' in z.namelist():
        txt = z.read('Metadata/model_settings.config').decode('utf-8')
        txt = txt.replace('<config>', '<config xmlns:slic3rpe="urn:slic3rpe">', 1)  # el slicer usa un prefijo sin declarar
        try:
            cfg = ET.fromstring(txt)
            for o in cfg.findall('object'):
                for m in o.findall('metadata'):
                    if m.get('key') == 'name':
                        names[o.get('id')] = m.get('value')
                        break
        except ET.ParseError:
            pass  # sin nombres: se usan nombres genericos

    def collect(path, oid, M, t):
        o = objects_of(path)[oid]
        comps = o.find('c:components', NS)
        if comps is None:
            V, T = read_mesh(o)
            return [(V @ M + t, T)]
        out = []
        for c in comps.findall('c:component', NS):
            cp = c.get('{%s}path' % NS['p']) or path
            Mc, tc = parse_transform(c.get('transform'))
            out += collect(cp, c.get('objectid'), Mc @ M, tc @ M + t)
        return out

    res = []
    for item in root.find('c:build', NS).findall('c:item', NS):
        Mi, ti = parse_transform(item.get('transform'))
        parts = collect('', item.get('objectid'), Mi, ti)
        Vs, Ts, off = [], [], 0
        for V, T in parts:
            Vs.append(V); Ts.append(T + off); off += len(V)
        res.append((names.get(item.get('objectid'), 'Texto'), np.vstack(Vs), np.vstack(Ts)))
    return res


# ---------------------------------------------------------------- geometria 2D
def area2(p):
    x, y = p[:, 0], p[:, 1]
    return np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def douglas_peucker(pts, tol):
    n = len(pts)
    keep = np.zeros(n, bool); keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p = pts[a + 1:b]; A = pts[a]; B = pts[b]; d = B - A; L = np.hypot(*d)
        dist = np.hypot(*(p - A).T) if L < 1e-12 else np.abs(d[0] * (p[:, 1] - A[1]) - d[1] * (p[:, 0] - A[0])) / L
        i = int(np.argmax(dist))
        if dist[i] > tol:
            k = a + 1 + i; keep[k] = True; stack += [(a, k), (k, b)]
    return pts[keep]


def ear_clip(P):
    n = len(P)
    prv = {i: (i - 1) % n for i in range(n)}
    nxt = {i: (i + 1) % n for i in range(n)}

    def cross(a, b, c):
        return (P[b, 0] - P[a, 0]) * (P[c, 1] - P[a, 1]) - (P[b, 1] - P[a, 1]) * (P[c, 0] - P[a, 0])

    def convex(i):
        return cross(prv[i], i, nxt[i]) >= 0

    def inside(a, b, c, q):
        return cross(a, b, q) > 1e-12 and cross(b, c, q) > 1e-12 and cross(c, a, q) > 1e-12

    reflex = {i for i in range(n) if not convex(i)}

    def is_ear(i):
        if i in reflex:
            return False
        a, c = prv[i], nxt[i]
        return not any(r not in (a, c, i) and inside(a, i, c, r) for r in reflex)

    ear = {j: is_ear(j) for j in range(n)}
    tris, remaining, cur, guard = [], n, 0, 0
    while remaining > 3:
        found, j, cnt = None, cur, 0
        while cnt < remaining:
            if ear[j]:
                found = j; break
            j = nxt[j]; cnt += 1
        if found is None:
            guard += 1
            if guard > 5:
                raise RuntimeError('No pude triangular el contorno (forma demasiado compleja).')
            for j in list(prv):
                ear[j] = is_ear(j)
            continue
        j = found; a, c = prv[j], nxt[j]
        tris.append((a, j, c))
        nxt[a] = c; prv[c] = a
        del prv[j], nxt[j], ear[j]; reflex.discard(j)
        remaining -= 1
        for k in (a, c):
            (reflex.discard if convex(k) else reflex.add)(k)
        for k in (a, c):
            ear[k] = is_ear(k)
        cur = a
    a = cur; b = nxt[a]; c = nxt[b]; tris.append((a, b, c))
    return np.array(tris)


def outline_loops(V, T, margen, cierre, suavizado=0.25):
    pad = int((margen + cierre + 2) / RES)
    x0, y0 = V[:, 0].min(), V[:, 1].min()
    W = int((V[:, 0].max() - x0) / RES) + 2 * pad
    H = int((V[:, 1].max() - y0) / RES) + 2 * pad
    im = Image.new('1', (W, H), 0); d = ImageDraw.Draw(im)
    for a, b, c in T:
        d.polygon([((V[i, 0] - x0) / RES + pad, (V[i, 1] - y0) / RES + pad) for i in (a, b, c)], fill=1)
    m = np.array(im, bool)
    R = margen + cierre
    dil = ndi.distance_transform_edt(~m) * RES <= R
    g = ndi.distance_transform_edt(dil) * RES - cierre
    b = g > 0
    filled = ndi.binary_fill_holes(b); g[filled & ~b] = 0.5
    g = ndi.gaussian_filter(g, sigma=suavizado / RES)
    loops = []
    for L in contourpy.contour_generator(z=g).lines(0.0):
        P = np.column_stack([(L[:, 0] - pad) * RES + x0, (L[:, 1] - pad) * RES + y0])
        if np.allclose(P[0], P[-1]) and abs(area2(P[:-1])) / 2 > 5:
            loops.append(P[:-1])
    return loops


def build_base(V, T, margen, cierre, espesor):
    # si el texto queda en varios trozos, aumenta el "cierre" hasta unirlo
    c = cierre
    for _ in range(6):
        loops = outline_loops(V, T, margen, c)
        if len(loops) == 1:
            break
        c += 0.5
    if len(loops) != 1:
        print('  AVISO: la base quedo en %d trozos (el texto esta muy separado).' % len(loops))
    Vs, Ts, off = [], [], 0
    for L in loops:
        P = douglas_peucker(np.vstack([L, L[:1]]), 0.01)[:-1]
        if area2(P) < 0:
            P = P[::-1]
        tr = ear_clip(P); n = len(P)
        Vb = np.vstack([np.column_stack([P, np.zeros(n)]), np.column_stack([P, np.full(n, espesor)])])
        Tb = []
        for a, b, c_ in tr:
            Tb.append((n + a, n + b, n + c_)); Tb.append((a, c_, b))
        for i in range(n):
            j = (i + 1) % n
            Tb.append((i, j, n + j)); Tb.append((i, n + j, n + i))
        Vs.append(Vb); Ts.append(np.array(Tb) + off); off += len(Vb)
    return np.vstack(Vs), np.vstack(Ts), loops


# ---------------------------------------------------------------- escritura 3MF
def mesh_file(V, T, oid, uuid):
    L = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
         'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
         'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">',
         ' <metadata name="BambuStudio:3mfVersion">1</metadata>', ' <resources>',
         '  <object id="%d" p:UUID="%s" type="model">' % (oid, uuid), '   <mesh>', '    <vertices>']
    L += ['     <vertex x="%.5f" y="%.5f" z="%.5f"/>' % tuple(v) for v in V]
    L += ['    </vertices>', '    <triangles>']
    L += ['     <triangle v1="%d" v2="%d" v3="%d"/>' % tuple(t) for t in T]
    L += ['    </triangles>', '   </mesh>', '  </object>', ' </resources>', ' <build/>', '</model>']
    return '\n'.join(L)


def thumbnail(items, size=512):
    allp = np.vstack([P for _, P in items])
    x0, y0 = allp.min(0); x1, y1 = allp.max(0)
    s = (size * 0.9) / max(x1 - x0, y1 - y0)
    im = Image.new('RGB', (size, size), (232, 232, 232)); d = ImageDraw.Draw(im)
    for _, P in items:
        pts = [((x - (x0 + x1) / 2) * s + size / 2, size / 2 - (y - (y0 + y1) / 2) * s) for x, y in P]
        d.polygon(pts, fill=(244, 244, 244), outline=(150, 150, 150))
    return im


def main():
    ap = argparse.ArgumentParser(description='Agrega contorno suave (base) a textos en relieve de un 3MF.')
    ap.add_argument('entrada')
    ap.add_argument('-o', '--salida')
    ap.add_argument('--margen', type=float, default=1.0, help='borde de la base alrededor de las letras, mm (1.0)')
    ap.add_argument('--cierre', type=float, default=2.6, help='cuanto une huecos entre letras, mm (2.6)')
    ap.add_argument('--base', type=float, default=0.6, help='espesor de la base, mm (0.6)')
    ap.add_argument('--relieve', type=float, default=1.6, help='alto de las letras sobre la base, mm (1.6). 0 = no tocar')
    ap.add_argument('--fil-base', type=int, default=1, help='filamento de la base (1)')
    ap.add_argument('--fil-letras', type=int, default=2, help='filamento de las letras (2)')
    a = ap.parse_args()
    out = a.salida or os.path.splitext(a.entrada)[0] + '_con_contorno.3mf'

    zin = zipfile.ZipFile(a.entrada)
    items = load_objects(zin)
    if not items:
        sys.exit('No encontre objetos en el 3MF.')

    mains, build, rels, setobj, inst, asm, files, outlines = [], [], [], [], [], [], {}, []
    oid = 1
    for k, (name, V, T) in enumerate(items, 1):
        print('Objeto %d: %s' % (k, name))
        V = V.copy()
        zr = V[:, 2].max() - V[:, 2].min()
        if a.relieve > 0:
            V[:, 2] = (V[:, 2] - V[:, 2].min()) * (a.relieve / zr)
        else:
            V[:, 2] -= V[:, 2].min()
        Vb, Tb, loops = build_base(V, T, a.margen, a.cierre, a.base)
        Vt = V.copy(); Vt[:, 2] += a.base
        outlines.append((name, loops[0]))
        print('  base: %d triangulos | relieve %.2f mm | total %.2f mm'
              % (len(Tb), Vt[:, 2].max() - a.base, Vt[:, 2].max()))
        bid, tid, mid = oid, oid + 1, oid + 2; oid += 3
        pb = '/3D/Objects/Base_%d.model' % k; pt = '/3D/Objects/Texto_%d.model' % k
        files[pb[1:]] = mesh_file(Vb, Tb, bid, '0%d010000-81cb-4c03-9d28-80fed5dfa1dc' % k)
        files[pt[1:]] = mesh_file(Vt, T, tid, '0%d020000-81cb-4c03-9d28-80fed5dfa1dc' % k)
        rels += [pb, pt]
        mains.append(f'''  <object id="{mid}" p:UUID="0000000{k}-61cb-4c03-9d28-80fed5dfa1dc" type="model">
   <components>
    <component p:path="{pb}" objectid="{bid}" p:UUID="0{k}010000-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
    <component p:path="{pt}" objectid="{tid}" p:UUID="0{k}020000-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
   </components>
  </object>''')
        build.append(f'  <item objectid="{mid}" p:UUID="0000000{k}-b1ec-4553-aec9-835e5b724bb4" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>')
        nm = name.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')
        setobj.append(f'''  <object id="{mid}">
    <metadata key="name" value="{nm}"/>
    <metadata key="extruder" value="{a.fil_base}"/>
    <part id="{bid}" subtype="normal_part">
      <metadata key="name" value="Contorno (base)"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="{a.fil_base}"/>
      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
    <part id="{tid}" subtype="normal_part">
      <metadata key="name" value="Letras"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="{a.fil_letras}"/>
      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>''')
        inst.append(f'''    <model_instance>
      <metadata key="object_id" value="{mid}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="{100 + k}"/>
    </model_instance>''')
        asm.append(f'   <assemble_item object_id="{mid}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 0 0 0" offset="0 0 0" />')

    main_xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '
                'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
                'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
                'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n'
                ' <metadata name="Application">BambuStudio-1.4.1.2</metadata>\n'
                ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n' + '\n'.join(mains) +
                '\n </resources>\n <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">\n' + '\n'.join(build) +
                '\n </build>\n</model>\n')
    settings = ('<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' + '\n'.join(setobj) + '''
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>
    <metadata key="thumbnail_no_light_file" value="Metadata/plate_no_light_1.png"/>
    <metadata key="top_file" value="Metadata/top_1.png"/>
    <metadata key="pick_file" value="Metadata/pick_1.png"/>
''' + '\n'.join(inst) + '\n  </plate>\n  <assemble>\n' + '\n'.join(asm) + '\n  </assemble>\n</config>\n')
    mrels = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
             '\n'.join(f' <Relationship Target="{p}" Id="rel-{i + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
                       for i, p in enumerate(rels)) + '\n</Relationships>\n')

    import io
    th = thumbnail(outlines); b = io.BytesIO(); th.save(b, 'PNG'); big = b.getvalue()
    b = io.BytesIO(); th.resize((128, 128)).save(b, 'PNG'); small = b.getvalue()

    skip = ('3D/', 'Metadata/model_settings.config', 'Metadata/plate_', 'Metadata/top_', 'Metadata/pick_', '[Content_Types].xml', '_rels/')
    names = zin.namelist()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', zin.read('[Content_Types].xml'))
        z.writestr('_rels/.rels', zin.read('_rels/.rels'))
        z.writestr('3D/3dmodel.model', main_xml); z.writestr('3D/_rels/3dmodel.model.rels', mrels)
        for n, c in files.items():
            z.writestr(n, c)
        z.writestr('Metadata/model_settings.config', settings)
        for n in names:
            if n.startswith('Metadata/') and not n.startswith(skip[1:]) and not n.endswith('.png'):
                z.writestr(n, zin.read(n))
        z.writestr('Metadata/plate_1.png', big); z.writestr('Metadata/plate_no_light_1.png', big)
        z.writestr('Metadata/top_1.png', big); z.writestr('Metadata/plate_1_small.png', small)
        if 'Metadata/pick_1.png' in names:
            z.writestr('Metadata/pick_1.png', zin.read('Metadata/pick_1.png'))
    print('Listo ->', out)


if __name__ == '__main__':
    main()
