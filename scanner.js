// FUNÇÃO: SCANNER — INÍCIO
// ══ O SCANNER (botão 14 da calculadora, só no PC, nada sobe para o ar) ═════════════════════════
// Recebe uma MALHA de triângulos (a que sai da reconstrução por vídeo, ou um STL/OBJ/PLY importado) e entrega o que a oficina
// precisa: a peça ENDIREITADA nos eixos, na ESCALA em mm, as 3 VISTAS 2D (linhas visíveis e ocultas) e os DIÂMETROS (furos e
// cilindros) com posição. Este arquivo é independente do CAD: não lê nem muda cad.js/cad3d.js.
//
// A malha é { pos: Float32Array (x,y,z,...), ind: Uint32Array (3 por triângulo) }.

// ── leitura ──────────────────────────────────────────────────────────────────────────────────
// buf: ArrayBuffer ou string; nome: só para decidir o formato pela extensão
function scnLerMalha(buf, nome) {
    const ext = (nome || "").toLowerCase().split(".").pop();
    if (ext === "obj") return scnLerObj(typeof buf === "string" ? buf : new TextDecoder().decode(buf));
    if (ext === "ply") return scnLerPly(buf);
    return scnLerStl(buf);
}
function scnLerStl(buf) {
    if (typeof buf === "string") return scnLerStlTexto(buf);
    const dv = new DataView(buf);
    const n = dv.byteLength >= 84 ? dv.getUint32(80, true) : 0;
    if (dv.byteLength === 84 + 50 * n && n > 0) { // binário
        const pos = new Float32Array(n * 9);
        for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(84 + 50 * t + 12 + 4 * k, true);
        return scnSolda({ pos, ind: Uint32Array.from({ length: n * 3 }, (_, i) => i) });
    }
    return scnLerStlTexto(new TextDecoder().decode(buf));
}
function scnLerStlTexto(txt) {
    const v = [];
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m;
    while ((m = re.exec(txt))) v.push(+m[1], +m[2], +m[3]);
    return scnSolda({ pos: Float32Array.from(v), ind: Uint32Array.from({ length: v.length / 3 }, (_, i) => i) });
}
function scnLerObj(txt) {
    const pos = [], ind = [];
    txt.split(/\r?\n/).forEach((l) => {
        const p = l.trim().split(/\s+/);
        if (p[0] === "v") pos.push(+p[1], +p[2], +p[3]);
        else if (p[0] === "f") {
            const ix = p.slice(1).map((s) => { const k = parseInt(s.split("/")[0], 10); return k < 0 ? pos.length / 3 + k : k - 1; });
            for (let i = 1; i + 1 < ix.length; i++) ind.push(ix[0], ix[i], ix[i + 1]);
        }
    });
    return scnSolda({ pos: Float32Array.from(pos), ind: Uint32Array.from(ind) });
}
function scnLerPly(buf) {
    const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf);
    const fim = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096))).indexOf("end_header");
    if (fim < 0) throw new Error("PLY sem cabeçalho");
    const cab = new TextDecoder().decode(bytes.subarray(0, fim + 10)).split(/\r?\n/);
    const corpo = fim + 10 + (bytes[fim + 10] === 13 ? 2 : 1);
    const nv = +(cab.find((l) => /^element vertex/.test(l)) || "").split(" ")[2], nf = +(cab.find((l) => /^element face/.test(l)) || "").split(" ")[2];
    const props = cab.filter((l) => /^property/.test(l));
    const bin = cab.some((l) => /^format binary_little_endian/.test(l));
    const pos = new Float32Array(nv * 3), ind = [];
    if (!bin) {
        const ls = new TextDecoder().decode(bytes.subarray(corpo)).split(/\r?\n/);
        for (let i = 0; i < nv; i++) { const p = ls[i].trim().split(/\s+/); pos[3 * i] = +p[0]; pos[3 * i + 1] = +p[1]; pos[3 * i + 2] = +p[2]; }
        for (let i = 0; i < nf; i++) { const p = ls[nv + i].trim().split(/\s+/).map(Number); for (let k = 2; k < p[0]; k++) ind.push(p[1], p[k], p[k + 1]); }
    } else {
        const tam = { char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, float32: 4, double: 8 };
        const vp = props.slice(0, props.findIndex((l) => /list/.test(l)) < 0 ? props.length : props.findIndex((l) => /list/.test(l)));
        const vprops = vp.map((l) => l.split(/\s+/)); // property tipo nome
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let o = corpo;
        for (let i = 0; i < nv; i++) {
            for (const [, tp, nm] of vprops) {
                const x = tp === "double" ? dv.getFloat64(o, true) : /^float/.test(tp) ? dv.getFloat32(o, true) : 0;
                if (nm === "x") pos[3 * i] = x; else if (nm === "y") pos[3 * i + 1] = x; else if (nm === "z") pos[3 * i + 2] = x;
                o += tam[tp];
            }
        }
        const lp = props.find((l) => /list/.test(l)).split(/\s+/); // property list tipoContagem tipoIndice nome
        const lerI = (tp) => { const r = tp === "uchar" || tp === "char" ? dv.getUint8(o) : tp === "ushort" || tp === "short" ? dv.getUint16(o, true) : dv.getUint32(o, true); o += tam[tp]; return r; };
        for (let i = 0; i < nf; i++) { const c = lerI(lp[2]); const p = []; for (let k = 0; k < c; k++) p.push(lerI(lp[3])); for (let k = 1; k + 1 < c; k++) ind.push(p[0], p[k], p[k + 1]); }
    }
    return scnSolda({ pos, ind: Uint32Array.from(ind) });
}

