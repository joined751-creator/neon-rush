/**
 * v4.0 additions to the menus: "New in 4.0" banner on the title (replaces the tagline), the "5 tracks" badge,
 * five track cards in one row and the "Новая" badge style. Injected at runtime so markup/stylesheet stay as in v3.
 */
const CSS = `

/* v4.0: "new" banner on the title (replaces the tagline) + badge on the new track card */
#screen-title .tagline { display: none; }
.new-banner { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 12px; margin: 14px 0 4px; padding: 10px 14px;
  max-width: 460px; border-radius: 10px; position: relative; overflow: hidden;
  background: linear-gradient(100deg, rgba(57,255,136,0.14), rgba(138,92,255,0.22)); border: 1px solid rgba(138,92,255,0.6);
  box-shadow: 0 0 24px rgba(138,92,255,0.35), inset 0 0 18px rgba(57,255,136,0.08); animation: fadeUp 0.6s var(--ease) both, nbGlow 2.6s ease-in-out infinite; }
.new-banner::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%); transform: translateX(-100%); animation: nbShine 3.6s ease-in-out infinite; pointer-events: none; }
.new-banner:hover, .new-banner:focus-visible { border-color: #39ff88; }
.nb-tag { flex: none; font-family: var(--f-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #07040f; background: linear-gradient(90deg, #39ff88, #8a5cff); padding: 4px 7px; border-radius: 4px; }
.nb-t { display: flex; flex-direction: column; gap: 2px; font-weight: 700; font-size: 14px; color: #fff; line-height: 1.25; }
.nb-t small { font-weight: 400; font-size: 12px; color: var(--muted); }
.new-banner .mbtn-go { margin-left: auto; flex: none; }
@keyframes nbGlow { 50% { box-shadow: 0 0 34px rgba(57,255,136,0.35), inset 0 0 18px rgba(138,92,255,0.12); } }
@keyframes nbShine { 60%, 100% { transform: translateX(100%); } }
.tc-new { padding: 1px 6px; border-radius: 3px; color: #07040f; font-weight: 700; background: linear-gradient(90deg, #39ff88, #8a5cff); animation: nbGlow 2.6s ease-in-out infinite; white-space: nowrap; }
@media (max-width: 900px), (max-height: 520px) {
  .new-banner { margin: 8px 0 2px; padding: 7px 10px; gap: 8px; }
  .nb-t { font-size: 12px; }
  .nb-t small { display: none; }
}
.new-banner .mbtn-go { opacity: 1; transform: rotate(45deg); color: #39ff88; margin-right: 6px; }
/* five tracks in one row (wider screens and landscape phones) */
@media (min-width: 640px) {
  .cards.tracks { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .cards.tracks .tc-top { gap: 5px; letter-spacing: 0.06em; }
  .cards.tracks .tc-len { margin-left: auto; }
}
@media (min-width: 640px) and (max-width: 1100px) {
  .cards.tracks .tc-theme { display: none; }
}
`;

export function installV4UI() {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const tag = document.querySelector('#screen-title .tagline');
  if (tag && !document.querySelector('.new-banner')) {
    tag.insertAdjacentHTML('afterend', '<button class="new-banner" data-action="tryNew"><span class="nb-tag">Новое в 4.0</span>'
      + '<span class="nb-t">Трасса «Орбита» — гонка в открытом космосе<small>Невесомость, два трамплина, кольца-порталы и планета над головой</small></span>'
      + '<i class="mbtn-go"></i></button>');
  }
  const row = document.querySelector('.title-badge .badge-row');
  if (row) row.innerHTML = '<b>5</b><span>трасс</span>';
}
