import { arcadeGames } from './catalog.js';
import { readArcadeSave } from './storage.js';

const grid = document.getElementById('arcade-grid');
const search = document.getElementById('arcade-search');
const count = document.getElementById('arcade-count');
const empty = document.getElementById('arcade-empty');
const filters = [...document.querySelectorAll('[data-arcade-filter]')];
const cards = [];
let category = 'All';

function textElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

for (const [index, game] of arcadeGames.entries()) {
  const card = document.createElement('a');
  card.className = 'arcade-card';
  card.dataset.arcadeGame = game.id;
  card.style.setProperty('--arcade-accent', game.accent || '#ffdc9d');
  card.style.setProperty('--arcade-background', game.background || '#263d45');

  const art = document.createElement('div');
  art.className = 'arcade-art';
  const img = document.createElement('img');
  img.src = `assets/arcade/${game.id}-960.webp`;
  img.srcset = `assets/arcade/${game.id}-480.webp 480w, assets/arcade/${game.id}-960.webp 960w`;
  img.sizes = '(max-width: 600px) calc((100vw - 54px) / 2), (max-width: 900px) calc((100vw - 72px) / 2), (max-width: 1100px) calc((100vw - 164px) / 3), (max-width: 1384px) calc((100vw - 182px) / 4), 300px';
  img.width = 960; img.height = 600; img.loading = 'lazy'; img.decoding = 'async';
  img.alt = `${game.title} game scene featuring ${game.hero}`;
  const tag = textElement('span', 'arcade-art-tag', `${String(index + 1).padStart(2, '0')} / ${game.category.toUpperCase()}`);
  const arrow = textElement('span', 'arcade-art-arrow', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  art.append(img, tag, arrow);

  const info = document.createElement('div'); info.className = 'arcade-info';
  const body = document.createElement('div');
  const hero = textElement('p', 'arcade-hero', `MEET ${game.hero.toUpperCase()}`);
  hero.id = `arcade-hero-${game.id}`;
  const title = textElement('h3', 'arcade-title', game.title);
  title.id = `arcade-game-${game.id}`;
  card.setAttribute('aria-labelledby', title.id);
  const description = textElement('p', 'arcade-description', game.tagline);
  description.id = `arcade-description-${game.id}`;
  card.setAttribute('aria-describedby', `${hero.id} ${description.id}`);
  const note = textElement('p', 'arcade-save-note', 'SAVED ON THIS DEVICE'); note.hidden = true;
  body.append(hero, title, description, note);
  const play = document.createElement('span'); play.className = 'arcade-play';
  const playLabel = textElement('span', '', 'PLAY GAME'); playLabel.dataset.arcadePlayLabel = '';
  const playArrow = textElement('span', '', '→'); playArrow.setAttribute('aria-hidden', 'true');
  play.append(playLabel, playArrow);
  info.append(body, play); card.append(art, info); grid.append(card);
  cards.push({ game, card, playLabel, note });
}
grid.setAttribute('aria-busy', 'false');

function refreshSaves() {
  for (const { game, card, playLabel, note } of cards) {
    const saved = readArcadeSave(game.id);
    const url = new URL('arcade.html', document.baseURI);
    url.searchParams.set('game', game.id);
    if (saved) url.searchParams.set('continue', '1');
    card.href = url.href;
    playLabel.textContent = saved ? 'CONTINUE GAME' : 'PLAY GAME';
    note.hidden = !saved;
  }
}
function applyFilters() {
  const needle = search.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const { game, card } of cards) {
    const haystack = `${game.title} ${game.hero} ${game.tagline} ${game.category}`.toLocaleLowerCase();
    const show = (category === 'All' || game.category === category) && (!needle || haystack.includes(needle));
    card.hidden = !show;
    if (show) visible++;
  }
  count.textContent = `${visible} ${visible === 1 ? 'GAME' : 'GAMES'} · ${visible ? 'READY TO PLAY' : 'TRY ANOTHER SEARCH'}`;
  empty.hidden = visible !== 0;
}
search.addEventListener('input', applyFilters);
for (const button of filters) button.addEventListener('click', () => {
  category = button.dataset.arcadeFilter;
  for (const item of filters) item.setAttribute('aria-pressed', String(item === button));
  applyFilters();
});
refreshSaves(); applyFilters();
addEventListener('pageshow', refreshSaves);
addEventListener('storage', refreshSaves);
