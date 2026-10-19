import { CAR_COLORS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { buildCarModel, disposeCarModel } from './CarModel.js';
import { tidyModel } from './LightTrails.js';

/*
 * «ЛЕГЕНДА» — a daily boss rival. Until the player beats it, one rival on the grid (the pole sitter)
 * is the Legend: a gold car with a name tag, sharper driving and no lifting off when it leads.
 * Beat it to a better place to earn a bonus — the first win ever unlocks the gold paint.
 */

export const LEGEND_NAME = 'Легенда';
export const GOLD_INDEX = CAR_COLORS.findIndex((c) => c.name === 'Золото');
const GOLD = CAR_COLORS[GOLD_INDEX]?.hex ?? 0xffc83d;
const SKILL = { id: 'legend', name: 'Легенда', speedMult: 1.02, cornerSkill: 0.88, itemSkill: 1, drift: 0.9, ease: 0.15, recovery: 1.3 };

/** Turns the front-most rival into the Legend. Returns the car (or null if there is no rival). */
export function setupLegend(race) {
  const car = race.cars.find((c) => !c.human);
  if (!car) return null;
  const scene = race.scene;
  scene.remove(car.model.root);
  disposeCarModel(car.model);
  car.model = buildCarModel(car.type.id, GOLD, { label: 'ЛЕГЕНДА' });
  scene.add(car.model.root);
  tidyModel(car.model);
  if (car.model.glow) { car.model.glow.material.color.setHex(0xffb000).multiplyScalar(1.5); car.model.glow.scale.multiplyScalar(1.15); }
  car.color = GOLD;
  car.name = LEGEND_NAME;
  car.legend = true;
  car.updateVisual(0);
  const d = race.drivers.get(car);
  if (d) d.skill = SKILL;
  car.topMult = SKILL.speedMult;
  setTimeout(() => {
    if (race.phase !== 'finished') eventBus.emit(Events.UI_POPUP, { player: 0, text: 'В гонке ЛЕГЕНДА — обгони золотую машину!', color: '#ffd400' });
  }, 1200);
  return car;
}