// solda os vértices repetidos (a posição decide) e tira triângulos de área zero
function scnSolda(m, tol) {
    const P = m.pos, n = P.length / 3;
    let lo = [1e30, 1e30, 1e30], hi = [-1e30, -1e30, -1e30];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[3 * i + k]); hi[k] = Math.max(hi[k], P[3 * i + k]); }
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    const q = tol || diag * 1e-6;
    const mapa = new Map(), novo = [], remap = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        const k = Math.round(P[3 * i] / q) + "," + Math.round(P[3 * i + 1] / q) + "," + Math.round(P[3 * i + 2] / q);
        let j = mapa.get(k);
        if (j === undefined) { j = novo.length / 3; mapa.set(k, j); novo.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); }
        remap[i] = j;
    }
    const ind = [];
    for (let t = 0; t < m.ind.length; t += 3) {
        const a = remap[m.ind[t]], b = remap[m.ind[t + 1]], c = remap[m.ind[t + 2]];
        if (a !== b && b !== c && a !== c) ind.push(a, b, c);
    }
    return { pos: Float32Array.from(novo), ind: Uint32Array.from(ind) };
}

// ── geometria básica ─────────────────────────────────────────────────────────────────────────
function scnCaixa(m) {
    const P = m.pos, lo = [1e30, 1e30, 1e30], hi = [-1e30, -1e30, -1e30];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
    return { lo, hi, dim: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}
function scnNormais(m) { // normal unitária e área de cada triângulo
    const P = m.pos, I = m.ind, nt = I.length / 3, N = new Float64Array(nt * 3), A = new Float64Array(nt);
    for (let t = 0; t < nt; t++) {
        const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, L = Math.hypot(x, y, z);
        A[t] = L / 2;
        if (L > 0) { N[3 * t] = x / L; N[3 * t + 1] = y / L; N[3 * t + 2] = z / L; }
    }
    return { N, A };
}
// a malha voltada para fora? (volume com sinal; negativo = triângulos virados para dentro)
function scnVolume(m) {
    const P = m.pos, I = m.ind;
    let v = 0;
    for (let t = 0; t < I.length; t += 3) {
        const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
        v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
    }
    return v / 6;
}
function scnDesvira(m) { // troca a ordem dos triângulos quando a malha está virada para dentro
    if (scnVolume(m) >= 0) return m;
    const I = Uint32Array.from(m.ind);
    for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
    return { pos: m.pos, ind: I };
}
function scnAplica(m, M, desloca) { // M: 3 linhas; devolve nova malha com p' = M p + desloca
    const P = m.pos, Q = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) for (let r = 0; r < 3; r++) Q[i + r] = M[r][0] * P[i] + M[r][1] * P[i + 1] + M[r][2] * P[i + 2] + (desloca ? desloca[r] : 0);
    return { pos: Q, ind: m.ind };
}

