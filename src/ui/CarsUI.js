import { CAR_TYPES } from '../core/Constants.js';
import './DigitalUI.js';
import { TRACKS } from '../level/TrackDefs.js';
import { eventBus, Events } from '../core/EventBus.js';

/*
 * v4.4 / v5.0 "new cars" UI: class + type line and a «Новая» badge on the garage card of the new cars,
 * and the "Новое в 4.4" title banner that opens the garage on the new electric car.
 */

const META = {
  pulse: { cls: 'S', tag: 'Электро-суперкар' },
  buran: { cls: 'B', tag: 'Ралли-внедорожник' },
  vector: { cls: 'S', tag: 'Световой болид' },
};
const NEW = new Set(['vector']);

const CSS = `
.gp-name .cu-new { display: inline-block; vertical-align: middle; margin-left: 10px; padding: 2px 7px; border-radius: 3px; font: 700 10px var(--f-mono);
  letter-spacing: 0.12em; text-transform: uppercase; color: #07040f; background: linear-gradient(90deg, #39ff88, #00e5ff); box-shadow: 0 0 12px rgba(0,229,255,0.5); }
.new-banner.cu-banner { background: linear-gradient(100deg, rgba(0,229,255,0.18), rgba(57,255,136,0.16)); border-color: rgba(0,229,255,0.7); }
.new-banner.cu-banner .nb-tag { background: linear-gradient(90deg, #00e5ff, #39ff88); color: #07040f; }
.new-banner.cu-banner .mbtn-go { color: #00e5ff; }
`;

export class CarsUI {
  constructor(game) {
    this.game = game;
    const st = document.createElement('style');
    st.id = 'cars-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    const menus = game.menus;
    const renderGP = menus.renderGP.bind(menus);
    menus.renderGP = (p) => { renderGP(p); this.decorate(p); };

    eventBus.on(Events.UI_ACTION, ({ action }) => {
      if (action !== 'tryGrid') return;
      // v5.0: the banner opens the digital world — «Сетка» track + the «Вектор» light car
      const i = CAR_TYPES.findIndex((t) => t.id === 'vector');
      if (i >= 0) game.gs.garage[0].type = i;
      const tr = TRACKS.findIndex((t) => t.id === 'grid');
      if (tr >= 0) game.gs.settings.track = tr;
      if (game.gs.settings.mode === 'gp') game.gs.settings.mode = 'race';
      game.gs.saveSettings();
      menus.show('setup');
      menus.action('garage');
    });
    this.banner();
  }

  banner() {
    const b = document.querySelector('.new-banner');
    if (!b) return;
    b.dataset.action = 'tryGrid';
    b.classList.remove('ch-banner');
    b.classList.add('cu-banner');
    b.innerHTML = '<span class="nb-tag">Новое в 5.5</span><span class="nb-t">Прожекторы в небе<small>Над каждой трассой мягко ходят световые лучи в её цветах</small></span><i class="mbtn-go"></i>';
  }

  decorate(p) {
    const el = document.querySelector(`.gp[data-p="${p}"]`);
    if (!el) return;
    const t = CAR_TYPES[this.game.gs.garage[p].type];
    const meta = META[t.id];
    if (!meta) return;
    const cls = el.querySelector('.gp-cls');
    if (cls) cls.textContent = meta.cls;
    const tag = el.querySelector('.gp-meta > span:not(.gp-idx)');
    if (tag) tag.textContent = meta.tag;
    const name = el.querySelector('.gp-name');
    if (name && NEW.has(t.id) && !name.querySelector('.cu-new')) name.insertAdjacentHTML('beforeend', '<span class="cu-new">Новая</span>');
  }
}
