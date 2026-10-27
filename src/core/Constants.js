// All tuning values live here (game-creator architecture: zero magic numbers in logic).

export const GAME = {
  TITLE: 'NEON RUSH',
  MAX_DELTA: 1 / 20,
  PHYSICS_STEP: 1 / 120,
  MAX_DPR_HIGH: 2,
  MAX_DPR_MED: 1.25,
  MAX_DPR_LOW: 1,
  FOV: 68,
  FOV_BOOST: 86,
  NEAR: 0.3,
  FAR: 3200,
  MAX_CARS: 8,
};

export const TRACK = {
  WIDTH: 20,
  SAMPLE_STEP: 2, // metres between centre-line samples
  WALL_HEIGHT: 1.1,
  WALL_OFFSET: 0.6, // wall distance past road edge
  SEARCH_WINDOW: 24,
  ITEM_ROW_FRACTIONS: [0.22, 0.52, 0.8],
  ITEM_RESPAWN: 3.5,
  BOOST_PAD_LENGTH: 10,
  BOOST_PAD_WIDTH: 5,
  RAMP_LENGTH: 12,
  STRAIGHT_CURVATURE: 0.05,
  GRID_ROW_GAP: 9,
  GRID_COL_OFFSET: 4.2,
  GRID_FIRST_ROW: 10,
};

export const CAR = {
  RADIUS: 1.45,
  MASS: 1,
  BASE_TOP_SPEED: 54, // m/s  (~195 km/h)
  TOP_SPEED_RANGE: 16,
  BASE_ACCEL: 17,
  ACCEL_RANGE: 13,
  BRAKE: 42,
  REVERSE_ACCEL: 14,
  REVERSE_MAX: 14,
  DRAG: 0.08,
  ROLLING: 2.2,
  TURN_RATE: 1.9, // rad/s at full lock
  HANDLING_RANGE: 0.9,
  GRIP: 8.5,
  DRIFT_GRIP: 3.9, // momentum carries the car outward: start the slide early and hold the line with the stick
  DRIFT_MIN_SPEED: 16,
  DRIFT_MIN_STEER: 0.3,
  DRIFT_TURN: 1.18, // yaw multiplier at full lock while drifting
  DRIFT_YAW_BIAS: 0.3, // drift yaw share with the stick centred (gentle arc)
  DRIFT_YAW_GAIN: 0.7, // stick authority: full lock → 1.0, full counter-steer → -0.4 (straightens out)
  DRIFT_WALL_ASSIST: 3, // m from the wall where a human's slide is gently pulled back onto the road
  DRIFT_EXIT_TIME: 0.4, // seconds of hard counter-steer that straighten the car out of a slide
  DRIFT_DRAG: 0.06, // speed bleed while sliding (a drift costs speed, the boost pays it back)
  DRIFT_ANGLE_DRAG: 0.06, // extra bleed for a tight (full-lock) slide
  DRIFT_WALL_BREAK: 4.5, // wall impact (m/s) that kills the slide and its boost
  // players' slides have real oversteer: once the tail is out it keeps coming round (more on the throttle),
  // the angle has to be held with the stick, and an over-rotated slide ends in a spin
  DRIFT_OVERSTEER: 1.4, // extra yaw per radian of slip (× turn rate)
  DRIFT_SLIP_FREE: 0.18, // slip angle (rad) the tyres hold without pushing the tail further
  DRIFT_SPIN_ANGLE: 1.0, // rad (~57°): past this the car spins out
  DRIFT_YAW_RESP: 5, // how fast the yaw follows the stick in a slide (lower = heavier, needs anticipation)
  DRIFT_LEVELS: [0.7, 1.5, 2.45],
  DRIFT_BOOST_TIME: [0.55, 1.0, 1.6],
  DRIFT_VISUAL_ANGLE: 0.38,
  BOOST_ACCEL: 30,
  BOOST_TOP_MULT: 1.3,
  NITRO_DRAIN: 32,
  OVERDRIVE_FULL: 99.5, // nitro tank level that turns the nitro button into OVERDRIVE
  OVERDRIVE_TIME: 4.5,
  OVERDRIVE_TOP_MULT: 1.5,
  NITRO_START: 35,
  NITRO_DRIFT_GAIN: 11,
  NITRO_SLIPSTREAM_GAIN: 14,
  NITRO_NEARMISS: 12,
  NITRO_JUMP: 14,
  PAD_BOOST_TIME: 1.1,
  WALL_BOUNCE: 0.35,
  CAR_BOUNCE: 0.2, // car-to-car restitution (was 0.45 — bumps knocked bots far back)
  WALL_SCRAPE: 0.6,
  GRAVITY: 30,
  JUMP_VY: 9,
  JUMP_VY_MAX: 11,
  AIR_STEER: 0.9, // rad/s of steering in the air
  AIR_ALIGN: 2.2, // how fast the nose lines up with the road while airborne
  AIR_GRIP: 2.5, // sideways velocity bleed in the air (keeps the flight path on the road)
  SPINOUT_TIME: 1.0,
  SPIN_DECEL: 0.75, // keeps ~half the speed through a spin-out (was 1.6: a hit nearly stopped the car)
  SLIPSTREAM_DIST: 26,
  SLIPSTREAM_LATERAL: 3,
  SLIPSTREAM_ACCEL: 7,
  STUCK_TIME: 3.5,
  WRONG_WAY_TIME: 1.4,
  // launch: holding gas on the grid raises the revs; GO inside the green zone = perfect start, red = overheat
  LAUNCH_RISE: 0.75, // revs per second while gas is held (from "1" on the lights → green at GO)
  LAUNCH_FALL: 1.4,
  LAUNCH_GREEN: [0.5, 0.9],
  LAUNCH_RED: 0.9,
};

