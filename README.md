# Ônibus Rio 3D 🚌

Jogo de ônibus 3D para celular (Android / APK) ambientado no **Rio de Janeiro** e na sua **zona rural**,
feito com os pacotes enviados:

- **Marcopolo Torino VW 17-230** (modelo 3D e texturas — FKN Modelagens) → ônibus jogável
  (convertido de 400 mil para ~60 mil triângulos, com as texturas originais, faróis acesos à noite,
  letreiro de LED com o nome da linha e pinturas na garagem).
- **Pack de Ruas by LW3D Mods e Edits** → todas as ruas do mapa: rua com faixa amarela, rua com faixa branca,
  paralelepípedo, corredor BRT e faixa de pedestre perto dos cruzamentos.

## Mapa (≈ 8 × 8 km, 92 km de vias)

| Região | O que tem |
|---|---|
| Centro | Prédios altos, semáforos, Lapa com paralelepípedo e Arcos da Lapa |
| Zona Norte | Casas coloridas com telhado, Maracanã, morro com favela |
| Túnel Rebouças | Túnel iluminado atravessando o Maciço da Tijuca (Cristo Redentor no Corcovado) |
| Zona Sul | Copacabana / Ipanema / Leblon, orla com calçadão de ondas, praia, quiosques e palmeiras, Lagoa |
| Aterro do Flamengo | Parque à beira da baía com vista para o Pão de Açúcar (com bondinho) |
| Barra da Tijuca | Av. das Américas com corredor BRT, condomínios, orla |
| Av. Brasil / Linha Amarela | Vias expressas ligando as zonas |
| Zona Rural | Estradas de terra, serras, fazendas com gado, bananeiras, eucaliptos e a Vila Santa Rita (igreja e paralelepípedo) |

## Linhas

`474` Jacaré ⇄ Copacabana · `133` Central ⇄ Leblon · `LA1` Barra ⇄ Méier · `870` Vila Santa Rita ⇄ Campo Grande (rural) ·
`872` Vila Santa Rita ⇄ Guaratiba (rural) · `100` Central ⇄ Campo Grande (Av. Brasil) · **Modo Livre**.

Pare no ponto (faixa amarela no chão), abra as portas 🚪, espere os passageiros (R$ 4,70 cada), feche as portas e siga.
Pular ponto, bater e avançar sinal vermelho geram multa. O dinheiro compra pinturas novas na garagem.

## Controles

- **Celular:** volante na tela (ou botões ◄ ►, ou inclinar o celular), pedais ACEL/FREIO, botões de câmera, portas,
  buzina, farol e marcha (D/R). Arraste na tela para girar a câmera.
- **Teclado:** W/S ou setas (acelerar/frear), A/D (direção), E portas, H buzina, C câmera, L farol, R ré, P pausa.

## Como obter o APK

O APK é compilado automaticamente pelo **GitHub Actions** a cada push
(workflow `.github/workflows/android-apk.yml`). Baixe em **Releases** (`OnibusRio3D.apk`) ou nos artefatos da execução
em **Actions**. No celular, permita instalar de "fontes desconhecidas".

### Compilar localmente

```bash
npm install
npm run build            # gera dist/
npx cap sync android     # copia para o projeto Android
cd android && ./gradlew assembleDebug   # precisa do Android SDK (JDK 17)
# APK em android/app/build/outputs/apk/debug/app-debug.apk
```

Para testar no navegador: `npm run dev`.

## Estrutura

- `src/map.js` — malha viária, zonas, relevo, água, linhas e rotas (Dijkstra)
- `src/roads.js` — malha 3D das ruas com as texturas LW3D, cruzamentos, calçadão, túnel
- `src/scenery.js` — terreno, prédios, árvores, pontos turísticos, fazendas, colisões
- `src/bus.js` — ônibus Torino (física, pintura, letreiro, faróis)
- `src/traffic.js` — carros com IA e semáforos
- `src/route.js` — pontos de ônibus, passageiros e pontuação
- `src/main.js` — menu, HUD, controles de toque, câmeras, minimapa, dia/noite, salvamento
- `tools/` — scripts que converteram os pacotes (OBJ → GLB, texturas, ícones)
