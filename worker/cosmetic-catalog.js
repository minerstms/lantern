/**
 * Server-authoritative cosmetic catalog (mirrors app/js/lantern-data.js DEFAULT_COSMETICS).
 */

export const EQUIP_SLOTS = new Set([
  'background',
  'frame',
  'effect',
  'decoration',
  'accent',
  'badge',
  'accessory',
]);

/** @type {{ id: string, name: string, category: string, cost: number, purchasable?: boolean }[]} */
export const COSMETIC_CATALOG = [
  { id: 'frame_silver', name: 'Silver Frame', category: 'frame', cost: 2 },
  { id: 'frame_gold', name: 'Gold Frame', category: 'frame', cost: 5 },
  { id: 'frame_rainbow', name: 'Rainbow Frame', category: 'frame', cost: 10 },
  { id: 'frame_legend', name: 'Lantern Legend', category: 'frame', cost: 18 },
  { id: 'frame_blue', name: 'Blue Ribbon Frame', category: 'frame', cost: 3 },
  { id: 'frame_green', name: 'Green Laurel', category: 'frame', cost: 4 },
  { id: 'frame_school', name: 'School Spirit', category: 'frame', cost: 6 },
  { id: 'frame_champion', name: 'Champion Frame', category: 'frame', cost: 14 },
  { id: 'frame_nugget_seeker', name: 'Nugget Seeker', category: 'frame', cost: 0, purchasable: false },
  { id: 'frame_hallway_hero', name: 'Hallway Hero', category: 'frame', cost: 0, purchasable: false },
  { id: 'bg_stars', name: 'Starry Sky', category: 'background', cost: 3 },
  { id: 'bg_sunset', name: 'Sunset Glow', category: 'background', cost: 5 },
  { id: 'bg_aurora', name: 'Aurora', category: 'background', cost: 8 },
  { id: 'bg_galaxy', name: 'Galaxy', category: 'background', cost: 12 },
  { id: 'bg_classroom', name: 'Classroom Warm', category: 'background', cost: 2 },
  { id: 'bg_ocean', name: 'Ocean Deep', category: 'background', cost: 5 },
  { id: 'bg_forest', name: 'Forest Path', category: 'background', cost: 6 },
  { id: 'bg_midnight', name: 'Midnight Blue', category: 'background', cost: 10 },
  { id: 'bg_arcade', name: 'Arcade Glow', category: 'background', cost: 9 },
  { id: 'bg_hidden_lantern', name: 'Hidden Lantern', category: 'background', cost: 0, purchasable: false },
  { id: 'bg_newsroom', name: 'Newsroom Spotlight', category: 'background', cost: 0, purchasable: false },
  { id: 'badge_star', name: 'Star Badge', category: 'badge', cost: 2 },
  { id: 'badge_flame', name: 'Flame Badge', category: 'badge', cost: 4 },
  { id: 'badge_crown', name: 'Crown Badge', category: 'badge', cost: 6 },
  { id: 'badge_diamond', name: 'Diamond Badge', category: 'badge', cost: 10 },
  { id: 'badge_book', name: 'Bookworm', category: 'badge', cost: 2 },
  { id: 'badge_lightning', name: 'Speed Star', category: 'badge', cost: 5 },
  { id: 'badge_heart', name: 'Kindness', category: 'badge', cost: 4 },
  { id: 'badge_trophy', name: 'Achiever', category: 'badge', cost: 8 },
  { id: 'badge_artist', name: 'Creator', category: 'badge', cost: 7 },
  { id: 'badge_secret_finder', name: 'Secret Finder', category: 'badge', cost: 0, purchasable: false },
  { id: 'acc_hat', name: 'Top Hat', category: 'accessory', cost: 4 },
  { id: 'acc_glasses', name: 'Glasses', category: 'accessory', cost: 3 },
  { id: 'acc_sparkle', name: 'Sparkle', category: 'accessory', cost: 5 },
  { id: 'acc_cap', name: 'Graduation Cap', category: 'accessory', cost: 8 },
  { id: 'acc_headphones', name: 'Headphones', category: 'accessory', cost: 3 },
  { id: 'acc_bow', name: 'Bow', category: 'accessory', cost: 4 },
  { id: 'acc_medal', name: 'Medal', category: 'accessory', cost: 6 },
  { id: 'dec_ribbon', name: 'Ribbon', category: 'decoration', cost: 3 },
  { id: 'dec_border', name: 'Star Border', category: 'decoration', cost: 6 },
  { id: 'dec_hearts', name: 'Hearts', category: 'decoration', cost: 4 },
  { id: 'dec_confetti', name: 'Confetti', category: 'decoration', cost: 3 },
  { id: 'dec_sparkles', name: 'Sparkles', category: 'decoration', cost: 5 },
  { id: 'dec_gold_star', name: 'Gold Star', category: 'decoration', cost: 7 },
  { id: 'dec_lantern_glow', name: 'Lantern Glow', category: 'decoration', cost: 0, purchasable: false },
  { id: 'accent_gold', name: 'Classic Lantern', category: 'accent', cost: 4 },
  { id: 'accent_sunset', name: 'Sunset Gold', category: 'accent', cost: 5 },
  { id: 'accent_blue', name: 'Midnight Blue', category: 'accent', cost: 3 },
  { id: 'accent_green', name: 'Forest Green', category: 'accent', cost: 5 },
  { id: 'accent_arcade', name: 'Cosmic Violet', category: 'accent', cost: 8 },
  { id: 'accent_rainbow', name: 'Rainbow', category: 'accent', cost: 7 },
  { id: 'accent_glow', name: 'Glow', category: 'accent', cost: 9 },
  { id: 'accent_silver', name: 'Silver', category: 'accent', cost: 2 },
];

const BY_ID = Object.fromEntries(COSMETIC_CATALOG.map((c) => [c.id, c]));

export function getCosmeticById(cosmeticId) {
  const id = String(cosmeticId || '').trim();
  return id ? BY_ID[id] || null : null;
}

export function isPurchasableCosmetic(cosmeticId) {
  const item = getCosmeticById(cosmeticId);
  if (!item) return false;
  if (item.purchasable === false) return false;
  return (Number(item.cost) || 0) > 0;
}

export function serverCosmeticPrice(cosmeticId) {
  const item = getCosmeticById(cosmeticId);
  if (!item || item.purchasable === false) return null;
  return Math.max(0, Math.floor(Number(item.cost) || 0));
}

export function isValidEquipSlot(category) {
  return EQUIP_SLOTS.has(String(category || '').trim());
}
