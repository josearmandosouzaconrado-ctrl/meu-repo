// =============================================================================
//  WW2 D-Day: Paraquedistas — configuração
//  (ajuste aqui se o celular ficar lento: diminua AI_STICK, DROPS_PER_PLANE etc.)
// =============================================================================
export const CFG = {
  PLANE_ALTITUDE: 78,        // blocos acima do solo
  AI_STICK: 12,              // paraquedistas de IA dentro do seu avião
  DROPS_PER_PLANE: 3,        // paraquedistas de IA por avião da formação
  // aviões da formação: deslocamento a partir do centro do seu avião (x = frente, z = direita)
  FORMATION: [
    { x: -26, y: 3, z: -26, drops: true },
    { x: 14, y: 6, z: -34, drops: true },
    { x: -24, y: 5, z: 28, drops: true },
    { x: -52, y: 9, z: -4, drops: true },
    { x: 22, y: 16, z: 40, drops: false, smoke: true },
    { x: -70, y: 18, z: -48, drops: false },
  ],
  FLAK_COUNT: 3,
  FLAK_CREW: 3,
  PATROLS: 2,
  PATROL_SIZE: 4,
  GERMAN_CAP: 26,
  REINFORCE_EVERY: 1500,     // ticks (75 s)
  REINFORCE_SIZE: 3,
  COUNTER_WAVE: 8,
  AIR_REINFORCEMENTS: 2,     // pedidos de reforço aéreo pelo rádio
  DAWN_TIME: 22900,          // hora do dia no início (madrugada)
};

// Timeline da cena do avião (ticks depois que o avião ficou pronto; 20 ticks = 1 s)
export const T = {
  CINE_END: 150,
  RED: 420,
  STAND: 480,
  HOOK: 540,
  CHECK: 600,
  COUNT: 650,
  DOOR: 780,
  GREEN: 840,
  JUMP_GAP: 22,
  PUSH_AFTER: 900,           // empurra o jogador se não pular em 45 s
};

export const SQUAD_NAMES = ['Easy', 'Able', 'Baker', 'Charlie', 'Dog', 'Fox', 'George', 'How'];
export const FLAK_NAMES = ['Norte', 'Leste', 'Oeste', 'Sul', 'Central'];

export const US_NAMES = [
  'Pvt. Miller', 'Pvt. Kowalski', 'Cpl. Rossi', 'Pvt. Johnson', "Sgt. O'Neill", 'Pvt. Garcia', 'Pvt. Walsh',
  'Cpl. Novak', 'Pvt. Bennett', 'Pvt. Sullivan', 'Pvt. Hughes', 'Pvt. Fischer', 'Pvt. Moreno', 'Cpl. Davis',
  'Pvt. Murphy', 'Pvt. Carter', 'Pvt. Brooks', 'Pvt. Hayes', 'Pvt. Lewis', 'Pvt. Parker', 'Pvt. Romano',
  'Pvt. Duval', 'Cpl. Hendricks', 'Pvt. Price', 'Pvt. Grady', 'Pvt. Kaminski', 'Pvt. Ortiz', 'Pvt. Becker',
  'Sgt. Holloway', 'Pvt. Marsh', 'Pvt. Quinn', 'Pvt. Vance', 'Pvt. Lindqvist', 'Pvt. Talbot', 'Pvt. Reyes',
];
export const DE_NAMES = [
  'Gefr. Weber', 'Schütze Becker', 'Obgefr. Hoffmann', 'Uffz. Schulz', 'Schütze Wagner', 'Schütze Krüger',
  'Gefr. Neumann', 'Schütze Braun', 'Uffz. Zimmermann', 'Schütze Hartmann', 'Gefr. Lange', 'Schütze Vogel',
  'Schütze Keller', 'Obgefr. Frank', 'Schütze Berger', 'Gefr. Roth', 'Schütze Sommer', 'Uffz. Kraus',
];
export const JUMPMASTER = 'Sgt. Whitaker';

export const CHATTER = [
  ['%a', 'Alguém sabe se a gente vai cair no lugar certo?'],
  ['%a', 'Minha mãe acha que eu tô descascando batata em Londres...'],
  ['%a', 'Se eu não voltar, fica com meu isqueiro, tá?'],
  ['%a', 'Olha esse fogo antiaéreo... parece 4 de julho.'],
  ['%a', 'Lembrem: um clique no grilo, resposta com dois cliques. Senha "Flash", contra-senha "Thunder".'],
  ['%a', 'Sargento, quanto tempo falta?'],
  ['%j', 'Calma, soldado. Quando a luz ficar verde, vocês vão saber.'],
  ['%a', 'O piloto tá desviando demais... segurem firme!'],
  ['%j', 'Saiam rápido da porta e contem: mil e um, mil e dois, mil e três... e olhem pro paraquedas!'],
  ['%a', 'Reza aí comigo, ninguém precisa saber.'],
  ['%a', 'Ninguém vomita no meu capacete de novo, ouviram?'],
  ['%a', 'Ei, olha os outros aviões lá fora... é a divisão inteira!'],
];

export const RADIO_DE = [
  ['Achtung! Fallschirmjäger!', 'Atenção! Paraquedistas!'],
  ['Verstärkung zur Flak-Stellung!', 'Reforços para a posição da Flak!'],
  ['Feuer frei auf die Flugzeuge!', 'Fogo à vontade nos aviões!'],
  ['Gegenangriff! Alle Mann vorwärts!', 'Contra-ataque! Todos avançar!'],
  ['Die Amerikaner sind überall!', 'Os americanos estão por toda parte!'],
];
