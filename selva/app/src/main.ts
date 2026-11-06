import { GameSocket, hasLocalSave } from "./net/GameSocket";
import { WorldApp } from "./world/WorldApp";
import { showToast } from "./ui/hud";

/** One private journey on this device; no account, remote room or wallet. */
function storedName(): string {
  try { return (localStorage.getItem("selva_display_name") || "").trim().slice(0, 24) || "Wanderer"; }
  catch { return "Wanderer"; }
}

function enterJourney(): Promise<string> {
  const veil = document.getElementById("boot-veil");
  const button = document.getElementById("btn-enter-wood") as HTMLButtonElement;
  const input = document.getElementById("boot-name") as HTMLInputElement;
  const saved = hasLocalSave();
  veil?.classList.add("await-enter");
  veil?.setAttribute("aria-hidden", "false");
  button.hidden = false;
  button.textContent = saved ? "Continue journey" : "Start single-player journey";
  input.hidden = false;
  input.value = storedName();
  const wrap = veil?.querySelector<HTMLElement>(".boot-name-wrap");
  if (wrap) wrap.hidden = false;
  const hint = veil?.querySelector<HTMLElement>(".boot-hint");
  if (hint) {
    hint.hidden = false;
    hint.textContent = saved
      ? "Your character and gear are saved on this device. The Auction House has fresh stock each launch."
      : "Explore, fight and collect gear at your pace. Your progress saves on this device. No account needed.";
  }
  return new Promise(resolve => {
    let entered = false;
    const enter = () => {
      if (entered) return;
      entered = true;
      const name = input.value.trim().slice(0, 24) || "Wanderer";
      try { localStorage.setItem("selva_display_name", name); } catch { /* storage may be unavailable */ }
      button.disabled = true;
      button.textContent = "Preparing your journey…";
      input.disabled = true;
      veil?.classList.remove("await-enter");
      resolve(name);
    };
    button.addEventListener("click", enter, { once: true });
    input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); enter(); } });
  });
}

document.body.classList.add("single-player");

async function boot() {
  const name = await enterJourney();
  const socket = new GameSocket("local", name);
  const root = document.getElementById("game-root");
  if (!root) throw new Error("#game-root missing");
  const app = new WorldApp(root, socket);
  socket.on(msg => {
    if (msg.type === "welcome") showToast("Single player · progress saved on this device", "info");
  });
  // Register scene listeners and finish loading before the local simulation runs.
  await app.start();
  await socket.connect();
  document.body.dataset.ready = "true";
  if (new URLSearchParams(location.search).get("debug") === "1") {
    (window as any).__selva = { app, socket, get local() { return (socket as any).local; } };
    (window as any).__selvaTravel = (canto: string) => socket.travel(canto, { bypassGates: true });
  }
}

void boot().catch(error => {
  console.error("Selva could not start", error);
  const veil = document.getElementById("boot-veil");
  veil?.classList.remove("out", "await-enter");
  const hint = veil?.querySelector<HTMLElement>(".boot-hint");
  if (hint) { hint.hidden = false; hint.textContent = "The journey could not start. Reload to try again."; }
  const button = document.getElementById("btn-enter-wood") as HTMLButtonElement;
  button.disabled = false; button.hidden = false; button.textContent = "Reload game";
  button.onclick = () => location.reload();
});

window.addEventListener("touchmove", event => {
  const target = event.target as HTMLElement | null;
  if (target?.closest?.("#panels, .panel, input, #boot-veil, .pvp-menu")) return;
  event.preventDefault();
}, { passive: false });
document.addEventListener("gesturestart", event => event.preventDefault(), { passive: false });
