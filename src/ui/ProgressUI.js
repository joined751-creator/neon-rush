import { CAR, CAR_TYPES, CAR_COLORS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { CURRENCY, UPGRADES, MAX_LEVEL, COLOR_PRICE, LEGEND_REWARD, GLOWS } from '../core/Progress.js';

export const VERSION = 'v4.4';
import { UI_ICONS } from './Icons.js';

const $ = (sel, root = document) => root.querySelector(sel);
const money = (n) => `${Math.round(n).toLocaleString('ru-RU')} ${CURRENCY}`;

const CSS = `
.pr-cr { font-family: var(--f-mono); font-weight: 800; color: var(--gold); letter-spacing: 0.02em; white-space: nowrap; text-shadow: 0 0 12px rgba(255,212,0,0.45); }
.pr-panel { position: absolute; right: var(--gut, 40px); top: 50%; transform: translateY(-50%); width: 340px; padding: 16px 18px 14px; background: linear-gradient(160deg, rgba(20,10,40,0.82), rgba(8,5,18,0.9)); border: 1px solid var(--line-2); border-left: 3px solid var(--gold); border-radius: 6px; backdrop-filter: blur(6px); z-index: 2; animation: prIn 0.6s ease both 0.2s; }
@keyframes prIn { from { opacity: 0; transform: translate(20px, -50%); } to { opacity: 1; transform: translate(0, -50%); } }
.pr-panel .pr-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.pr-panel .pr-head span { font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); }
.pr-panel .pr-head .pr-cr { font-size: 20px; }
.pr-m { display: grid; grid-template-columns: 18px 1fr auto; gap: 4px 9px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.pr-m i { width: 14px; height: 14px; border: 2px solid var(--line-2); border-radius: 50%; }
.pr-m.done i { background: var(--green); border-color: var(--green); box-shadow: 0 0 10px var(--green); }
.pr-m .pr-t { font-size: 13px; font-weight: 600; line-height: 1.25; }
.pr-m.done .pr-t { color: var(--muted); text-decoration: line-through; }
.pr-m .pr-rw { font-family: var(--f-mono); font-size: 12px; color: var(--gold); }
.pr-m .pr-bar { grid-column: 2 / 4; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
.pr-m .pr-bar b { display: block; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--pink)); }
.pr-m.done .pr-bar b { background: var(--green); }
.pr-m .pr-n { grid-column: 2 / 4; font-family: var(--f-mono); font-size: 10px; color: var(--muted); margin-top: -2px; }
/* driver level */
.pr-lvl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; margin-bottom: 10px; }
.pr-lvl b { grid-row: 1 / 3; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; font-family: var(--f-display); font-weight: 900; font-size: 17px; color: #120a00; background: conic-gradient(var(--gold) var(--p), rgba(255,255,255,0.12) 0); box-shadow: 0 0 14px rgba(255,212,0,0.4); position: relative; }
.pr-lvl b::before { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: linear-gradient(160deg, #ffe14d, #ffb000); z-index: 0; }
.pr-lvl b span { position: relative; z-index: 1; }
.pr-lvl .pr-rank { font-weight: 800; font-size: 14px; letter-spacing: 0.02em; }
.pr-lvl small { font-family: var(--f-mono); font-size: 10px; color: var(--muted); }
/* underglow picker */
.pr-glows { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.pr-glow { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.18); background: var(--g); cursor: pointer; padding: 0; position: relative; box-shadow: 0 0 8px var(--g); }
.pr-glow.auto { background: conic-gradient(from 45deg, #444 0 25%, #888 0 50%, #444 0 75%, #888 0); box-shadow: none; }
.pr-glow.rainbow { background: conic-gradient(#ff2bd6, #ffd400, #39ff88, #00e5ff, #8a5cff, #ff2bd6); }
.pr-glow.on { border-color: #fff; box-shadow: 0 0 0 2px var(--ink, #07040f), 0 0 12px var(--g); }
.pr-glow.lk { opacity: 0.3; cursor: default; box-shadow: none; }
.pr-glow.lk::after { content: attr(data-l); position: absolute; inset: 0; display: grid; place-items: center; font: 700 8px var(--f-mono); color: #fff; }
/* results: xp + level up */
.pr-xp { flex-basis: 100%; display: flex; align-items: center; gap: 10px; font-family: var(--f-mono); font-size: 11px; color: var(--muted); }
.pr-xp i { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
.pr-xp i u { display: block; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--gold)); transition: width 1.2s ease 0.4s; }
.pr-xp b { color: var(--text); }
.pr-lvup { flex-basis: 100%; padding: 6px 10px; border-radius: 4px; background: linear-gradient(90deg, rgba(255,212,0,0.35), rgba(255,43,214,0.25)); color: #fff; font-weight: 800; font-size: 13px; letter-spacing: 0.02em; animation: prPop 0.6s cubic-bezier(.2,1.6,.4,1) both 0.6s; }
.pr-lvup em { font-style: normal; color: var(--gold); }
@keyframes prPop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: none; } }
/* Legend row: gold accent */
.pr-m.pr-leg { border-top: 1px solid rgba(255,212,0,0.35); background: linear-gradient(90deg, rgba(255,212,0,0.1), transparent); margin: 0 -8px; padding-left: 8px; padding-right: 8px; }
.pr-m.pr-leg i { border-color: var(--gold); box-shadow: 0 0 8px rgba(255,212,0,0.6); }
.pr-m.pr-leg .pr-t b { color: var(--gold); }
.pr-reward .pr-chip.pr-gold { background: linear-gradient(90deg, #ffe14d, #ffb000); color: #120a00; font-weight: 700; }
.pr-foot { font-family: var(--f-mono); font-size: 10px; letter-spacing: 0.06em; color: var(--muted); padding-top: 8px; border-top: 1px solid var(--line); }
.pr-foot b { color: var(--gold); }
#screen-title .title-badge { display: none; }
/* tuned stats in the garage card */
.segbar i.pr-upseg { background: linear-gradient(180deg, #fff, var(--cyan)); box-shadow: 0 0 6px rgba(0,229,255,0.7); }
.segbar.pr-upbar i.f { box-shadow: 0 0 8px rgba(0,229,255,0.85); }
.st-v.pr-upv { color: var(--cyan); text-shadow: 0 0 10px rgba(0,229,255,0.6); }

.pr-wallet { position: absolute; top: 26px; right: 104px; padding: 8px 14px; border-radius: 6px; background: rgba(8,5,18,0.7); border: 1px solid var(--line-2); font-size: 16px; z-index: 3; }
.pr-lockrow { display: flex; align-items: center; gap: 10px; margin: 8px 0 2px; padding: 8px 10px; border-radius: 4px; background: rgba(255,212,0,0.08); border: 1px dashed rgba(255,212,0,0.45); font-size: 13px; }
.pr-lockrow svg { width: 18px; height: 18px; flex: none; stroke: var(--gold); fill: none; stroke-width: 2.4; }
.pr-lockrow span { flex: 1; }
.pr-lockrow.shake { animation: prShake 0.45s; }
@keyframes prShake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
.pr-buy { padding: 6px 12px; border-radius: 4px; border: none; font-weight: 800; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #120a00; background: linear-gradient(90deg, #ffe14d, #ffb000); cursor: pointer; white-space: nowrap; font-family: inherit; }
.pr-buy:disabled { background: rgba(255,255,255,0.1); color: var(--muted); cursor: default; }
.gp.pr-locked .stats, .gp.pr-locked .gp-name { opacity: 0.55; }
.sw.pr-lk { position: relative; }
.sw.pr-lk::after { content: ''; position: absolute; right: -2px; bottom: -2px; width: 11px; height: 11px; border-radius: 50%; background: #120a1e url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none' stroke='%23ffd400' stroke-width='4'%3E%3Crect x='7' y='14' width='18' height='13' rx='2'/%3E%3Cpath d='M11 14v-4a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E") center/8px no-repeat; border: 1px solid rgba(255,212,0,0.7); }

.pr-tune { position: absolute; right: var(--gut, 40px); top: 50%; transform: translateY(-50%); width: 290px; padding: 12px 14px; background: rgba(8,5,18,0.78); border: 1px solid var(--line-2); border-top: 3px solid var(--cyan); border-radius: 6px; z-index: 2; }
.pr-tune h4 { margin: 0 0 8px; font-family: var(--f-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--cyan); display: flex; justify-content: space-between; }
.pr-tune h4 em { font-style: normal; color: var(--muted); letter-spacing: 0.06em; }
.pr-up { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; padding: 7px 0; border-top: 1px solid var(--line); }
.pr-up .pr-un { font-weight: 700; font-size: 13px; }
.pr-up .pr-ue { font-family: var(--f-mono); font-size: 10px; color: var(--muted); }
.pr-up .pr-pips { display: flex; gap: 3px; margin-top: 3px; }
.pr-up .pr-pips i { width: 18px; height: 5px; border-radius: 1px; background: rgba(255,255,255,0.12); }
.pr-up .pr-pips i.f { background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }
.pr-up .pr-buy { grid-row: 1 / 4; grid-column: 2; }
.pr-tune .pr-note { font-size: 12px; color: var(--muted); padding-top: 6px; border-top: 1px solid var(--line); }
.pr-toast { position: absolute; right: var(--gut, 40px); bottom: 96px; padding: 8px 14px; border-radius: 4px; background: rgba(255,64,96,0.92); color: #fff; font-weight: 700; font-size: 13px; z-index: 5; animation: prToast 2.4s ease forwards; }
@keyframes prToast { 0% { opacity: 0; transform: translateY(8px); } 10%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; } }

.pr-reward { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0 0 12px; padding: 10px 14px; border-radius: 6px; background: linear-gradient(90deg, rgba(255,212,0,0.14), rgba(255,212,0,0.03)); border: 1px solid rgba(255,212,0,0.35); }
.pr-reward .pr-big { font-family: var(--f-display); font-weight: 900; font-style: italic; font-size: 26px; color: var(--gold); text-shadow: 0 0 18px rgba(255,212,0,0.5); margin-right: 6px; }
.pr-reward .pr-chip { font-family: var(--f-mono); font-size: 11px; padding: 2px 8px; border-radius: 3px; background: rgba(255,255,255,0.07); color: var(--text); white-space: nowrap; }
.pr-reward .pr-chip b { color: var(--gold); font-weight: 700; }
.pr-reward .pr-bal { margin-left: auto; font-family: var(--f-mono); font-size: 11px; color: var(--muted); white-space: nowrap; }
.pr-reward .pr-bal b { color: var(--gold); }

body.touch-ui .pr-panel { right: max(14px, env(safe-area-inset-right)); top: 76px; transform: none; width: 286px; padding: 10px 12px 8px; animation-name: prInT; }
@keyframes prInT { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
body.touch-ui .pr-m { padding: 5px 0; }
body.touch-ui .pr-panel { top: 66px; }
body.touch-ui .pr-m .pr-n { display: none; }
body.touch-ui .pr-lvl { margin-bottom: 4px; }
body.touch-ui .pr-lvl b { width: 30px; height: 30px; font-size: 14px; }
body.touch-ui .pr-lvl .pr-rank { font-size: 13px; }
body.touch-ui .pr-panel .pr-head { margin-bottom: 4px; }
body.touch-ui .pr-lvup { font-size: 12px; padding: 4px 8px; }
body.touch-ui .pr-m .pr-t { font-size: 12px; }
body.touch-ui .pr-panel .pr-head .pr-cr { font-size: 17px; }
body.touch-ui .pr-tune { right: max(10px, env(safe-area-inset-right)); top: 62px; transform: none; width: 230px; padding: 8px 10px; }
body.touch-ui .pr-up { padding: 4px 0; }
body.touch-ui .pr-up .pr-un { font-size: 12px; }
body.touch-ui .pr-wallet { top: 14px; right: 84px; font-size: 14px; padding: 6px 10px; }
body.touch-ui .pr-toast { bottom: 70px; }
body.touch-ui .pr-reward { padding: 6px 10px; margin-bottom: 8px; }
body.touch-ui .pr-reward .pr-big { font-size: 20px; }
/* short (phone) screens: results buttons stay pinned at the bottom instead of hiding below the fold */
@media (max-height: 560px) {
  #screen-results .panel-foot { position: sticky; bottom: -14px; z-index: 3; margin-top: 8px; padding: 10px 0 12px; background: linear-gradient(180deg, rgba(9,6,20,0.7), rgba(9,6,20,0.97) 40%); }
  .pr-reward .pr-chip { font-size: 10px; padding: 1px 6px; }
  .pr-reward { gap: 4px 6px; }
}
body.portrait .pr-panel { position: relative; right: auto; top: auto; width: auto; margin: 12px 0 0; }
body.portrait .pr-tune { display: none; }
@media (max-width: 760px) and (pointer: fine) { .pr-panel, .pr-tune { display: none; } }
`;

/** Career UI: daily missions + wallet on the title screen, unlocks & tuning in the garage, rewards after a race. */
export class ProgressUI {
  constructor(progress, menus, gs) {
    this.pr = progress;
    this.menus = menus;
    this.gs = gs;
    const st = document.createElement('style');
    st.id = 'progress-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    this.panel = document.createElement('aside');
    this.panel.className = 'pr-panel';
    $('#screen-title').appendChild(this.panel);
    this.tune = document.createElement('aside');
    this.tune.className = 'pr-tune';
    this.wallet = document.createElement('div');
    this.wallet.className = 'pr-wallet pr-cr';
    $('#screen-garage').append(this.tune, this.wallet);

    // hook into the menu renderer without touching its internals
    const show = menus.show.bind(menus);
    menus.show = (name) => { show(name); if (name === 'title') this.renderTitle(); if (name === 'garage') this.renderTune(); };
    const renderGP = menus.renderGP.bind(menus);
    menus.renderGP = (p) => { renderGP(p); this.decorateGP(p); };
    eventBus.on(Events.GARAGE_CHANGED, () => this.renderTune());
    eventBus.on('progress:mission', () => { if (menus.current === 'title') this.renderTitle(); });
    this.renderTitle();
    document.querySelectorAll('.logo-rule b, .tb-ver b').forEach((e) => { e.textContent = VERSION; });
  }

  // ---------------------------------------------------------------- title
  renderTitle() {
    const list = this.pr.missions();
    const done = list.filter((m) => m.done).length;
    const bonus = this.pr.data.daily.bonus;
    const lv = this.pr.levelInfo();
    this.panel.innerHTML = `
      <div class="pr-lvl" style="--p:${Math.round((lv.xp / lv.need) * 100)}%"><b><span>${lv.level}</span></b><span class="pr-rank">Уровень ${lv.level} · ${lv.rank}</span><small>${lv.xp} / ${lv.need} XP · до нового уровня ${lv.need - lv.xp}</small></div>
      <div class="pr-head"><span>Задания дня · ${done}/${list.length}</span><b class="pr-cr">${money(this.pr.credits)}</b></div>
      ${list.map((m) => `
        <div class="pr-m${m.done ? ' done' : ''}"><i></i><span class="pr-t">${m.text}</span><span class="pr-rw">+${m.reward}</span>
          <span class="pr-bar"><b style="width:${Math.round((m.prog / m.target) * 100)}%"></b></span>
          ${m.target > 1 ? `<span class="pr-n">${m.prog} / ${m.target}</span>` : ''}</div>`).join('')}
      ${this.legendRow()}
      <div class="pr-foot">${bonus ? 'Все задания выполнены — новые завтра' : `Все три — бонус <b>+300 ${CURRENCY}</b> · новые каждый день`}</div>`;
  }

  legendRow() {
    const beaten = !this.pr.legendActive();
    const gold = this.pr.goldOwned();
    return `<div class="pr-m pr-leg${beaten ? ' done' : ''}"><i></i><span class="pr-t">${beaten ? 'Легенда побеждена — новая завтра' : 'Обгони <b>Легенду</b> — золотую машину в гонке'}</span><span class="pr-rw">+${LEGEND_REWARD}</span>
      <span class="pr-n">${gold ? 'Золотая краска уже твоя' : 'Первая победа открывает золотую краску'}</span></div>`;
  }

  // ---------------------------------------------------------------- garage
  decorateGP(p) {
    const el = $(`.gp[data-p="${p}"]`);
    if (!el) return;
    const g = this.gs.garage[p];
    const carOk = this.pr.carOwned(g.type);
    const colOk = this.pr.colorOwned(g.color);
    el.classList.toggle('pr-locked', !carOk);
    el.querySelectorAll('.sw').forEach((b) => b.classList.toggle('pr-lk', !this.pr.colorOwned(+b.dataset.c)));
    this.showTunedStats(el, g.type);
    let row = null;
    if (!carOk) {
      const price = this.pr.carPrice(g.type);
      row = this.lockRow(`Машина закрыта · <b>${money(price)}</b>`, price, () => this.pr.buyCar(g.type));
    } else if (!colOk && this.pr.colorPrice(g.color) == null) {
      row = document.createElement('div');
      row.className = 'pr-lockrow';
      row.innerHTML = `${UI_ICONS.lock}<span>«${CAR_COLORS[g.color].name}» — награда за победу над <b>Легендой</b></span>`;
    } else if (!colOk) {
      row = this.lockRow(`Цвет «${CAR_COLORS[g.color].name}» · ${money(COLOR_PRICE)}`, COLOR_PRICE, () => this.pr.buyColor(g.color));
    }
    if (row) (el.querySelector('.gp-desc') || el.querySelector('.gp-car')).after(row);
  }

  /** Speed / acceleration bars include the bought tuning (extra segments + value in cyan). */
  showTunedStats(el, type) {
    const t = CAR_TYPES[type];
    const lvE = this.pr.level(type, 'eng'), lvA = this.pr.level(type, 'acc');
    // the same formulas the race uses (Car.topSpeed / accel), mapped back onto the 0..1 stat scale
    const top = (CAR.BASE_TOP_SPEED + CAR.TOP_SPEED_RANGE * t.speed) * (1 + UPGRADES[0].step * lvE);
    const acc = (CAR.BASE_ACCEL + CAR.ACCEL_RANGE * t.accel) * (1 + UPGRADES[1].step * lvA);
    const eff = [(top - CAR.BASE_TOP_SPEED) / CAR.TOP_SPEED_RANGE, (acc - CAR.BASE_ACCEL) / CAR.ACCEL_RANGE];
    const base = [t.speed, t.accel];
    const bars = el.querySelectorAll('.stats .segbar'), vals = el.querySelectorAll('.stats .st-v');
    for (let k = 0; k < 2; k++) {
      if (!bars[k] || !vals[k] || eff[k] <= base[k] + 1e-6) continue;
      const n0 = Math.round(Math.min(1, base[k]) * 10), n1 = Math.round(Math.min(1, eff[k]) * 10);
      bars[k].querySelectorAll('i').forEach((seg, i) => { if (i >= n0 && i < n1) seg.className = 'f pr-upseg'; });
      if (n1 === n0) bars[k].classList.add('pr-upbar'); // already full: glow the whole bar instead
      vals[k].textContent = Math.round(eff[k] * 100);
      vals[k].classList.add('pr-upv');
      vals[k].title = `Базово ${Math.round(base[k] * 100)} · тюнинг +${Math.round((eff[k] - base[k]) * 100)}`;
    }
  }

  lockRow(text, price, buy) {
    const row = document.createElement('div');
    row.className = 'pr-lockrow';
    const short = price - this.pr.credits;
    row.innerHTML = `${UI_ICONS.lock}<span>${text}</span><button class="pr-buy"${short > 0 ? ' disabled' : ''}>${short > 0 ? `Не хватает ${money(short)}` : 'Купить'}</button>`;
    row.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      if (buy()) { this.menus.renderGarage(); this.renderTune(); }
    };
    return row;
  }

  renderTune() {
    this.wallet.textContent = money(this.pr.credits);
    const one = this.gs.settings.players === 1;
    this.tune.hidden = !one;
    this.wallet.hidden = one;
    if (!one) return;
    const t = this.gs.garage[0].type;
    const owned = this.pr.carOwned(t);
    const rows = UPGRADES.map((u) => {
      const lv = this.pr.level(t, u.id);
      const cost = this.pr.upgradeCost(t, u.id);
      const eff = u.unit === '%' ? `+${Math.round(u.step * lv * 100)}% ${u.short}` : `+${u.step * lv} ${u.short}`;
      const can = owned && cost != null && cost <= this.pr.credits;
      const label = cost == null ? 'Макс' : `${cost} ${CURRENCY}`;
      return `<div class="pr-up"><span class="pr-un">${u.name}</span><button class="pr-buy" data-up="${u.id}"${can ? '' : ' disabled'}>${label}</button>
        <span class="pr-pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'f' : ''}"></i>`).join('')}</span><span class="pr-ue">${lv ? eff : u.short}</span></div>`;
    }).join('');
    const gsel = this.gs.garage[0].glow ?? 0;
    const glows = GLOWS.map((g, i) => {
      const ok = this.pr.glowUnlocked(i);
      const cls = `pr-glow${g.id === 'auto' ? ' auto' : ''}${g.rainbow ? ' rainbow' : ''}${i === gsel ? ' on' : ''}${ok ? '' : ' lk'}`;
      const col = g.hex ? '#' + g.hex.toString(16).padStart(6, '0') : '#999';
      return `<button class="${cls}" data-glow="${i}" data-l="${g.level}" style="--g:${col}" title="${g.name}${ok ? '' : ` · с ${g.level} уровня`}"${ok ? '' : ' disabled'}></button>`;
    }).join('');
    this.tune.innerHTML = `<h4><span>Тюнинг</span><b class="pr-cr">${money(this.pr.credits)}</b></h4>${rows}
      <div class="pr-up"><span class="pr-un">Неон-подсветка</span><span class="pr-ue">${GLOWS[gsel].name}</span><span class="pr-glows" style="grid-column:1/3">${glows}</span></div>
      ${owned ? '' : '<div class="pr-note">Сначала купи эту машину</div>'}`;
    this.tune.querySelectorAll('[data-glow]').forEach((b) => {
      b.onclick = () => {
        this.gs.garage[0].glow = +b.dataset.glow;
        this.gs.saveSettings();
        eventBus.emit(Events.UI_CLICK);
        eventBus.emit(Events.GARAGE_CHANGED, { p: 0 });
      };
    });
    this.tune.querySelectorAll('[data-up]').forEach((b) => {
      b.onclick = () => { if (this.pr.buyUpgrade(t, b.dataset.up)) { this.renderTune(); this.menus.renderGarage(); } };
    });
  }

  /** Start pressed with a locked car/colour selected. */
  flashLocked() {
    document.querySelectorAll('.pr-lockrow').forEach((r) => { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); });
    const t = document.createElement('div');
    t.className = 'pr-toast';
    t.textContent = 'Сначала купи машину или цвет — или выбери открытые';
    $('#screen-garage').appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ---------------------------------------------------------------- results
  showRewards(rw) {
    const body = $('#screen-results .results-body');
    body.querySelector('.pr-reward')?.remove();
    if (!rw) return;
    const box = document.createElement('div');
    box.className = 'pr-reward';
    const chips = rw.lines.map(([l, n]) => `<span class="pr-chip">${l} <b>+${n}</b></span>`);
    if (rw.legend?.gold) chips.push('<span class="pr-chip pr-gold">Открыт цвет «Золото»</span>');
    if (rw.missions) chips.push(`<span class="pr-chip">Задания <b>+${rw.missions}</b></span>`);
    const x = rw.xp;
    // all level-ups of this race in one line: highest level, last new rank, summed bonus, unlocked underglows
    const L = x?.ups || [];
    const rank = L.map((u) => u.rank).filter(Boolean).pop();
    const glows = L.map((u) => u.glow).filter(Boolean);
    const ups = L.length ? `<div class="pr-lvup">Новый уровень <em>${L[L.length - 1].level}</em>${rank ? ` · ранг «${rank}»` : ''} · +${money(L.reduce((a, u) => a + u.credits, 0))}${glows.length ? ` · подсветка ${glows.map((g) => `«${g}»`).join(', ')}` : ''}</div>` : '';
    const xpRow = x ? `<div class="pr-xp"><span>Ур. <b>${x.level}</b> · ${x.rank}</span><i><u style="width:0%"></u></i><span>+${x.gain} XP</span></div>` : '';
    box.innerHTML = `<span class="pr-big">+${money(rw.total)}</span>${chips.join('')}<span class="pr-bal">Баланс <b>${money(rw.balance)}</b></span>${xpRow}${ups}`;
    body.prepend(box);
    if (x) requestAnimationFrame(() => requestAnimationFrame(() => { const u = box.querySelector('.pr-xp u'); if (u) u.style.width = `${Math.round((x.xp / x.need) * 100)}%`; }));
  }
}
