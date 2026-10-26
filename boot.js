// Let the menu paint before building and compiling the 3D world.
import { initPreferences, initDialogNavigation } from './preferences.js?v19';
initPreferences();
initDialogNavigation();
const start = document.getElementById('startBtn');
const status = document.getElementById('loadStatus');
if (start) start.disabled = true;
if (status) status.textContent = 'Preparing your island…';
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
try {
  const game = await import('./main.js?v20');
  document.body.dataset.ready = 'true';
  if (start) start.disabled = !game.canStartGame();
  if (status) status.textContent = 'Systems ready · Your island awaits';
} catch (error) {
  console.error('Could not start the game:', error);
  document.body.dataset.ready = 'error';
  if (status) {
    status.setAttribute('role', 'alert');
    status.textContent = 'The island could not load. Enable WebGL / hardware acceleration in your browser, then reload.';
  }
  if (start) {
    start.disabled = false;
    start.textContent = 'Reload game';
    start.onclick = () => location.reload();
  }
}