// Car archetypes — stats 0..1
export const CAR_TYPES = [
  { id: 'comet', name: 'Комета GT', desc: 'Гран-туризмо: сбалансированный спорткар', speed: 0.75, accel: 0.72, handling: 0.75, weight: 1.0 },
  { id: 'viper', name: 'Гадюка X', desc: 'Среднемоторный гиперкар: максималка выше всех', speed: 1.0, accel: 0.6, handling: 0.55, weight: 0.95 },
  { id: 'titan', name: 'Титан V8', desc: 'Маслкар V8: разгон и таран', speed: 0.7, accel: 1.0, handling: 0.5, weight: 1.45 },
  { id: 'spark', name: 'Искра', desc: 'Хот-хэтч: лучшая управляемость', speed: 0.6, accel: 0.85, handling: 1.0, weight: 0.8 },
  // v4.4
  { id: 'pulse', name: 'Импульс EV', desc: 'Электро-суперкар: мгновенный разгон, тишина и плазменный буст', speed: 0.88, accel: 0.95, handling: 0.72, weight: 1.15, ev: true },
  { id: 'buran', name: 'Буран 4×4', desc: 'Раллийный внедорожник: самый тяжёлый — таранит всех', speed: 0.6, accel: 0.78, handling: 0.66, weight: 1.5 },
];

export const CAR_COLORS = [
  { name: 'Маджента', hex: 0xff2bd6 },
  { name: 'Циан', hex: 0x00e5ff },
  { name: 'Лимон', hex: 0xffd400 },
  { name: 'Токсик', hex: 0x39ff88 },
  { name: 'Апельсин', hex: 0xff6a1f },
  { name: 'Фиалка', hex: 0x8a5cff },
  { name: 'Лёд', hex: 0xe8f4ff },
  { name: 'Рубин', hex: 0xff2244 },
  { name: 'Золото', hex: 0xffc83d }, // reward for beating the Legend (never given to bots)
];

export const AI_NAMES = ['Вольт', 'Фантом', 'Рысь', 'Блиц', 'Кобра', 'Гроза', 'Сокол', 'Мираж'];

