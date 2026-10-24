// Small, browser-local comfort controls shared by mouse and touch input.
const saved = key => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const clampSensitivity = value => Number.isFinite(value) ? Math.min(1.75, Math.max(.5, value)) : 1;
const storedSensitivity = saved('szSensitivity');
let sensitivity = storedSensitivity === null ? 1 : clampSensitivity(Number(storedSensitivity));
let motion = saved('szMotion') === 'reduced' ? 'reduced' : 'auto';
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const getLookSensitivity = () => sensitivity;
export const reducedMotion = () => motion === 'reduced' || systemMotion.matches;

export function initPreferences() {
  const slider = document.getElementById('lookSensitivity');
  const output = document.getElementById('lookSensitivityValue');
  const motionButton = document.getElementById('motionBtn');
  const sync = () => {
    if (slider) {
      slider.value = String(sensitivity);
      slider.setAttribute('aria-valuetext', `${sensitivity.toFixed(2)} times normal`);
    }
    if (output) output.textContent = `${sensitivity.toFixed(2)}×`;
    if (motionButton) {
      motionButton.textContent = `MOTION: ${motion.toUpperCase()}`;
      motionButton.setAttribute('aria-pressed', String(motion === 'reduced'));
    }
    document.body.classList.toggle('reduced-motion', reducedMotion());
  };
  slider?.addEventListener('input', () => { sensitivity = clampSensitivity(Number(slider.value)); sync(); });
  slider?.addEventListener('change', () => save('szSensitivity', String(sensitivity)));
  motionButton?.addEventListener('click', () => {
    motion = motion === 'auto' ? 'reduced' : 'auto';
    save('szMotion', motion);
    sync();
  });
  systemMotion.addEventListener?.('change', sync);
  sync();
}

// Keep keyboard navigation inside the currently open modal. This also handles
// settings replacing pause without keeping stale references to either dialog.
export function initDialogNavigation() {
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' && event.code !== 'Tab') return;
    const dialog = document.querySelector('[aria-modal="true"]:not(.hide)');
    if (!dialog) return;
    const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"]')]
      .filter(element => !element.disabled && !element.closest('[hidden], .hide') && element.getClientRects().length);
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement);
    if (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? controls.at(-1) : controls[0]).focus();
    }
  }, true);
}
