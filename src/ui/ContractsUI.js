import { ContractRun } from '../gameplay/RaceContracts.js';
import { eventBus, Events } from '../core/EventBus.js';

export class ContractsUI {
  constructor(game) {
    this.game = game;
    this.slots = [];
    this.race = null;
    const impact = (car) => {
      if (!this.active) return;
      const s = this.slots.find((s) => s.car === car);
      if (s && !car.finished && !car.eliminated) s.run.impact();
    };
    eventBus.on(Events.CAR_WALL_HIT, ({ car, impact: force }) => { if (force > 7) impact(car); });
    eventBus.on(Events.CAR_SPINOUT, ({ car }) => impact(car));
  }
  get active() { return this.race?.phase === 'racing' && this.game.state === 'race'; }
  attach(race) {
    this.detach();
    this.race = race;
    if (race.demo) return;
    document.querySelectorAll('.contract-report').forEach((el) => el.remove());
    const panes = document.querySelectorAll('.phud');
    this.slots = race.humans.map((car, i) => {
      const run = new ContractRun();
      const el = document.createElement('div');
      el.className = 'race-contracts';
      el.innerHTML = `<span class="rc-kicker">КОНТРАКТЫ <b>0/3</b></span>${run.goals.map((g) => `<div class="rc-goal" title="${g.hint}"><span>${g.name}</span><b>0/${g.target} с</b><i><u></u></i></div>`).join('')}<small>${race.mode === 'trial' ? 'Заезд на время · без награды нитро' : 'Каждый контракт: +15 нитро'}</small>`;
      panes[i]?.append(el);
      return { car, run, el, rows: [...el.querySelectorAll('.rc-goal')], count: el.querySelector('.rc-kicker b') };
    });
    this.render();
  }
  detach() {
    for (const s of this.slots) s.el.remove();
    this.slots = []; this.race = null;
  }
  update(dt) {
    if (!this.active) return;
    for (const s of this.slots) {
      for (const g of s.run.update(dt, s.car)) {
        if (this.race.mode !== 'trial') s.car.nitro = Math.min(100, s.car.nitro + 15);
        eventBus.emit(Events.UI_POPUP, { player: s.car.player, text: `${g.name.toUpperCase()} ✓${this.race.mode === 'trial' ? '' : ' +15 НИТРО'}`, color: '#60ffbd' });
        this.game.mobile?.buzz?.(30);
      }
    }
    this.renderTimer = (this.renderTimer || 0) + dt;
    if (this.renderTimer >= 0.1) { this.renderTimer = 0; this.render(); }
  }
  render() {
    for (const s of this.slots) {
      s.count.textContent = `${s.run.completed}/3`;
      s.run.goals.forEach((g, i) => {
        const row = s.rows[i];
        row.classList.toggle('done', g.done);
        row.querySelector('b').textContent = g.done ? '✓' : `${Math.floor(g.value)}/${g.target} с`;
        row.querySelector('u').style.transform = `scaleX(${g.value / g.target})`;
      });
    }
  }
  finish() {
    if (!this.race || this.race.demo) return;
    document.querySelectorAll('.contract-report').forEach((el) => el.remove());
    const box = document.querySelector('#screen-results .results-body');
    if (!box) return;
    for (const s of this.slots) {
      s.run.closed = true;
      const { stats, rank, completed } = s.run;
      const el = document.createElement('section');
      el.className = 'contract-report';
      el.innerHTML = `<div class="cr-heading"><div><span>РАЗБОР ЗАЕЗДА · ИГРОК ${s.car.player + 1}</span><h3>Мастерство пилота</h3></div><b class="cr-rank rank-${rank}">${rank}</b></div><div class="cr-stats"><div><b>${Math.round(stats.topSpeed)}<small> км/ч</small></b><span>Пиковая скорость</span></div><div><b>${stats.drift.toFixed(1)}<small> с</small></b><span>В дрифте</span></div><div><b>${stats.boost.toFixed(1)}<small> с</small></b><span>На форсаже</span></div><div><b>${completed}<small> / 3</small></b><span>Контракты</span></div></div><div class="cr-goals">${s.run.goals.map((g) => `<span class="${g.done ? 'done' : ''}">${g.done ? '✓' : '○'} ${g.name}</span>`).join('')}</div>`;
      box.append(el);
    }
  }
}
