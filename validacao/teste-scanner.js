// Bancada do SCANNER (só no PC): uma flange e um bloco feitos pelo Manifold, girados e com a escala errada de propósito, voltam
// endireitados, na escala certa, com as vistas e os diâmetros que o desenho original tem.
const path = require("path");
const { pathToFileURL } = require("url");
const raiz = path.join(__dirname, "..");
const S = require(path.join(raiz, "scanner.js"));
let falhas = 0;
function ok(nome, c, visto) { if (c) { console.log("  ok   " + nome); return; } falhas++; console.log("  FALHA " + nome + (visto === undefined ? "" : "  (visto: " + JSON.stringify(visto) + ")")); }
const perto = (a, b, t) => Math.abs(a - b) <= (t === undefined ? 0.05 : t);

function doManifold(peca) {
    const mesh = peca.getMesh(), np = mesh.numProp, VP = mesh.vertProperties, tv = mesh.triVerts;
    const pos = new Float32Array((VP.length / np) * 3);
    for (let i = 0; i < VP.length / np; i++) { pos[3 * i] = VP[np * i]; pos[3 * i + 1] = VP[np * i + 1]; pos[3 * i + 2] = VP[np * i + 2]; }
    return { pos, ind: Uint32Array.from(tv) };
}
// uma rotação qualquer (eixo, ângulo) mais escala e deslocamento: a "foto" torta
function torta(m, eixo, ang, escala, desl) {
    const L = Math.hypot(...eixo), [x, y, z] = eixo.map((v) => v / L), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const R = [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
    return S.scnAplica(m, R.map((r) => r.map((v) => v * escala)), desl);
}
const achou = (cil, d, furo, tol) => cil.filter((c) => perto(c.diametro, d, tol === undefined ? 0.1 : tol) && c.furo === furo);

(async () => {
    const mod = await import(pathToFileURL(path.join(raiz, "vendor-manifold.mjs")).href);
    const w = await mod.default({ locateFile: () => path.join(raiz, "vendor-manifold.wasm") });
    w.setup();
    const { Manifold } = w;

    console.log("FLANGE: ⌀100 x 12, furo ⌀30, 4 furos ⌀10 no círculo ⌀70");
    let fl = Manifold.cylinder(12, 50, 50, 96);
    fl = fl.subtract(Manifold.cylinder(12, 15, 15, 64));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; fl = fl.subtract(Manifold.cylinder(12, 5, 5, 48).translate([35 * Math.cos(a), 35 * Math.sin(a), 0])); }
    const orig = doManifold(fl);
    ok("a flange original tem volume positivo", S.scnVolume(orig) > 0);

    const foto = torta(orig, [1, 2, 0.5], 0.9, 0.037, [3, -7, 11]); // girada, minúscula (como sai da reconstrução sem escala)
    const reto = S.scnEndireita(foto);
    const cx = S.scnCaixa(reto);
    // o chão da flange (a face de mais área) virou Z; a medida de 100 mm aparece em X e Y, a de 12 em Z
    ok("espessura em Z proporcional a 12/100 do diâmetro", perto(cx.dim[2] / cx.dim[0], 0.12, 0.002), cx.dim);
    ok("X e Y iguais (flange redonda)", perto(cx.dim[0], cx.dim[1], cx.dim[0] * 0.01), cx.dim);
    // escala por UMA medida conhecida: o diâmetro externo medido com paquímetro = 100 mm
    const medida = S.scnEscalaPorEixo(reto, 0, 100);
    const cm = S.scnCaixa(medida);
    ok("depois da escala: 100 x 100 x 12", perto(cm.dim[0], 100, 0.2) && perto(cm.dim[1], 100, 0.2) && perto(cm.dim[2], 12, 0.1), cm.dim);

    const cil = S.scnCilindros(medida);
    console.log("   cilindros:", cil.map((c) => `${c.furo ? "furo" : "ext"} ⌀${c.diametro.toFixed(2)} @(${c.centro.map((v) => v.toFixed(1))}) eixo ${c.eixo} ${c.de.toFixed(1)}→${c.ate.toFixed(1)}`).join(" | "));
    ok("diâmetro externo ⌀100 achado", achou(cil, 100, false, 0.3).length === 1);
    ok("furo central ⌀30 achado", achou(cil, 30, true, 0.2).length === 1);
    ok("4 furos ⌀10 achados", achou(cil, 10, true, 0.15).length === 4, achou(cil, 10, true, 0.15).length);
    const f10 = achou(cil, 10, true, 0.15), cen = achou(cil, 30, true, 0.2)[0];
    if (cen && f10.length === 4) ok("os 4 furos estão no círculo ⌀70 em torno do furo central", f10.every((f) => perto(Math.hypot(f.centro[0] - cen.centro[0], f.centro[1] - cen.centro[1]), 35, 0.2)));
    ok("furo atravessa toda a espessura (12 mm)", cen && perto(cen.ate - cen.de, 12, 0.2), cen && [cen.de, cen.ate]);

    const vs = ["frontal", "superior", "lateral"].map((n) => [n, S.scnVista(medida, n)]);
    vs.forEach(([n, v]) => console.log(`   vista ${n}: ${v.visiveis.length} visíveis, ${v.ocultas.length} ocultas, caixa ${(v.caixa.u1 - v.caixa.u0).toFixed(1)} x ${(v.caixa.v1 - v.caixa.v0).toFixed(1)}`));
    const fr = vs[0][1], sup = vs[1][1];
    ok("frontal tem 100 x 12", perto(fr.caixa.u1 - fr.caixa.u0, 100, 0.3) && perto(fr.caixa.v1 - fr.caixa.v0, 12, 0.2));
    ok("superior tem 100 x 100", perto(sup.caixa.u1 - sup.caixa.u0, 100, 0.3) && perto(sup.caixa.v1 - sup.caixa.v0, 100, 0.3));
    ok("frontal: os furos aparecem como linhas OCULTAS", fr.ocultas.length >= 5, fr.ocultas.length);
    ok("superior: os furos aparecem como linhas VISÍVEIS (círculos)", sup.visiveis.length >= 10, sup.visiveis.length);
    ok("frontal sem linhas ocultas soltas fora da caixa", fr.ocultas.every((s) => s[0] >= fr.caixa.u0 - 0.5 && s[2] <= fr.caixa.u1 + 0.5));

    console.log("BLOCO: 60 x 40 x 20 com furo passante ⌀12 em Y e rebaixo");
    let bl = Manifold.cube([60, 40, 20]);
    bl = bl.subtract(Manifold.cylinder(60, 6, 6, 64).rotate([90, 0, 0]).translate([30, 50, 10]));
    bl = bl.subtract(Manifold.cube([20, 40, 8]).translate([40, 0, 12]));
    const b0 = doManifold(bl);
    const b1 = S.scnEndireita(torta(b0, [0.3, 1, -0.7], 2.1, 0.02, [1, 2, 3]));
    // a escala vem de uma medida: a dimensão do meio (40 mm) medida com paquímetro, qualquer que seja o eixo em que caiu
    const dm = S.scnCaixa(b1).dim, meio = [0, 1, 2].sort((a, b) => dm[a] - dm[b])[1];
    const b2 = S.scnEscalaPorEixo(b1, meio, 40);
    const bc = S.scnCaixa(b2).dim.slice().sort((a, b) => a - b);
    ok("bloco volta com 20 x 40 x 60 (em alguma ordem)", perto(bc[0], 20, 0.3) && perto(bc[1], 40, 0.3) && perto(bc[2], 60, 0.3), bc);
    const bcil = S.scnCilindros(b2);
    ok("furo ⌀12 achado no bloco", achou(bcil, 12, true, 0.2).length === 1, bcil.map((c) => c.diametro.toFixed(1)));

    console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo certo");
    process.exit(falhas ? 1 : 0);
})();
