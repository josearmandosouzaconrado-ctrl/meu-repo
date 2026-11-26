// Registro compartilhado entre módulos (evita imports circulares).
export const HUB = {
  intro: null,   // API de intro.js
  air: null,     // API de air.js
  battle: null,  // API de battle.js
};
