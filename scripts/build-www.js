// Monta a pasta www/ usada pelo app Android: o jogo com o three.js local (funciona sem internet).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
if (!html.includes(cdn)) throw new Error('URL do three.js não encontrada no index.html');
html = html.replace(cdn, 'three.min.js');
fs.writeFileSync(path.join(www, 'index.html'), html);
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.min.js'), path.join(www, 'three.min.js'));
for (const f of ['manifest.webmanifest', 'icon.svg']) fs.copyFileSync(path.join(root, f), path.join(www, f));
console.log('www pronto');
