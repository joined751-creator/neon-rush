import { AI, CAR, ITEMS } from '../core/Constants.js';
import { angleDiff } from '../level/Track.js';

/** Racing-line follower with lane wandering, avoidance, braking for curves and item usage. */
export class AIDriver {
  constructor(car, track, skill) {
    this.car = car;
    this.track = track;
    this.skill = skill; // DIFFICULTY entry
    this.lane = (Math.random() - 0.5) * 8;
    this.laneTarget = this.lane;
    this.laneTimer = 0;
    this.itemDelay = 1 + Math.random() * 2;
    this.nitroCooldown = 0;
    this._p = {};
  }

  update(dt, cars, leaderHumanProgress) {
    const car = this.car;
    const t = this.track;
    const c = car.controls;
    const speed = Math.max(0, car.speed);

    // Lane wandering
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2 + Math.random() * 3;
      this.laneTarget = (Math.random() - 0.5) * (t.width - 7);
    }
    // Avoid car ahead
    let blocked = false;
    for (const o of cars) {
      if (o === car || o.eliminated) continue;
      const ds = o.progress - car.progress;
      if (ds > 0 && ds < AI.AVOID_DIST && Math.abs(o.lateral - this.lane) < 2.8) {
        this.laneTarget = o.lateral > 0 ? o.lateral - 4.2 : o.lateral + 4.2;
        blocked = true;
        break;
      }
    }
    // Racing line bias: inside of upcoming curve
    const aheadIdx = t.wrap(car.trackIndex + Math.round(30 / t.step));
    const curvAhead = t.curv[aheadIdx];
    const insideBias = blocked ? 0 : Math.max(-1, Math.min(1, curvAhead * 120)) * (t.half - 3.5);
    const laneGoal = Math.max(-(t.half - 2.6), Math.min(t.half - 2.6, this.laneTarget * 0.5 + insideBias * 0.6));
    this.lane += (laneGoal - this.lane) * Math.min(1, dt * AI.LANE_DRIFT_RATE * 4);

    // Target point
    const look = AI.LOOKAHEAD_BASE + speed * AI.LOOKAHEAD_SPEED;
    const p = t.pointAt(car.s + look, this.lane, this._p);
    const desired = Math.atan2(p.x - car.x, p.z - car.z);
    const err = angleDiff(desired, car.heading);
    c.steer = Math.max(-1, Math.min(1, -err * AI.STEER_GAIN));

    // Curvature ahead → target speed
    let maxCurv = 0;
    const steps = Math.round(AI.CURVE_LOOK / t.step);
    const base = car.trackIndex + Math.round((speed * 0.6) / t.step);
    for (let k = 0; k < steps; k += 2) maxCurv = Math.max(maxCurv, Math.abs(t.curv[t.wrap(base + k)]));
    const top = car.topSpeed;
    const corner = Math.sqrt(Math.max(1, 26 * this.skill.cornerSkill) / Math.max(0.0005, maxCurv)) * 1.15;
    const targetSpeed = Math.min(top * 1.2, corner);

    c.throttle = speed < targetSpeed ? 1 : 0;
    c.brake = speed > targetSpeed + 6 ? Math.min(1, (speed - targetSpeed) / 12) : 0;
    if (car.speed < -1) { c.throttle = 1; c.brake = 0; }

    // Drift on sharp bends (hard AI drifts more)
    const wantDrift = maxCurv > 0.012 && speed > CAR.DRIFT_MIN_SPEED + 6 && Math.abs(c.steer) > 0.35 && Math.random() < this.skill.itemSkill;
    if (!car.drifting && wantDrift) c.drift = true;
    if (car.drifting) {
      const keep = maxCurv > 0.006 && Math.abs(err) < 0.9;
      c.drift = keep || car.driftTime < 0.6;
      // counter steer to stay on line
      c.steer = Math.max(-1, Math.min(1, car.driftDir * 0.3 - err * 2.0));
    }

    // Nitro on straights
    this.nitroCooldown -= dt;
    c.nitro = car.nitro > 45 && maxCurv < 0.006 && this.nitroCooldown <= 0;
    if (car.nitro < 2) this.nitroCooldown = 3 + Math.random() * 3;

    // Rubber band vs humans
    if (leaderHumanProgress !== null) {
      const diff = car.progress - leaderHumanProgress;
      const target = diff > AI.RUBBER_FAR ? AI.RUBBER_SLOW : diff < -AI.RUBBER_FAR ? AI.RUBBER_FAST : 1;
      car.topMult += (this.skill.speedMult * target - car.topMult) * Math.min(1, dt * 0.5);
    } else car.topMult = this.skill.speedMult;

    // Items
    c.item = false;
    if (car.item) {
      this.itemDelay -= dt;
      if (this.itemDelay <= 0) {
        if (this.shouldUse(car, cars)) { c.item = true; this.itemDelay = 1 + Math.random() * 2.5 / this.skill.itemSkill; }
      }
    }
  }

  shouldUse(car, cars) {
    const it = car.item;
    if (it === 'nitro' || it === 'shield') return true;
    if (it === 'rocket') return cars.some((o) => o !== car && !o.eliminated && o.progress > car.progress && o.progress - car.progress < 90) || Math.random() < 0.02;
    if (it === 'oil') return cars.some((o) => o !== car && !o.eliminated && car.progress - o.progress > 4 && car.progress - o.progress < 40) || Math.random() < 0.01;
    if (it === 'emp') return cars.some((o) => o !== car && !o.eliminated && (o.x - car.x) ** 2 + (o.z - car.z) ** 2 < (ITEMS.EMP_RADIUS * 0.7) ** 2);
    return true;
  }
}
