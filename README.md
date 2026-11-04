# Scanner — Pulo do Gato

Página de teste: câmera ou malha (STL/OBJ/PLY) → peça endireitada → escala por uma medida → 3 vistas com cotas → diâmetros.

Abra a página, use "Peça de exemplo" ou carregue uma malha. A câmera só abre em https.
A reconstrução dos quadros da câmera em 3D ainda não existe.

## Toque e recorte (teste)

`segmenta.html`: escolhe uma foto, toca na peça e o modelo SlimSAM (roda no celular, via transformers.js) devolve o contorno. Toque em outro ponto para corrigir; o botão "Toque = NÃO é a peça" tira regiões. O modelo é baixado uma vez e fica guardado no navegador.