// ── escala ───────────────────────────────────────────────────────────────────────────────────
// a escala vem de UMA medida conhecida: dois pontos da malha e a distância real entre eles (mm)
function scnEscalaPorMedida(m, p1, p2, mm) {
    const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]);
    if (!(d > 0) || !(mm > 0)) throw new Error("medida inválida");
    return scnAplica(m, [[mm / d, 0, 0], [0, mm / d, 0], [0, 0, mm / d]]);
}
// a escala vem de uma dimensão da caixa (eixo 0,1,2 da peça já endireitada) medida com paquímetro
function scnEscalaPorEixo(m, eixo, mm) {
    const c = scnCaixa(m), f = mm / c.dim[eixo];
    return scnAplica(m, [[f, 0, 0], [0, f, 0], [0, 0, f]]);
}

// ── endireitar: a direção que mais face tem vira Z; a segunda, X ─────────────────────────────
function scnDirecoes(n) { // n pontos quase uniformes na esfera (espiral de Fibonacci)
    const D = [];
    for (let i = 0; i < n; i++) { const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z), a = i * 2.399963229728653; D.push([r * Math.cos(a), r * Math.sin(a), z]); }
    return D;
}
function scnEixosDaPeca(m) {
    const { N, A } = scnNormais(m), nt = A.length;
    const D = scnDirecoes(4000);
    const peso = new Float64Array(D.length);
    const cosMin = Math.cos(3 * Math.PI / 180);
    for (let t = 0; t < nt; t++) {
        if (A[t] === 0) continue;
        const nx = N[3 * t], ny = N[3 * t + 1], nz = N[3 * t + 2];
        for (let i = 0; i < D.length; i++) { const c = Math.abs(nx * D[i][0] + ny * D[i][1] + nz * D[i][2]); if (c > cosMin) peso[i] += A[t]; }
    }
    let ib = 0;
    for (let i = 1; i < D.length; i++) if (peso[i] > peso[ib]) ib = i;
    // refina a média das normais perto da direção achada
    const media = (d0, filtro) => {
        let sx = 0, sy = 0, sz = 0;
        for (let t = 0; t < nt; t++) {
            if (A[t] === 0 || (filtro && !filtro(t))) continue;
            let c = N[3 * t] * d0[0] + N[3 * t + 1] * d0[1] + N[3 * t + 2] * d0[2];
            if (Math.abs(c) < cosMin) continue;
            const s = c < 0 ? -1 : 1;
            sx += s * A[t] * N[3 * t]; sy += s * A[t] * N[3 * t + 1]; sz += s * A[t] * N[3 * t + 2];
        }
        const L = Math.hypot(sx, sy, sz) || 1;
        return [sx / L, sy / L, sz / L];
    };
    const d1 = media(D[ib]);
    // segunda direção: entre as normais perpendiculares a d1, a de mais área (histograma de ângulo, 0,5° por casa)
    let u = Math.abs(d1[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
    let e1 = norm(cross(d1, u)); const e2 = cross(d1, e1);
    const casas = 360, H = new Float64Array(casas);
    for (let t = 0; t < nt; t++) {
        if (A[t] === 0) continue;
        const n = [N[3 * t], N[3 * t + 1], N[3 * t + 2]];
        if (Math.abs(dot(n, d1)) > 0.05) continue;
        let ang = Math.atan2(dot(n, e2), dot(n, e1)); if (ang < 0) ang += Math.PI; // dobra meia-volta
        H[Math.min(casas - 1, Math.floor(ang / Math.PI * casas))] += A[t];
    }
    let kb = 0, tem = false;
    for (let k = 0; k < casas; k++) { if (H[k] > 0) tem = true; if (H[k] > H[kb]) kb = k; }
    let d2;
    if (tem) {
        const ang = (kb + 0.5) / casas * Math.PI;
        const g = [e1[0] * Math.cos(ang) + e2[0] * Math.sin(ang), e1[1] * Math.cos(ang) + e2[1] * Math.sin(ang), e1[2] * Math.cos(ang) + e2[2] * Math.sin(ang)];
        d2 = norm(media(g, (t) => Math.abs(N[3 * t] * d1[0] + N[3 * t + 1] * d1[1] + N[3 * t + 2] * d1[2]) < 0.05));
        d2 = norm([d2[0] - dot(d2, d1) * d1[0], d2[1] - dot(d2, d1) * d1[1], d2[2] - dot(d2, d1) * d1[2]]);
    } else d2 = e1;
    const d3 = cross(d1, d2);
    return { z: d1, x: d2, y: d3, forca: peso[ib] };
}
// gira e centra: a caixa fica no 1º octante, com o canto no zero
function scnEndireita(m) {
    const e = scnEixosDaPeca(m);
    let r = scnAplica(m, [e.x, e.y, e.z]);
    const c = scnCaixa(r);
    // a maior dimensão fica em X, a menor em Z? não: a direção de mais face (chão da peça) é Z; o resto fica como veio
    r = scnAplica(r, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [-c.lo[0], -c.lo[1], -c.lo[2]]);
    return scnDesvira(r);
}

// ── arestas ──────────────────────────────────────────────────────────────────────────────────
function scnArestas(m) { // lista de { a, b, t1, t2 } (t2 = -1 na borda aberta)
    const I = m.ind, mapa = new Map(), out = [];
    for (let t = 0; t < I.length / 3; t++) for (let k = 0; k < 3; k++) {
        const a = I[3 * t + k], b = I[3 * t + (k + 1) % 3], c = a < b ? a * 4294967296 + b : b * 4294967296 + a;
        const e = mapa.get(c);
        if (!e) { const n = { a: Math.min(a, b), b: Math.max(a, b), t1: t, t2: -1, extra: 0 }; mapa.set(c, n); out.push(n); }
        else if (e.t2 < 0) e.t2 = t; else e.extra++;
    }
    return out;
}

// ── as 3 vistas ──────────────────────────────────────────────────────────────────────────────
// w aponta para o observador; u para a direita; v para cima (u × v = w)
const SCN_VISTAS = {
    frontal: { u: [1, 0, 0], v: [0, 0, 1], w: [0, -1, 0] },
    superior: { u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] },
    lateral: { u: [0, 1, 0], v: [0, 0, 1], w: [1, 0, 0] },
};
function scnVista(m, nomeOuVista, opc) {
    const V = typeof nomeOuVista === "string" ? SCN_VISTAS[nomeOuVista] : nomeOuVista;
    const angVinco = ((opc && opc.vinco) || 25) * Math.PI / 180, cosVinco = Math.cos(angVinco);
    const P = m.pos, I = m.ind, nv = P.length / 3, nt = I.length / 3;
    const U = new Float64Array(nv), Vv = new Float64Array(nv), W = new Float64Array(nv);
    let u0 = 1e30, u1 = -1e30, v0 = 1e30, v1 = -1e30;
    for (let i = 0; i < nv; i++) {
        const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
        U[i] = x * V.u[0] + y * V.u[1] + z * V.u[2]; Vv[i] = x * V.v[0] + y * V.v[1] + z * V.v[2]; W[i] = x * V.w[0] + y * V.w[1] + z * V.w[2];
        u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]); v0 = Math.min(v0, Vv[i]); v1 = Math.max(v1, Vv[i]);
    }
    const tam = Math.max(u1 - u0, v1 - v0) || 1, R = (opc && opc.resolucao) || 800, pix = tam / R;
    const gw = Math.ceil((u1 - u0) / pix) + 3, gh = Math.ceil((v1 - v0) / pix) + 3;
    const Z = new Float32Array(gw * gh).fill(-1e30);
    // z-buffer: cada triângulo no seu pixel, maior w = mais perto do observador
    for (let t = 0; t < nt; t++) {
        const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
        const ax = (U[a] - u0) / pix + 1, ay = (Vv[a] - v0) / pix + 1, bx = (U[b] - u0) / pix + 1, by = (Vv[b] - v0) / pix + 1, cx = (U[c] - u0) / pix + 1, cy = (Vv[c] - v0) / pix + 1;
        const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(den) < 1e-12) continue;
        const xa = Math.max(0, Math.floor(Math.min(ax, bx, cx))), xb = Math.min(gw - 1, Math.ceil(Math.max(ax, bx, cx)));
        const ya = Math.max(0, Math.floor(Math.min(ay, by, cy))), yb = Math.min(gh - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
            const px = x + 0.5, py = y + 0.5;
            const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
            const e = -0.02;
            if (l1 < e || l2 < e || l3 < e) continue;
            const w = l1 * W[a] + l2 * W[b] + l3 * W[c];
            if (w > Z[y * gw + x]) Z[y * gw + x] = w;
        }
    }
    const tolW = tam * 0.004 + pix;
    const { N } = scnNormais(m);
    const face = (t) => N[3 * t] * V.w[0] + N[3 * t + 1] * V.w[1] + N[3 * t + 2] * V.w[2];
    const visivel = (u, v, w) => {
        const x = Math.round((u - u0) / pix + 1), y = Math.round((v - v0) / pix + 1);
        let zmax = -1e30;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) zmax = Math.max(zmax, Z[yy * gw + xx]); }
        return w >= zmax - tolW;
    };
    const vis = [], oculta = [];
    for (const e of scnArestas(m)) {
        let marca = e.t2 < 0 || e.extra > 0; // borda aberta ou não-variedade
        if (!marca) {
            const n1 = [N[3 * e.t1], N[3 * e.t1 + 1], N[3 * e.t1 + 2]], n2 = [N[3 * e.t2], N[3 * e.t2 + 1], N[3 * e.t2 + 2]];
            if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < cosVinco) marca = true; // vinco
            else { const f1 = face(e.t1), f2 = face(e.t2); if ((f1 > 1e-9 && f2 < -1e-9) || (f1 < -1e-9 && f2 > 1e-9)) marca = true; } // silhueta
        }
        if (!marca) continue;
        const a = e.a, b = e.b, L = Math.hypot(U[b] - U[a], Vv[b] - Vv[a]);
        if (L < pix * 0.5) continue;
        const passos = Math.max(1, Math.ceil(L / pix)), cor = [];
        for (let s = 0; s <= passos; s++) {
            const f = s / passos, u = U[a] + (U[b] - U[a]) * f, v = Vv[a] + (Vv[b] - Vv[a]) * f, w = W[a] + (W[b] - W[a]) * f;
            cor.push([u, v, visivel(u, v, w)]);
        }
        let ini = 0;
        for (let s = 1; s <= passos + 1; s++) {
            if (s === passos + 1 || cor[s][2] !== cor[ini][2]) {
                const fim = s - 1;
                if (fim > ini) (cor[ini][2] ? vis : oculta).push([cor[ini][0], cor[ini][1], cor[fim][0], cor[fim][1]]);
                ini = s;
            }
        }
    }
    return { caixa: { u0, u1, v0, v1 }, visiveis: scnJuntaRetas(vis, pix * 2), ocultas: scnJuntaRetas(oculta, pix * 2), pix };
}
// junta segmentos colineares encostados (a malha quebra as linhas em pedacinhos)
function scnJuntaRetas(S, tol) {
    const out = [], usada = new Array(S.length).fill(false);
    const dirDe = (s) => { const L = Math.hypot(s[2] - s[0], s[3] - s[1]); return L ? [(s[2] - s[0]) / L, (s[3] - s[1]) / L] : [1, 0]; };
    for (let i = 0; i < S.length; i++) {
        if (usada[i]) continue;
        usada[i] = true;
        let cur = S[i].slice(), d = dirDe(cur), mudou = true;
        while (mudou) {
            mudou = false;
            for (let j = 0; j < S.length; j++) {
                if (usada[j]) continue;
                const s = S[j], dj = dirDe(s);
                if (Math.abs(d[0] * dj[1] - d[1] * dj[0]) > 0.002) continue; // paralelas
                const dist = (px, py) => Math.abs((px - cur[0]) * d[1] - (py - cur[1]) * d[0]);
                if (dist(s[0], s[1]) > tol || dist(s[2], s[3]) > tol) continue; // sobre a mesma reta
                const t = (px, py) => (px - cur[0]) * d[0] + (py - cur[1]) * d[1];
                const tc0 = 0, tc1 = t(cur[2], cur[3]), ts0 = t(s[0], s[1]), ts1 = t(s[2], s[3]);
                const lo = Math.min(tc0, tc1), hi = Math.max(tc0, tc1), slo = Math.min(ts0, ts1), shi = Math.max(ts0, ts1);
                if (slo > hi + tol || shi < lo - tol) continue; // encostam?
                const nlo = Math.min(lo, slo), nhi = Math.max(hi, shi);
                cur = [cur[0] + d[0] * nlo, cur[1] + d[1] * nlo, cur[0] + d[0] * nhi, cur[1] + d[1] * nhi];
                usada[j] = true; mudou = true;
            }
        }
        out.push(cur);
    }
    return out;
}

