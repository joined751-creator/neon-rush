// Inline SVG icons (stroke-based, neon). Items + UI glyphs (modes, HUD markers).
const wrap = (color, body) => `<svg viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px ${color})">${body}</svg>`;

export const ITEM_ICONS = {
  rocket: wrap('#ff4a6a', '<path d="M27 6c4 1 7 4 7 7L19 28l-7-7z"/><path d="M12 21l-5 1 4-6 5-1M19 28l-1 5 6-4 1-5"/><circle cx="25" cy="15" r="2.4"/><path d="M10 30l-4 4M13 32l-2 2M8 27l-2 2"/>'),
  oil: wrap('#b06cff', '<path d="M20 5c5 8 10 13 10 19a10 10 0 0 1-20 0c0-6 5-11 10-19z"/><path d="M15 25a5 5 0 0 0 5 5"/>'),
  shield: wrap('#6fe8ff', '<path d="M20 4l13 5v9c0 9-6 15-13 18C13 33 7 27 7 18V9z"/><path d="M14 19l4 4 8-8"/>'),
  emp: wrap('#5af0ff', '<circle cx="20" cy="20" r="14" stroke-dasharray="4 3"/><path d="M22 9l-7 12h6l-3 10 8-13h-6z"/>'),
  nitro: wrap('#ff7a1a', '<rect x="11" y="10" width="18" height="24" rx="4"/><path d="M16 6h8M20 6v4M16 22c0-3 4-4 4-8 2 3 4 5 4 8a4 4 0 0 1-8 0z"/>'),
};

export const ITEM_NAMES = { rocket: 'Ракета', oil: 'Масло', shield: 'Щит', emp: 'ЭМИ-волна', nitro: 'Нитро-канистра' };
export const ITEM_COLORS = { rocket: '#ff4a6a', oil: '#b06cff', shield: '#6fe8ff', emp: '#5af0ff', nitro: '#ff7a1a' };

const ui = (body, sw = 2) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Game-mode glyphs for the setup cards. */
export const MODE_ICONS = {
  race: ui('<path d="M7 28V5"/><path d="M7 6h18l-3 5 3 5H7"/><path d="M12 6v10M17 6v10M7 11h17" stroke-width="1.2" opacity=".55"/>'),
  elim: ui('<circle cx="16" cy="16" r="11"/><path d="M16 9v7l5 3"/><path d="M5 5l4 4M27 5l-4 4" opacity=".7"/>'),
  gp: ui('<path d="M10 5h12v6a6 6 0 0 1-12 0z"/><path d="M10 7H5c0 4 2 6 5 6M22 7h5c0 4-2 6-5 6"/><path d="M16 17v5M11 27h10M12 27l1-5h6l1 5"/>'),
  trial: ui('<circle cx="16" cy="18" r="10"/><path d="M16 18l4-5M13 4h6M16 4v4M25 9l2-2"/><path d="M16 11v1M23 18h-1M9 18h1M16 25v-1" opacity=".6"/>'),
};

export const UI_ICONS = {
  chevR: ui('<path d="M12 7l9 9-9 9"/>', 2.6),
  chevL: ui('<path d="M20 7l-9 9 9 9"/>', 2.6),
  uturn: ui('<path d="M22 26V13a6 6 0 0 0-12 0v6"/><path d="M5 15l5 5 5-5"/>', 2.6),
  flag: ui('<path d="M7 28V5"/><path d="M7 6h18l-3 5 3 5H7"/>'),
  bolt: ui('<path d="M18 3L7 18h8l-2 11 12-16h-8z"/>'),
  lock: ui('<rect x="7" y="14" width="18" height="13" rx="2"/><path d="M11 14v-4a5 5 0 0 1 10 0v4"/>'),
  star: ui('<path d="M16 4l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L16 22.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z"/>'),
};
