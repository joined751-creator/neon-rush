import { AI, CAR, ITEMS } from '../core/Constants.js';
import { angleDiff } from '../level/Track.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Racing AI.
 * - Follows a racing line (inside of upcoming bends, lane wandering, overtakes around blockers).
 * - Corner speed comes from the car's real turning limit, so bots carry speed instead of over-braking.
 * - Drifts only into bends it can see coming, in the bend's direction, and steers the slide with a
 *   small solver (how much yaw is needed → where to hold the stick); exits before the bend ends.
 * - Wall guard, rear-end avoidance, nitro on clear straights, smooth catch-up and crash recovery.
 */
export class AIDriver {
  constructor(car, track, skill) {
    this.car = car;
    this.track = track;
    this.skill = skill; // DIFFICULTY entry
    this.lane = (Math.random() - 0.5) * 8;
    this.laneTarget = this.lane;
    this.laneTimer = 0;
    this.itemDelay = 1 + Math.random() * 2;
    this.nitroCooldown = Math.random() * 3;
    this.driftLow = 0;
    this.mistake = 0;
    this._p = {};
  }

  /** Signed curvature averaged over [from, from+len] metres ahead. */
  curvAhead(from, len) {
    const t = this.track;
    const a = this.car.trackIndex + Math.round(from / t.step);
    const n = Math.max(1, Math.round(len / t.step));
    let sum = 0;
    for (let k = 0; k < n; k++) sum += t.curv[t.wrap(a + k)];
    return sum / n;
  }

  update(dt, cars, leaderHumanProgress) {
    const car = this.car;
    const t = this.track;
    const c = car.controls;
    const sk = this.skill;
    const speed = Math.max(0, car.speed);
    const top = car.topSpeed;
    const handling = 0.75 + car.type.handling * 0.5;

    // ---------------------------------------------------------------- line choice
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2.5 + Math.random() * 3;
      this.laneTarget = (Math.random() - 0.5) * (t.width - 9);
    }
    let blocked = null;
    for (const o of cars) {
      if (o === car || o.eliminated) continue;
      const ds = o.progress - car.progress;
      if (ds > 0 && ds < AI.AVOID_DIST && Math.abs(o.lateral - this.lane) < 3) { blocked = o; break; }
    }
    if (blocked) {
      // pass on the side with more room
      const room = blocked.lateral > 0 ? -1 : 1;
      this.laneTarget = clamp(blocked.lateral + room * 4.4, -(t.half - 2.8), t.half - 2.8);
    }
    const kNear = this.curvAhead(Math.max(8, speed * 0.5), 30);
    const insideBias = blocked ? 0 : clamp(kNear * 110, -1, 1) * (t.half - 3.6);
    const edge = t.half - 3.0;
    const laneGoal = clamp(this.laneTarget * 0.45 + insideBias * 0.65, -edge, edge);
    this.lane += (laneGoal - this.lane) * Math.min(1, dt * AI.LANE_DRIFT_RATE * 4);

    // ---------------------------------------------------------------- steering
    const look = AI.LOOKAHEAD_BASE + speed * AI.LOOKAHEAD_SPEED;
    const p = t.pointAt(car.s + look, this.lane, this._p);
    const desired = Math.atan2(p.x - car.x, p.z - car.z);
    const err = angleDiff(desired, car.heading);
    let steer = clamp(-err * AI.STEER_GAIN, -1, 1);

    // ---------------------------------------------------------------- corner speed from the real turning limit
    let maxCurv = 0;
    const steps = Math.round(AI.CURVE_LOOK / t.step);
    const base = car.trackIndex + Math.round((speed * 0.55) / t.step);
    for (let k = 0; k < steps; k += 2) maxCurv = Math.max(maxCurv, Math.abs(t.curv[t.wrap(base + k)]));
    const yawCap = CAR.TURN_RATE * handling * sk.cornerSkill * (sk.drift > 0.3 ? 1.06 : 1);
    const corner = yawCap / (maxCurv + yawCap * 0.28 / top);
    const targetSpeed = Math.min(top * 1.3, corner);

    let throttle = speed < targetSpeed ? 1 : 0;
    let brake = speed > targetSpeed + 4 ? clamp((speed - targetSpeed) / 10, 0, 1) : 0;
    // don't rear-end a slower car that is right ahead in our lane
    for (const o of cars) {
      if (o === car || o.eliminated) continue;
      const ds = o.progress - car.progress;
      if (ds > 0 && ds < 9 && Math.abs(o.lateral - car.lateral) < 2.6 && car.speed > o.speed + 2) { throttle = 0; brake = Math.max(brake, 0.35); break; }
    }
    if (car.speed < -1) { throttle = 1; brake = 0; }

