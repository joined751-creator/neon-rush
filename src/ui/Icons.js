// Inline SVG icons for items (stroke-based, neon).
const wrap = (color, body) => `<svg viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px ${color})">${body}</svg>`;

export const ITEM_ICONS = {
  rocket: wrap('#ff4a6a', '<path d="M27 6c4 1 7 4 7 7L19 28l-7-7z"/><path d="M12 21l-5 1 4-6 5-1M19 28l-1 5 6-4 1-5"/><circle cx="25" cy="15" r="2.4"/><path d="M10 30l-4 4M13 32l-2 2M8 27l-2 2"/>'),
  oil: wrap('#b06cff', '<path d="M20 5c5 8 10 13 10 19a10 10 0 0 1-20 0c0-6 5-11 10-19z"/><path d="M15 25a5 5 0 0 0 5 5"/>'),
  shield: wrap('#6fe8ff', '<path d="M20 4l13 5v9c0 9-6 15-13 18C13 33 7 27 7 18V9z"/><path d="M14 19l4 4 8-8"/>'),
  emp: wrap('#5af0ff', '<circle cx="20" cy="20" r="14" stroke-dasharray="4 3"/><path d="M22 9l-7 12h6l-3 10 8-13h-6z"/>'),
  nitro: wrap('#ff7a1a', '<rect x="11" y="10" width="18" height="24" rx="4"/><path d="M16 6h8M20 6v4M16 22c0-3 4-4 4-8 2 3 4 5 4 8a4 4 0 0 1-8 0z"/>'),
};

export const ITEM_NAMES = { rocket: 'Ракета', oil: 'Масло', shield: 'Щит', emp: 'ЭМИ-волна', nitro: 'Нитро-канистра' };
