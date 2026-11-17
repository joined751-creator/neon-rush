/** Per-race skill challenges. No storage or career economy changes. */
export class ContractRun {
  constructor() {
    this.goals = [
      { id: 'clean', name: 'Чистая линия', hint: '10 с без ударов на скорости от 100 км/ч', target: 10, value: 0, done: false },
      { id: 'drift', name: 'Повелитель поворотов', hint: '6 с управляемого дрифта суммарно', target: 6, value: 0, done: false },
      { id: 'boost', name: 'Полный форсаж', hint: '5 с с активным ускорением суммарно', target: 5, value: 0, done: false },
    ];
    this.stats = { topSpeed: 0, drift: 0, boost: 0, distance: 0, time: 0, impacts: 0 };
    this.closed = false;
  }
  impact() {
    if (this.closed) return;
    this.stats.impacts++;
    if (!this.goals[0].done) this.goals[0].value = 0;
  }
  update(dt, car) {
    if (this.closed || car.finished || car.eliminated || !(dt > 0)) return [];
    const s = this.stats;
    const speed = Math.max(0, car.kmh || 0);
    const drift = car.drifting && car.driftLevel > 0 && !car.airborne;
    const boost = car.boosting && speed >= 100;
    s.time += dt; s.topSpeed = Math.max(s.topSpeed, speed);
    s.distance += speed / 3.6 * dt;
    if (drift) s.drift += dt;
    if (boost) s.boost += dt;
    const clean = this.goals[0];
    if (!clean.done) clean.value = speed >= 100 && !car.spinTime && !car.wrongWayTimer ? clean.value + dt : 0;
    this.goals[1].value = s.drift;
    this.goals[2].value = s.boost;
    const completed = [];
    for (const g of this.goals) {
      if (!g.done && g.value + 1e-9 >= g.target) { g.done = true; completed.push(g); }
      g.value = Math.min(g.target, g.value);
    }
    return completed;
  }
  get completed() { return this.goals.filter((g) => g.done).length; }
  get rank() { return ['C', 'B', 'A', 'S'][this.completed]; }
}