// ── diâmetros: cilindros e furos ─────────────────────────────────────────────────────────────
// Na peça endireitada, procura as faces paralelas ao eixo (normal ⟂ eixo), agrupa as que se encostam e ajusta um círculo no
// plano de cada grupo. Normal apontando para o centro = FURO; para fora = cilindro externo.
function scnCilindros(m, opc) {
    const { N, A } = scnNormais(m), I = m.ind, P = m.pos, nt = A.length;
    const tolRes = (opc && opc.tolRes) || 0.01;
    const lista = [];
    for (let eixo = 0; eixo < 3; eixo++) {
        const sel = [];
        for (let t = 0; t < nt; t++) if (A[t] > 0 && Math.abs(N[3 * t + eixo]) < 0.1) sel.push(t);
        if (sel.length < 8) continue;
        const pai = new Map(sel.map((t) => [t, t]));
        const raiz = (t) => { while (pai.get(t) !== t) { pai.set(t, pai.get(pai.get(t))); t = pai.get(t); } return t; };
        const porVertice = new Map();
        for (const t of sel) for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; if (!porVertice.has(v)) porVertice.set(v, []); porVertice.get(v).push(t); }
        for (const ts of porVertice.values()) for (let i = 1; i < ts.length; i++) { // junta só triângulos de normais parecidas (a curva muda aos poucos)
            const a = ts[0], b = ts[i];
            if (N[3 * a] * N[3 * b] + N[3 * a + 1] * N[3 * b + 1] + N[3 * a + 2] * N[3 * b + 2] > 0.7) pai.set(raiz(a), raiz(b));
        }
        const grupos = new Map();
        for (const t of sel) { const r = raiz(t); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(t); }
        const [p, q] = eixo === 0 ? [1, 2] : eixo === 1 ? [0, 2] : [0, 1];
        for (const ts of grupos.values()) {
            if (ts.length < 6) continue;
            const vs = new Set();
            ts.forEach((t) => { for (let k = 0; k < 3; k++) vs.add(I[3 * t + k]); });
            const pts = [...vs].map((v) => [P[3 * v + p], P[3 * v + q], P[3 * v + eixo]]);
            // ajuste algébrico de círculo (Kåsa): x²+y² + D x + E y + F = 0 pelos mínimos quadrados
            let sx = 0, sy = 0; pts.forEach((s) => { sx += s[0]; sy += s[1]; });
            const mx = sx / pts.length, my = sy / pts.length;
            let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
            pts.forEach((s) => { const uu = s[0] - mx, vv = s[1] - my; Suu += uu * uu; Suv += uu * vv; Svv += vv * vv; Suuu += uu * uu * uu; Svvv += vv * vv * vv; Suvv += uu * vv * vv; Svuu += vv * uu * uu; });
            const det = Suu * Svv - Suv * Suv;
            if (Math.abs(det) < 1e-12) continue;
            const b1 = (Suuu + Suvv) / 2, b2 = (Svvv + Svuu) / 2;
            const uc = (b1 * Svv - b2 * Suv) / det, vc = (Suu * b2 - Suv * b1) / det;
            const cx = uc + mx, cy = vc + my;
            const raios = pts.map((s) => Math.hypot(s[0] - cx, s[1] - cy));
            const r = raios.reduce((a, b) => a + b, 0) / raios.length;
            const rms = Math.sqrt(raios.reduce((a, b) => a + (b - r) * (b - r), 0) / raios.length);
            if (!(r > 0) || rms > tolRes * r) continue;
            // cobertura angular: maior vão entre as NORMAIS do grupo (uma faixa plana tem todas iguais e não é cilindro)
            const angs = ts.map((t) => Math.atan2(N[3 * t + q], N[3 * t + p])).sort((a, b) => a - b);
            let vao = 2 * Math.PI - (angs[angs.length - 1] - angs[0]);
            for (let i = 1; i < angs.length; i++) vao = Math.max(vao, angs[i] - angs[i - 1]);
            const cobre = 2 * Math.PI - vao;
            if (cobre < Math.PI * 0.6) continue; // pedaço de arco curto demais: não vale como cilindro
            // furo ou eixo: a normal aponta para o centro (furo) ou para fora (cilindro)?
            let s = 0;
            ts.forEach((t) => {
                const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
                const gx = (P[3 * a + p] + P[3 * b + p] + P[3 * c + p]) / 3 - cx, gy = (P[3 * a + q] + P[3 * b + q] + P[3 * c + q]) / 3 - cy;
                s += A[t] * (N[3 * t + p] * gx + N[3 * t + q] * gy);
            });
            const z0 = Math.min(...pts.map((x) => x[2])), z1 = Math.max(...pts.map((x) => x[2]));
            lista.push({ eixo, centro: [cx, cy], plano: [p, q], diametro: 2 * r, furo: s < 0, arco: cobre < Math.PI * 1.9, de: z0, ate: z1, resíduo: rms });
        }
    }
    // une pedaços do mesmo cilindro (mesmo eixo, centro e diâmetro) que a malha separou
    const unidos = [];
    for (const c of lista) {
        const u = unidos.find((o) => o.eixo === c.eixo && o.furo === c.furo && Math.abs(o.diametro - c.diametro) < 0.02 * c.diametro + 1e-3 && Math.hypot(o.centro[0] - c.centro[0], o.centro[1] - c.centro[1]) < 0.02 * c.diametro + 1e-3);
        if (u) { u.de = Math.min(u.de, c.de); u.ate = Math.max(u.ate, c.ate); u.arco = u.arco && c.arco; } else unidos.push({ ...c });
    }
    return unidos.sort((a, b) => b.diametro - a.diametro);
}

// ── tudo junto: o relatório que a tela mostra e o desenho de construção usa ──────────────────
function scnAnalisa(m, opc) {
    const c = scnCaixa(m);
    return { caixa: c, vistas: { frontal: scnVista(m, "frontal", opc), superior: scnVista(m, "superior", opc), lateral: scnVista(m, "lateral", opc) }, cilindros: scnCilindros(m, opc), volume: Math.abs(scnVolume(m)) };
}
// FUNÇÃO: SCANNER — FIM
if (typeof module !== "undefined") module.exports = { scnLerMalha, scnSolda, scnCaixa, scnVolume, scnEscalaPorMedida, scnEscalaPorEixo, scnEixosDaPeca, scnEndireita, scnVista, scnCilindros, scnAnalisa, scnAplica };