    // ---------------------------------------------------------------- drifting
    const kEntry = this.curvAhead(Math.max(6, speed * 0.35), 26);
    const turnDir = Math.sign(kEntry);
    let drift = false;
    if (!car.drifting) {
      this.driftLow = 0;
      const wants = Math.abs(kEntry) > 0.011 && speed > CAR.DRIFT_MIN_SPEED + 8 && Math.sign(steer) === turnDir
        && Math.abs(steer) > CAR.DRIFT_MIN_STEER + 0.05 && Math.abs(car.lateral) < t.half - 3.5;
      if (wants && Math.random() < sk.drift * dt * 6) drift = true;
    } else {
      const dd = car.driftDir;
      // solver: yaw the line needs → stick position inside the drift range
      const amount = (steer * dd) / CAR.DRIFT_TURN;
      const tight = clamp((2 * (amount - CAR.DRIFT_YAW_MIN)) / (1 - CAR.DRIFT_YAW_MIN) - 1, -1, 1);
      steer = dd * tight;
      this.driftLow = amount < CAR.DRIFT_YAW_MIN * 0.6 ? this.driftLow + dt : 0;
      const kOut = this.curvAhead(Math.max(4, speed * 0.3), 18);
      const bendEnds = Math.abs(kOut) < 0.004 || Math.sign(kOut) !== dd;
      const nearWall = Math.abs(car.lateral) > t.half - 2.6 && Math.sign(car.lateral) !== dd;
      drift = !(bendEnds || this.driftLow > 0.15 || nearWall || Math.abs(err) > 0.7) || car.driftTime < 0.25;
      if (nearWall) drift = false;
    }

    // ---------------------------------------------------------------- wall guard
    if (Math.abs(car.lateral) > t.half - 2.2) {
      const away = -Math.sign(car.lateral);
      steer = clamp(steer + away * 0.5, -1, 1);
      if (car.drifting) drift = false;
    }

    // ---------------------------------------------------------------- small human-like mistakes on easy
    this.mistake -= dt;
    if (this.mistake <= 0 && Math.random() < (1 - sk.cornerSkill) * dt * 0.6) this.mistake = 0.5 + Math.random() * 0.6;
    if (this.mistake > 0) throttle *= 0.5;

    c.steer = steer;
    c.throttle = throttle;
    c.brake = brake;
    c.drift = drift;

    // ---------------------------------------------------------------- nitro on clear straights (more when behind)
    this.nitroCooldown -= dt;
    const behindHuman = leaderHumanProgress !== null ? leaderHumanProgress - car.progress : 0;
    const clearStraight = maxCurv < 0.006 && !blocked;
    c.nitro = clearStraight && this.nitroCooldown <= 0 && car.nitro > (behindHuman > 40 ? 20 : 45);
    if (car.nitro < 2) this.nitroCooldown = 2 + Math.random() * 3;

    // ---------------------------------------------------------------- pace: smooth catch-up + crash recovery
    let mult = sk.speedMult;
    if (leaderHumanProgress !== null) {
      const diff = car.progress - leaderHumanProgress; // + ahead of the best human
      if (diff < 0) mult *= 1 + AI.RUBBER_CATCHUP * clamp(-diff / AI.RUBBER_RANGE, 0, 1);
      else mult *= 1 - AI.RUBBER_EASE * sk.ease * clamp(diff / AI.RUBBER_RANGE, 0, 1);
    }
    car.topMult += (mult - car.topMult) * Math.min(1, dt * 0.8);
    // after a crash / spin a bot gets back up to speed quicker (like a pro driver would)
    const slow = speed < top * 0.55 && car.controlEnabled;
    car.accelMult = slow ? 1 + AI.RECOVERY_ACCEL * sk.recovery : 1;

    // ---------------------------------------------------------------- items
    c.item = false;
    if (car.item) {
      this.itemDelay -= dt;
      if (this.itemDelay <= 0 && this.shouldUse(car, cars)) {
        c.item = true;
        this.itemDelay = 1 + (Math.random() * 2.5) / sk.itemSkill;
      }
    }
  }

  shouldUse(car, cars) {
    const it = car.item;
    if (it === 'nitro') return Math.abs(this.track.curv[this.car.trackIndex]) < 0.006;
    if (it === 'shield') return cars.some((o) => o !== car && !o.eliminated && Math.abs(o.progress - car.progress) < 40) || Math.random() < 0.02;
    if (it === 'rocket') return cars.some((o) => o !== car && !o.eliminated && o.progress > car.progress && o.progress - car.progress < 90) || Math.random() < 0.02;
    if (it === 'oil') return cars.some((o) => o !== car && !o.eliminated && car.progress - o.progress > 4 && car.progress - o.progress < 40) || Math.random() < 0.01;
    if (it === 'emp') return cars.some((o) => o !== car && !o.eliminated && (o.x - car.x) ** 2 + (o.z - car.z) ** 2 < (ITEMS.EMP_RADIUS * 0.7) ** 2);
    return true;
  }
}