// speedMult — top speed vs the player's car; cornerSkill — share of the real turning limit used in bends;
// drift — how eagerly bots power-slide; ease — how much a leading bot lifts off; recovery — post-crash pace.
export const DIFFICULTY = [
  { id: 'easy', name: 'Лёгкий', speedMult: 0.9, cornerSkill: 0.7, itemSkill: 0.4, drift: 0.15, ease: 1, recovery: 0.5 },
  { id: 'normal', name: 'Средний', speedMult: 0.98, cornerSkill: 0.8, itemSkill: 0.7, drift: 0.55, ease: 0.6, recovery: 1 },
  { id: 'hard', name: 'Безумный', speedMult: 1.04, cornerSkill: 0.88, itemSkill: 1.0, drift: 1, ease: 0.25, recovery: 1.3 },
];

export const AI = {
  LOOKAHEAD_BASE: 9,
  LOOKAHEAD_SPEED: 0.42,
  STEER_GAIN: 2.4,
  CURVE_LOOK: 70,
  CURVE_SPEED_K: 1.25,
  LANE_DRIFT_RATE: 0.25,
  AVOID_DIST: 14,
  RUBBER_RANGE: 220, // metres behind/ahead of the best human for full catch-up / ease-off
  RUBBER_CATCHUP: 0.1, // up to +10% top speed when far behind
  RUBBER_EASE: 0.08, // up to −8% (scaled by difficulty) when far ahead
  RECOVERY_ACCEL: 0.7, // extra acceleration while a bot is below 55% of its top speed
};

export const ITEMS = {
  ROCKET: { id: 'rocket', name: 'Ракета' },
  OIL: { id: 'oil', name: 'Масло' },
  SHIELD: { id: 'shield', name: 'Щит' },
  EMP: { id: 'emp', name: 'ЭМИ-волна' },
  NITRO: { id: 'nitro', name: 'Нитро-канистра' },
  ROCKET_SPEED: 95,
  ROCKET_LIFE: 5,
  ROCKET_TURN: 4,
  OIL_LIFE: 22,
  OIL_RADIUS: 3,
  SHIELD_TIME: 7,
  EMP_RADIUS: 34,
  EMP_SLOW: 0.45,
};

export const MODES = [
  { id: 'race', name: 'Гонка', desc: 'Классика: круги, соперники, бонусы. Первый на финише забирает всё.' },
  { id: 'chase', name: 'Погоня', desc: 'Уходи от неоновой полиции! Продержись 90 секунд и не дай себя зажать.' },
  { id: 'elim', name: 'Выбывание', desc: 'Каждые 25 секунд последний вылетает. Выживает один.' },
  { id: 'gp', name: 'Гран-при', desc: 'Чемпионат из 5 трасс подряд. Очки за места, кубок — лучшему по сумме.' },
  { id: 'trial', name: 'На время', desc: 'Без соперников. Бей свой призрак лучшего круга.' },
];

export const GP = { POINTS: [10, 8, 6, 5, 4, 3, 2, 1], TRACKS: [0, 1, 2, 3, 4] };

export const ELIMINATION = { INTERVAL: 25, FIRST_DELAY: 30 };

// v4.3 «Погоня»: survive the police for TIME seconds. Capture meter fills while a patrol is within BUST_DIST
// and the player is slower than BUST_SPEED (m/s); rams add heat. Wanted level ★ rises every LEVEL_EVERY s.
export const CHASE = {
  TIME: 90, HEAD_START: 1.5, LEVEL_EVERY: 30, COPS_MIN: 2, COPS_MAX: 5, START_GAP: 42,
  COP_SPEED: [1.02, 1.07, 1.12], CATCHUP: 0.45, CATCHUP_FROM: 25, CATCHUP_RANGE: 110, PURSUIT_DIST: 32,
  BUST_DIST: 7.5, BUST_SPEED: 13, BUST_TIME: 2.2, COOL: 0.3, RAM_HEAT: 0.0025, ESCAPE_GAP: 160,
};

export const CAMERA = {
  DIST: 8.2,
  HEIGHT: 3.1,
  LOOK_AHEAD: 5,
  LOOK_HEIGHT: 1.2,
  POS_LERP: 7,
  LOOK_LERP: 10,
  NEAR_DIST: 5.6,
  NEAR_HEIGHT: 2.1,
  SHAKE_DECAY: 6,
};

