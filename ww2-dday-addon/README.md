# WW2 D-Day: Paraquedistas — Addon para Minecraft Bedrock

**Normandia, 6 de junho de 1944, 01:15.** Na primeira vez que você entra no mundo, em vez de nascer no chão
normalmente, você acorda **dentro de um C-47 Skytrain da 101ª Divisão Aerotransportada**, com o seu pelotão
de paraquedistas controlados por IA. Cada um salta pela porta, e você é o último da fila.

## Como instalar (Android / APK, iOS, Windows)

1. Baixe o arquivo **`dist/WW2_DDay_Paraquedistas.mcaddon`**.
2. Toque no arquivo e escolha abrir com o **Minecraft**. O jogo importa os dois pacotes sozinho.
   - Se o Android não oferecer "Abrir com Minecraft", renomeie a extensão para `.zip`, extraia e copie as pastas
     `WW2_DDay_BP` para `games/com.mojang/behavior_packs` e `WW2_DDay_RP` para `games/com.mojang/resource_packs`.
3. Crie um **mundo novo**. Em *Pacotes de Comportamento*, ative **WW2 D-Day: Paraquedistas**. O pacote de recursos
   é ativado junto.
4. Não precisa ativar nenhum experimento. Requer Minecraft **1.21.50 ou mais novo**.
5. Entre no mundo e a cena começa.

## O que acontece

**No avião**
- Interior completo, construído em blocos: bancos de alumínio dos dois lados, cabo de linha estática, janelas,
  luzes de salto vermelha e verde ao lado da porta, fardos de equipamento e cabine com piloto e copiloto.
- Abertura cinematográfica com câmera externa mostrando a formação e o fogo antiaéreo.
- 12 paraquedistas de IA conversam durante o voo. O mestre de salto dá os comandos reais de um salto:
  *luz vermelha → "De pé!" → "Enganchem!" → "Verifiquem o equipamento!" → contagem "13 OK… 1 OK" →
  "Fiquem na porta!" → luz verde → "VAI! VAI! VAI!"*.
- Os soldados se levantam, fazem fila no corredor e saltam um a um. Por último, é a sua vez.
- O avião treme, você ouve os motores e o vento, e nuvens passam pela janela.

**No céu**
- Vários outros C-47 da formação lançam paraquedistas ao mesmo tempo. Um deles solta fumaça de um motor atingido.
- As baterias **Flak 38** alemãs no solo disparam traçantes. As granadas explodem em nuvens pretas perto dos aviões.
- O seu paraquedas abre sozinho (linha estática). **Olhe para onde quer ir para planar nessa direção.**

**No solo: duas IAs de comando**
- **QG da 101ª (IA americana):** organiza os esquadrões Able, Baker, Charlie e Dog e distribui as baterias AA
  entre eles. Se um esquadrão for fraco demais para o número de defensores, a IA combina um **ataque coordenado**
  com outro esquadrão e espera os dois chegarem. Esquadrões quase destruídos se juntam a outros. Um engenheiro
  planta explosivos quando a bateria fica sem defensores.
- **Comando alemão (IA inimiga):** guarnições defendem cada Flak e patrulhas são enviadas para a bateria ameaçada.
  Chegam reforços pelo lado oposto às suas tropas. Soldados muito feridos recuam. Depois que todas as baterias
  caem, vem um **contra-ataque**. As conversas de rádio alemãs são interceptadas e traduzidas no chat.
- Cada soldado tem a sua máquina de estados: avança até o ponto de reunião do esquadrão, entra em combate
  quando vê o inimigo, avisa "Contato! Alemães a nordeste, 15 metros!", pede médico e se recupera fora de combate.
- Placar lateral: baterias AA restantes, paraquedistas, alemães e reforços aéreos.

## Seus itens

| Item | Uso |
|---|---|
| **Thompson M1A1**, **BAR**, **StG 44** | Automáticas: segure para atirar em rajada |
| **M1 Garand** (com o "ping" do clipe vazio), **Kar98k** | Um toque = um tiro |
| Agachado + usar a arma | Recarrega (a recarga também é automática quando acaba a munição) |
| **Rádio SCR-536** | Ordens para o seu pelotão: siga-me, manter posição, atacar onde estou mirando, atacar a bateria mais próxima, reagrupar a divisão, ataque geral, **pedir reforço aéreo (C-47)** e relatório |
| **Carga Explosiva** | Use a até 5 blocos de um Flak 38 para destruí-lo (5 segundos) |
| **Kit Médico** | Recupera 5 corações |

Os alemães às vezes deixam cair uma StG 44, uma Kar98k, kits médicos ou explosivos.
Os modelos 3D do M1 Garand, Thompson, BAR e StG 44 vêm do pacote enviado (`ww2-weapons.zip`), convertidos
para o formato do Bedrock.

## Comandos (com cheats ativados)

- `/scriptevent ww2:intro`: saltar de novo do avião
- `/scriptevent ww2:battle`: criar uma batalha onde você está
- `/scriptevent ww2:reset`: apagar a batalha atual

Também há ovos de geração do Paraquedista dos EUA, do Soldado Alemão e do Flak 38 no inventário criativo.
Soldados colocados com ovo entram na batalha automaticamente.

## Desempenho em celular

No topo de `scripts/config.js` (dentro do pacote de comportamento) dá para reduzir `AI_STICK`,
`DROPS_PER_PLANE`, `FORMATION`, `GERMAN_CAP` etc. se o aparelho ficar lento.

## Para desenvolvedores

```
python3 tools/build.py        # gera build/ e dist/WW2_DDay_Paraquedistas.mcaddon
node tools/sim/run-sim.mjs    # roda o addon inteiro em um simulador da API (intro → salto → batalha → vitória)
python3 tools/preview.py out  # renderiza prévias dos modelos
```

- `tools/voxelize.py` converte o OBJ das armas em cubos do Bedrock.
- `tools/plane_layout.py` define o C-47 em blocos, a mesma planta usada no modelo de entidade.
- `tools/art.py` e `tools/sfx.py` geram as texturas e os sons proceduralmente.
- `src/scripts/` guarda os scripts (`@minecraft/server` 1.16.0 e `@minecraft/server-ui` 1.3.0).

Limitações: o simulador testa a lógica dos scripts, não o motor do jogo. A IA é tática e feita com scripts e
componentes do Bedrock, não um modelo de linguagem; o Bedrock não permite IA conversacional de verdade dentro
de um addon.
