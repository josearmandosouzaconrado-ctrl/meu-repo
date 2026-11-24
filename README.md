# Rota Carioca

Jogo de ação em mundo aberto, visto de cima em 3D, ambientado numa cidade inspirada no Rio de Janeiro. Feito para celular (controles de toque) e também funciona no computador (teclado).

Tudo está num único arquivo: `index.html`. O motor 3D é o Three.js (carregado do cdnjs); modelos, texturas, efeitos sonoros e as músicas das rádios são gerados por código, sem arquivos externos.

## Como jogar

- **Celular:** abra o `index.html` no navegador do celular (ou publique no GitHub Pages, veja abaixo).
- **Computador:** abra o `index.html` no Chrome, Edge ou Firefox.

### Controles de toque
| Controle | Ação |
| --- | --- |
| Metade esquerda da tela | Direcional: andar ou dirigir |
| Atirar | Atira com mira automática (no carro vira buzina) |
| Entrar / Sair | Rouba um veículo próximo ou sai dele |
| Correr | Corre a pé (no carro vira freio de mão para derrapar) |
| Arma | Troca de arma |
| Rádio | Troca a estação |
| Táxi | Começa o bico de taxista (aparece dentro de um táxi) |

### Teclado
WASD ou setas: mover · Shift: correr · Espaço: atirar / freio de mão · F ou E: entrar e sair · Q: arma · R: rádio · T: táxi · H: buzina · M: mapa · Esc: pausa

## Sistemas do jogo

- **Cidade 10×10 quarteirões**: centro com prédios, bairros, favela no morro com becos e casas coloridas, orla com calçadão de ondas, praia, guarda-sóis, quiosques e mar; morros ao redor com a estátua no alto.
- **Trânsito com IA**: carros populares, sedãs, táxis, picapes, motos, ônibus, esportivos e viaturas seguindo faixas, virando em cruzamentos e freando para pedestres.
- **Pedestres** que andam pelas calçadas, atravessam ruas, fogem de tiros e podem ser atropelados.
- **Veículos com física arcade**: aceleração, ré, derrapagem com freio de mão, areia deixa mais lento, dano na lataria, fumaça, fogo e explosão. Carro que cai no mar afunda.
- **Combate**: soco, pistola, escopeta e submetralhadora com mira automática; colete à prova de balas.
- **Nível de procurado (5 estrelas)**: viaturas perseguem, policiais descem e atiram, helicóptero com holofote no nível 5. Fique longe da polícia para as estrelas sumirem, ou pinte o carro no lava-jato.
- **Morte e prisão**: "Você apagou" leva ao hospital; "Foi em cana" leva à delegacia. As duas custam dinheiro.
- **5 missões de história** com o Zeca, a Dona Cida, o Tião e a Dandara.
- **Bicos**: corridas de táxi, entregas de açaí e racha contra o relógio.
- **Lojas**: lanchonete (cura), Armaria do Bigode (armas, munição, colete), lava-jato (tira estrelas, conserta e pinta), hospital e a oficina do Zeca (salva o jogo e dorme).
- **15 figurinhas douradas** escondidas pela cidade.
- **Ciclo de dia e noite** com janelas acesas, postes e faróis.
- **3 rádios sintetizadas**: Samba Raiz FM, Baile FM 150 e Bossa Mar.
- **Minimapa, mapa completo com GPS** (toque para marcar destino) e seta apontando o objetivo.
- **Salvamento automático** no navegador e configurações de qualidade, sombras e volume.

## Publicar no GitHub Pages

1. No GitHub, abra **Settings → Pages**.
2. Em **Source**, escolha a branch e a pasta `/ (root)`.
3. Depois de alguns minutos o jogo fica disponível em `https://<seu-usuario>.github.io/meu-repo/`. Abra esse link no celular e use "Adicionar à tela inicial" para jogar em tela cheia.
