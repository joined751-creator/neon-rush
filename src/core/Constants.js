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
  DRIFT_GRIP: 1.4,
  DRIFT_MIN_SPEED: 16,
  DRIFT_LEVELS: [0.9, 1.9, 3.0],
  DRIFT_BOOST_TIME: [0.55, 1.0, 1.6],
  DRIFT_VISUAL_ANGLE: 0.38,
  BOOST_ACCEL: 30,
  BOOST_TOP_MULT: 1.3,
  NITRO_DRAIN: 32,
  NITRO_START: 35,
  NITRO_DRIFT_GAIN: 9,
  NITRO_SLIPSTREAM_GAIN: 12,
  NITRO_NEARMISS: 10,
  NITRO_JUMP: 12,
  PAD_BOOST_TIME: 1.1,
  WALL_BOUNCE: 0.35,
  WALL_SCRAPE: 0.6,
  GRAVITY: 30,
  JUMP_VY: 9,
  SPINOUT_TIME: 1.25,
  SLIPSTREAM_DIST: 26,
  SLIPSTREAM_LATERAL: 3,
  SLIPSTREAM_ACCEL: 7,
  STUCK_TIME: 3.5,
  WRONG_WAY_TIME: 1.4,
  PERFECT_START_WINDOW: 0.35,
};

// Car archetypes — stats 0..1
export const CAR_TYPES = [
  { id: 'comet', name: 'Комета GT', desc: 'Гран-туризмо: сбалансированный спорткар', speed: 0.75, accel: 0.72, handling: 0.75, weight: 1.0 },
  { id: 'viper', name: 'Гадюка X', desc: 'Среднемоторный гиперкар: максималка выше всех', speed: 1.0, accel: 0.6, handling: 0.55, weight: 0.95 },
  { id: 'titan', name: 'Титан V8', desc: 'Маслкар V8: разгон и таран', speed: 0.7, accel: 1.0, handling: 0.5, weight: 1.45 },
  { id: 'spark', name: 'Искра', desc: 'Хот-хэтч: лучшая управляемость', speed: 0.6, accel: 0.85, handling: 1.0, weight: 0.8 },
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
];

export const AI_NAMES = ['Вольт', 'Фантом', 'Рысь', 'Блиц', 'Кобра', 'Гроза', 'Сокол', 'Мираж'];

export const DIFFICULTY = [
  { id: 'easy', name: 'Лёгкий', speedMult: 0.86, cornerSkill: 0.8, itemSkill: 0.4 },
  { id: 'normal', name: 'Средний', speedMult: 0.95, cornerSkill: 0.92, itemSkill: 0.7 },
  { id: 'hard', name: 'Безумный', speedMult: 1.04, cornerSkill: 1.0, itemSkill: 1.0 },
];

export const AI = {
  LOOKAHEAD_BASE: 9,
  LOOKAHEAD_SPEED: 0.42,
  STEER_GAIN: 2.4,
  CURVE_LOOK: 70,
  CURVE_SPEED_K: 1.25,
  LANE_DRIFT_RATE: 0.25,
  AVOID_DIST: 14,
  RUBBER_FAR: 160,
  RUBBER_SLOW: 0.9,
  RUBBER_FAST: 1.1,
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
  { id: 'elim', name: 'Выбывание', desc: 'Каждые 25 секунд последний вылетает. Выживает один.' },
  { id: 'gp', name: 'Гран-при', desc: 'Чемпионат из 4 трасс подряд. Очки за места, кубок — лучшему по сумме.' },
  { id: 'trial', name: 'На время', desc: 'Без соперников. Бей свой призрак лучшего круга.' },
];

export const GP = { POINTS: [10, 8, 6, 5, 4, 3, 2, 1], TRACKS: [0, 1, 2, 3] };

export const ELIMINATION = { INTERVAL: 25, FIRST_DELAY: 30 };

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

export const THEMES = {
  sunset: {
    skyTop: 0x0a0322, skyMid: 0x3b0a5c, skyHorizon: 0xff3d7f, fog: 0x3a0d4a,
    fogNear: 90, fogFar: 1100, ground: 0x12041e, grid: 0xff2bd6, sun: true, sunColor1: 0xffe14d, sunColor2: 0xff2b8a,
    roadLine: 0x00f0ff, wall: 0xff2bd6, wall2: 0x00f0ff, hemiSky: 0x9a6bff, hemiGround: 0x2a0630, dirColor: 0xffb0d0,
    props: 'palms', particles: null, stars: true, exposure: 1.05,
  },
  city: {
    skyTop: 0x02030c, skyMid: 0x0d0a2a, skyHorizon: 0x3a1a6a, fog: 0x120a28,
    fogNear: 60, fogFar: 750, ground: 0x07060f, grid: 0x00e5ff, sun: false,
    roadLine: 0x00e5ff, wall: 0xff00aa, wall2: 0x00e5ff, hemiSky: 0x5a7bff, hemiGround: 0x150a20, dirColor: 0x9fb8ff,
    props: 'city', particles: 'rain', stars: false, exposure: 1.1,
  },
  arctic: {
    skyTop: 0x010612, skyMid: 0x062038, skyHorizon: 0x1c6f8a, fog: 0x0b2a40,
    fogNear: 80, fogFar: 950, ground: 0x0a1c2c, grid: 0x7df9ff, sun: false, aurora: true,
    roadLine: 0x7df9ff, wall: 0xb388ff, wall2: 0x7df9ff, hemiSky: 0x9fe8ff, hemiGround: 0x103040, dirColor: 0xd8f4ff,
    props: 'ice', particles: 'snow', stars: true, exposure: 1.05,
  },
  volcano: {
    skyTop: 0x0a0202, skyMid: 0x2a0604, skyHorizon: 0xb8300a, fog: 0x2a0a04,
    fogNear: 70, fogFar: 900, ground: 0x140504, grid: 0xff5a00, sun: true, sunColor1: 0xffd000, sunColor2: 0xff2a00,
    roadLine: 0xffb000, wall: 0xff4400, wall2: 0xffd000, hemiSky: 0xff9a60, hemiGround: 0x300804, dirColor: 0xffc090,
    props: 'rocks', particles: 'embers', stars: false, exposure: 1.0,
  },
};

export const PARTICLES = { ADDITIVE_MAX: 4000, SMOKE_MAX: 1500 };

export const AUDIO = { MASTER: 0.7, MUSIC: 0.32, SFX: 0.6, ENGINE: 0.22, BPM: 112 };

export const KEYS = {
  P1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drift: ['Space'], nitro: ['ShiftLeft'], item: ['KeyE'], camera: ['KeyC'], respawn: ['KeyR'] },
  P2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drift: ['ShiftRight'], nitro: ['Enter', 'NumpadEnter'], item: ['Slash', 'ControlRight', 'Numpad0'], camera: ['Period', 'NumpadDecimal'], respawn: ['Backspace'] },
};