// World themes. Visual-only fields: asphalt/lamp/kerb colours, wet/frost road, sky features, signage
// (6 boards: index 5 is the start-gantry banner; 3 vertical strips) — all brands are fictional.
const NEON_RUSH_SIGN = { title: 'NEON RUSH', sub: 'СТАРТ · ФИНИШ · ГРАН-ПРИ 2084', c1: '#ff2bd6', c2: '#00e5ff', icon: 'flag' };
export const THEMES = {
  sunset: {
    skyTop: 0x0a0322, skyMid: 0x3b0a5c, skyHorizon: 0xff3d7f, fog: 0x3a0d4a,
    fogNear: 90, fogFar: 1100, ground: 0x12041e, grid: 0xff2bd6, sun: true, sunColor1: 0xffe14d, sunColor2: 0xff2b8a,
    roadLine: 0x00f0ff, wall: 0xff2bd6, wall2: 0x00f0ff, hemiSky: 0x9a6bff, hemiGround: 0x2a0630, dirColor: 0xffb0d0,
    props: 'palms', particles: null, stars: true, exposure: 1.05, carLights: 0.45,
    fx: { streak: 0.22, streakCol: 0xb58cff, god: 0.85, godCol: 0xffb070, godThr: 0.95, flare: 0.75, flareCol: 0xffc890, grade: { lift: [0.035, 0.0, 0.05], gain: [1.04, 0.98, 1.0], sat: 1.08 } },
    asphalt: 0x1c1626, lamp: 0xff8fd8, kerbA: 0xff2bd6, kerbB: 0xeee6ff, barrierMetal: 0x2e2640, mountains: 'grid',
    signs: [
      { title: 'VOLT', sub: 'ЭНЕРГИЯ НОЧНОЙ ТРАССЫ', c1: '#00e5ff', c2: '#ffe14d', icon: 'bolt' },
      { title: 'ЗАКАТ 84', sub: 'РЕТРО-МОТЕЛЬ · 24/7', c1: '#ff2b8a', c2: '#ffb347', icon: 'sun' },
      { title: 'TURBO FM', sub: '104.8 · СИНТВЕЙВ НОН-СТОП', c1: '#b04dff', c2: '#00e5ff', icon: 'wave' },
      { title: 'КИБЕР КОЛА', sub: 'ОХЛАЖДАЕТ ДО НУЛЯ', c1: '#ff3355', c2: '#ffffff', icon: 'drop' },
      { title: 'ДРИФТ-КЛУБ', sub: 'КАЖДУЮ ПЯТНИЦУ · ПОЛНОЧЬ', c1: '#ffd400', c2: '#ff2bd6', icon: 'flag' },
      NEON_RUSH_SIGN,
    ],
    strips: ['МОТЕЛЬ', 'ЗАКАТ', 'ДИСКО'],
  },
  city: {
    skyTop: 0x02030c, skyMid: 0x0d0a2a, skyHorizon: 0x3a1a6a, fog: 0x120a28,
    fogNear: 60, fogFar: 750, ground: 0x07060f, grid: 0x00e5ff, sun: false,
    roadLine: 0x00e5ff, wall: 0xff00aa, wall2: 0x00e5ff, hemiSky: 0x5a7bff, hemiGround: 0x150a20, dirColor: 0x9fb8ff,
    props: 'city', particles: 'rain', stars: false, exposure: 1.1, carLights: 1.0,
    fx: { streak: 0.32, streakCol: 0x4f8dff, god: 0.3, godCol: 0xa8c4ff, godThr: 0.85, flare: 0.35, flareCol: 0xb8ccff, grade: { lift: [0.0, 0.025, 0.045], gain: [1.06, 0.97, 1.03], sat: 1.1 } },
    asphalt: 0x15141c, lamp: 0x9fd4ff, kerbA: 0xff1a4a, kerbB: 0xe6e6f0, wet: 1, barrierMetal: 0x262634, moon: true, clouds: true, cityGlow: 0xff3d9a,
    signs: [
      { title: 'НЕОН', sub: 'ШИНЫ ДЛЯ МОКРОЙ НОЧИ', c1: '#00e5ff', c2: '#ff2bd6', icon: 'drop' },
      { title: 'КИБЕР ЛАПША', sub: 'ДОСТАВКА ЗА 84 СЕКУНДЫ', c1: '#ff2bd6', c2: '#ffd400', icon: 'flame' },
      { title: 'TURBO FM', sub: '104.8 · НОЧНОЙ ЭФИР', c1: '#b04dff', c2: '#00e5ff', icon: 'wave' },
      { title: 'VOLT', sub: 'ЗАРЯДКА ЗА 5 МИНУТ', c1: '#39ff88', c2: '#00e5ff', icon: 'bolt' },
      { title: '24/7', sub: 'МАРКЕТ · МЫ НЕ СПИМ', c1: '#ffd400', c2: '#ff3355', icon: null },
      NEON_RUSH_SIGN,
    ],
    strips: ['ОТЕЛЬ', 'БАР 24', 'КИНО'],
  },
  arctic: {
    skyTop: 0x010612, skyMid: 0x062038, skyHorizon: 0x1c6f8a, fog: 0x0b2a40,
    fogNear: 80, fogFar: 950, ground: 0x0a1c2c, grid: 0x7df9ff, sun: false, aurora: true,
    roadLine: 0x7df9ff, wall: 0xb388ff, wall2: 0x7df9ff, hemiSky: 0x9fe8ff, hemiGround: 0x103040, dirColor: 0xd8f4ff,
    props: 'ice', particles: 'snow', stars: true, exposure: 1.05, carLights: 0.8,
    fx: { streak: 0.26, streakCol: 0x7fd8ff, god: 0.45, godCol: 0xbfe8ff, godThr: 0.85, flare: 0.4, flareCol: 0xcfeaff, grade: { lift: [0.0, 0.015, 0.04], gain: [0.97, 1.0, 1.05], sat: 1.02 } },
    asphalt: 0x1a2030, lamp: 0xbfeaff, kerbA: 0x2a7dff, kerbB: 0xf0f8ff, frost: 1, barrierMetal: 0x2a3444, moon: true, mountains: 'snow',
    signs: [
      { title: 'ПОЛЮС', sub: 'ГОРЯЧИЙ ЧАЙ · 5 КМ', c1: '#7df9ff', c2: '#ffffff', icon: 'flake' },
      { title: 'ЛЁД-ТЕХ', sub: 'ШИПЫ НОВОГО ПОКОЛЕНИЯ', c1: '#b388ff', c2: '#7df9ff', icon: 'bolt' },
      { title: 'TURBO FM', sub: '104.8 · СЕВЕРНЫЙ ЭФИР', c1: '#39ff88', c2: '#b388ff', icon: 'wave' },
      { title: 'СИЯНИЕ', sub: 'ОБСЕРВАТОРИЯ · БАЗА 9', c1: '#39ff88', c2: '#7df9ff', icon: 'sun' },
      { title: 'VOLT', sub: 'НЕ ЗАМЕРЗАЕТ', c1: '#00e5ff', c2: '#ffe14d', icon: 'bolt' },
      NEON_RUSH_SIGN,
    ],
    strips: ['СЕВЕР', 'БАЗА 9', 'ЛЁД'],
  },
  volcano: {
    skyTop: 0x0a0202, skyMid: 0x2a0604, skyHorizon: 0xb8300a, fog: 0x2a0a04,
    fogNear: 70, fogFar: 900, ground: 0x140504, grid: 0xff5a00, sun: true, sunColor1: 0xffd000, sunColor2: 0xff2a00,
    roadLine: 0xffb000, wall: 0xff4400, wall2: 0xffd000, hemiSky: 0xff9a60, hemiGround: 0x300804, dirColor: 0xffc090,
    props: 'rocks', particles: 'embers', stars: false, exposure: 1.0, carLights: 0.55,
    fx: { streak: 0.22, streakCol: 0xff8a40, god: 0.95, godCol: 0xff8a40, godThr: 0.9, flare: 0.55, flareCol: 0xffa060, grade: { lift: [0.04, 0.008, 0.0], gain: [1.06, 0.98, 0.92], sat: 1.1 } },
    asphalt: 0x1c1412, lamp: 0xffa040, kerbA: 0xff4a00, kerbB: 0x201410, barrierMetal: 0x30221e, smoke: true, mountains: 'lava',
    signs: [
      { title: 'МАГМА 1000°', sub: 'САМАЯ ГОРЯЧАЯ ТРАССА', c1: '#ff5a00', c2: '#ffd000', icon: 'flame' },
      { title: 'ЖАРА', sub: 'КЛИМАТ-КОНТРОЛЬ VOLT', c1: '#ffd000', c2: '#ff2a00', icon: 'sun' },
      { title: 'КИБЕР КОЛА', sub: 'ЛЕДЯНАЯ · ВСЕГДА', c1: '#00e5ff', c2: '#ffffff', icon: 'drop' },
      { title: 'TURBO FM', sub: '104.8 · ГОРЯЧИЙ ЭФИР', c1: '#ff2bd6', c2: '#ffb000', icon: 'wave' },
      { title: 'ВУЛКАН', sub: 'ШИНЫ, КОТОРЫЕ НЕ ПЛАВЯТСЯ', c1: '#ff3a00', c2: '#ffd000', icon: 'bolt' },
      NEON_RUSH_SIGN,
    ],
    strips: ['ЛАВА', 'КРАТЕР', 'ЖАРА'],
  },
  space: {
    skyTop: 0x020108, skyMid: 0x0a0624, skyHorizon: 0x2a0f5a, fog: 0x08051a,
    fogNear: 120, fogFar: 1400, ground: 0x03020a, grid: 0x8a5cff, sun: false, planet: true, nebula: true,
    roadLine: 0x39ff88, wall: 0x8a5cff, wall2: 0x39ff88, hemiSky: 0x6a58c0, hemiGround: 0x0a0618, dirColor: 0xb8b0ff,
    props: 'space', particles: 'stardust', stars: true, exposure: 1.08, floating: true, carLights: 0.9,
    fx: { streak: 0.28, streakCol: 0x9a7cff, god: 0.7, godCol: 0xc8a0ff, godThr: 0.45, flare: 0.5, flareCol: 0xd8b8ff, grade: { lift: [0.02, 0.0, 0.045], gain: [1.0, 1.02, 1.05], sat: 1.1 } },
    asphalt: 0x0a0916, lamp: 0x9a80ff, kerbA: 0x8a5cff, kerbB: 0xe8f4ff, barrierMetal: 0x262240, cityGlow: 0xff2bd6,
    signs: [
      { title: 'ОРБИТА', sub: 'ПОСЛЕДНЯЯ ЗАПРАВКА · 380 000 КМ', c1: '#39ff88', c2: '#8a5cff', icon: 'bolt' },
      { title: 'НЕВЕСОМОСТЬ', sub: 'ПРЫГАЙ ДАЛЬШЕ ВСЕХ', c1: '#8a5cff', c2: '#00e5ff', icon: 'wave' },
      { title: 'TURBO FM', sub: '104.8 · КОСМИЧЕСКИЙ ЭФИР', c1: '#ff2bd6', c2: '#39ff88', icon: 'wave' },
      { title: 'СТАНЦИЯ 7', sub: 'ДОК ДЛЯ ГОНЩИКОВ', c1: '#00e5ff', c2: '#ffffff', icon: 'sun' },
      { title: 'VOLT', sub: 'ЗАРЯЖЕН ЗВЁЗДАМИ', c1: '#ffe14d', c2: '#8a5cff', icon: 'bolt' },
      NEON_RUSH_SIGN,
    ],
    strips: ['ДОК 7', 'ОРБИТА', 'КОСМОС'],
  },
};

export const PARTICLES = { ADDITIVE_MAX: 4000, SMOKE_MAX: 1500 };

export const AUDIO = { MASTER: 0.7, MUSIC: 0.32, SFX: 0.6, ENGINE: 0.22, BPM: 112 };

export const KEYS = {
  P1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drift: ['Space'], nitro: ['ShiftLeft'], item: ['KeyE'], camera: ['KeyC'], respawn: ['KeyR'] },
  P2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drift: ['ShiftRight'], nitro: ['Enter', 'NumpadEnter'], item: ['Slash', 'ControlRight', 'Numpad0'], camera: ['Period', 'NumpadDecimal'], respawn: ['Backspace'] },
};
