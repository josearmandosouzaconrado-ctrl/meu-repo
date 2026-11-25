# Contra-Encosta

Jogo de estratégia em tempo real para celular, feito em HTML5 (um único arquivo, sem instalar nada).
Inspirado no gênero dos RTS táticos modernos em que os soldados leem o terreno sozinhos.

Gráficos em 3D (WebGL com three.js, carregado de um CDN, então precisa de internet na primeira abertura):
relevo de verdade, sombras longas do sol, explosões com fogo, fumaça e poeira, e três mapas:
**Inverno** (neve, trincheiras já cavadas, ouriços antitanque), **Deserto** (casas de adobe com laje,
muros de pátio, palmeiras) e **Outono**.

Mapa gigante de 192×192 tiles com 17 depósitos, várias vilas, estradas e florestas.

### Modo Sandbox
Escolha **Sandbox** no menu: recursos infinitos (∞), produção e construção quase instantâneas,
até 300 tropas por lado e nenhuma derrota. Botões extras:
- **Criar:** escolha lado (aliado ou inimigo), tipo de unidade e quantidade (1, 5, 10 ou 25) e toque no mapa.
- **Artilharia:** toque no mapa para uma salva de 5 granadas que atinge todo mundo.
- **IA inimiga:** liga ou desliga a IA que constrói e ataca.

## Baixar o APK (Android)

A cada atualização, o GitHub Actions gera o app e publica em **Releases** deste repositório
(arquivo `ContraEncosta.apk`). No celular: abra a página de Releases, baixe o APK e toque nele para instalar.
Se o Android pedir, permita instalar apps de "fontes desconhecidas" para o navegador.
O app abre sempre com a tela deitada, em tela cheia, e funciona sem internet.

Para gerar de novo manualmente: aba **Actions** → **Gerar APK** → **Run workflow**.

## Como jogar

Abra `index.html` no navegador do celular, deite o aparelho e toque em **Jogar**.
Dá para instalar na tela inicial pelo menu do navegador ("Adicionar à tela inicial").

| Gesto | Ação |
| --- | --- |
| Tocar numa tropa | Seleciona (dois toques: todas do mesmo tipo) |
| Segurar e arrastar | Seleciona uma área |
| Tocar no chão | Move. Cada soldado procura cobertura sozinho |
| Tocar num inimigo | Ataca |
| Um dedo arrastando | Move a câmera |
| Dois dedos | Zoom (afaste bastante para ver o mapa inteiro) |

## Mecânicas

- **Cobertura automática:** muros, casas, árvores, escombros, trincheiras e sacos de areia reduzem dano e chance de acerto, e cada um protege só do lado de onde vem o tiro.
- **Contra-encosta:** o relevo bloqueia a linha de visão. Atrás de um morro suas tropas ficam fora da vista do inimigo (curvas de nível no mapa).
- **Supressão:** tiros, mesmo errando, deixam a tropa deitada, mais lenta e menos precisa.
- **Granadas:** fuzileiros jogam granadas em quem está protegido. Quem vê a granada pode saltar para o lado.
- **Feridos:** soldados caídos podem ser resgatados por um Socorrista antes do tempo acabar.
- **Trincheiras:** a infantaria parada pode cavar.
- **Linha de suprimento:** depósitos só rendem se estiverem ligados ao QG (QG → depósitos → caminhões). Fora da linha, as tropas não recebem munição.
- **Casas:** a infantaria entra nas casas (até 6 por casa), atira pelas janelas e fica bem protegida. Aproxime o zoom para ver o interior com os soldados. Se a casa cair, quem está dentro se fere.
- **Defesas para construir:** torre de vigia (enxerga longe), bunker de concreto (até 4 soldados, proteção máxima), sacos de areia, arame farpado (atrasa a infantaria; o tanque esmaga), ouriço antitanque e mina antitanque (invisível para o inimigo).
- **Trincheiras cavadas:** buraco de verdade no chão com paredes de tábuas, estrado e sacos de areia.
- **Destruição:** casas e construções viram escombros. O blindado passa por cima de muros e árvores.
- **Unidades:** Fuzileiro, Metralhadora, Antitanque, Socorrista, Caminhão, Blindado, Helicóptero e Drone FPV.
- **Base:** QG, Quartel, Fábrica, Oficina de drones, Heliponto e sacos de areia.
- **IA** em três dificuldades (Recruta, Sargento, Comando). Vence quem destruir o QG inimigo.

Abrir com `#auto` no fim do endereço coloca a IA para jogar pelos dois lados (modo de teste).

## Créditos

- Modelo do soldado: "Military RTS Character" (licença CC0, domínio público). Usado com malhas LOD2/LOD3, textura com AO aplicada, esqueleto e poses gerados por código.
- Tanque inimigo: modelo T-90 enviado pelo usuário (arquivo original em `assets/t90`), simplificado de 304 mil para cerca de 6,7 mil triângulos com [meshoptimizer](https://github.com/zeux/meshoptimizer), com a torre separada do casco.
- Tanque do jogador: modelo M1 Abrams enviado pelo usuário (arquivos originais em `assets/abrams`), exportado do Blender e simplificado de 45 mil para cerca de 6,9 mil triângulos; a versão destruída vira a carcaça que fica no chão.
- Blindado de transporte: modelo "Stryker ICV (US Army) WARNO mod" por rran81 (Sketchfab, licença padrão do Sketchfab), enviado pelo usuário (arquivo original em `assets/stryker`), simplificado no Blender de 46 mil para cerca de 6,1 mil triângulos, com a torre da metralhadora separada e as cores da textura passadas para os vértices.
- Fuzil dos fuzileiros: Colt M4A1 low poly enviado pelo usuário (arquivo original em `assets/m4a1`), simplificado de 7,8 mil para cerca de 600 triângulos.
- Sons de fuzil, metralhadora e canhão: gravações enviadas pelo usuário (originais em `assets/sounds`), recortadas em tiros e rajadas; explosões, granadas e foguetes são sintetizados.
- Motor 3D: [three.js](https://threejs.org) (MIT).
