/**
 * Intro logo reveal (≈1.3 s, CSS-driven). Never blocks input: the overlay has pointer-events:none,
 * any key / click skips it, and it removes itself on a timer so the title is interactive well before 2 s.
 */
export function runSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const body = document.body;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.remove(); return; }
  body.classList.add('splash-on');
  let done = false;
  const finish = (fast) => {
    if (done) return;
    done = true;
    el.classList.add(fast ? 'skip' : 'out');
    body.classList.remove('splash-on');
    window.removeEventListener('keydown', skip, true);
    window.removeEventListener('pointerdown', skip, true);
    setTimeout(() => el.remove(), fast ? 220 : 420);
  };
  const skip = () => finish(true);
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);
  // ≈1.3 s after navigation start in total (init time counts), but always a short beat once the game is ready
  const left = Math.max(320, Math.min(1150, 1300 - performance.now()));
  setTimeout(() => finish(false), left);
  // title entrance is choreographed to land as the splash fades; the delay is dropped once it has played
  const title = document.getElementById('screen-title');
  if (title) {
    title.style.setProperty('--d', `${Math.max(0, left - 280)}ms`);
    setTimeout(() => title.style.removeProperty('--d'), left + 1600);
  }
}
