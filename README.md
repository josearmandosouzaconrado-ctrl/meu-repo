# Contra-Encosta

Jogo de estratégia em tempo real para celular, feito em HTML5 (um único arquivo, sem instalar nada).
Inspirado no gênero dos RTS táticos modernos em que os soldados leem o terreno sozinhos.

Gráficos em 3D (WebGL com three.js, carregado de um CDN, então precisa de internet na primeira abertura):
relevo de verdade, sombras longas do sol, explosões com fogo, fumaça e poeira, e três mapas:
**Inverno** (neve, trincheiras já cavadas, ouriços antitanque), **Deserto** (casas de adobe com laje,
muros de pátio, palmeiras) e **Outono**.

Mapa gigante de 128×128 tiles com 13 depósitos, várias vilas, estradas e florestas.

### Modo Sandbox
Escolha **Sandbox** no menu: recursos infinitos (∞), produção e construção quase instantâneas,
até 300 tropas por lado e nenhuma derrota. Botões extras:
- **Criar:** escolha lado (aliado ou inimigo), tipo de unidade e quantidade (1, 5, 10 ou 25) e toque no mapa.
- **Artilharia:** toque no mapa para uma salva de 5 granadas que atinge todo mundo.
- **IA inimiga:** liga ou desliga a IA que constrói e ataca.

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
- **Destruição:** casas e construções viram escombros. O blindado passa por cima de muros e árvores.
- **Unidades:** Fuzileiro, Metralhadora, Antitanque, Socorrista, Caminhão, Blindado, Helicóptero e Drone FPV.
- **Base:** QG, Quartel, Fábrica, Oficina de drones, Heliponto e sacos de areia.
- **IA** em três dificuldades (Recruta, Sargento, Comando). Vence quem destruir o QG inimigo.

Abrir com `#auto` no fim do endereço coloca a IA para jogar pelos dois lados (modo de teste).
