// The auction house is a local travelling market. Its stock is generated once
// per game launch; browsing never rerolls prices or restores purchased offers.
import { players, BAG_MAX, vendorAsh } from "./ledger.mjs";
import { loadPool, loadAffixPools } from "./content.mjs";
import { contentSlotToEquip, itemStatBonus } from "./loot.mjs";
import { mulberry32, randInt, newSeed } from "./rng.mjs";

const offers = new Map();
const SLOTS = ["weapon", "armor", "helm", "boots", "gloves", "offhand"];
const RARITIES = ["normal", "magic", "magic", "magic", "rare", "rare", "rare", "set", "unique"];
const PRICE_RANGES = { normal:[20,180], magic:[80,900], rare:[280,2800], set:[900,12000], unique:[2000,22000] };
const TRADERS = ["The Lantern Keeper", "Wayfarer's Exchange", "The Quiet Ferryman", "Ashwood Curios", "The Pilgrim's Cart", "The Bronze Scale"];
let started = false, generation = 0;

function copyItem(item) {
  return { ...item, affixes:[...(item.affixes || [])], rolledStats:{ ...item.rolledStats } };
}
function copyOffer(offer) {
  return { ...offer, item:copyItem(offer.item), bids:[] };
}
function uniqueSessionId() {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${newSeed().toString(36)}-${generation}`;
}
function randomStats(item, rng) {
  const baseline = itemStatBonus(item);
  const strength = { normal:1, magic:2, rare:3, set:4, unique:5 }[item.rarity];
  const range = value => value ? randInt(rng, Math.max(1, Math.floor(value * .6)), Math.ceil(value * 1.6) + strength) : 0;
  const stats = { dmg:range(baseline.dmg), maxHp:range(baseline.maxHp), armor:range(baseline.armor) };
  // Secondary bonuses make two pieces of the same base and rarity distinct.
  if (rng() < .48) stats.maxHp += randInt(rng, 1, 5 * strength);
  if (rng() < .38) stats.dmg += randInt(rng, 1, strength + 1);
  if (rng() < .35) stats.armor += randInt(rng, 1, strength + 1);
  return stats;
}
function makeStockItem(base, rarity, rng, id) {
  const names = loadAffixPools();
  const pick = values => values[randInt(rng, 0, values.length - 1)];
  const affixes = [];
  if (rarity !== "normal") {
    const count = rarity === "magic" ? 1 : randInt(rng, 2, 4);
    const pool = [...names.rare_affixes];
    while (affixes.length < count && pool.length) affixes.push(pool.splice(randInt(rng, 0, pool.length - 1), 1)[0]);
  }
  let name = base.name;
  if (rarity === "magic") name = `${pick(names.magic_prefixes)} ${name} ${pick(names.magic_suffixes)}`;
  else if (rarity === "rare") name = `${name} [${pick(names.rare_affixes)}]`;
  else if (rarity === "set") name = `${pick(names.set_names)}: ${name}`;
  else if (rarity === "unique") name = `${pick(names.unique_names)} — ${name}`;
  const item = { id, name, rarity, itemPool:"inferno_bases_t1", seed:randInt(rng, 0, 0xffffffff), affixes, soulbound:false, qty:1, baseId:base.baseId, slot:base.slot, equipSlot:null };
  item.rolledStats = randomStats(item, rng);
  return item;
}

/** Explicit boot operation. Call once when starting the local game, never on Browse. */
export function refreshMarket({ seed, count = 24 } = {}) {
  generation++;
  const rng = mulberry32(Number.isInteger(seed) ? seed >>> 0 : newSeed());
  const size = Number.isSafeInteger(count) ? Math.max(6, Math.min(48, count)) : 24;
  const bases = (loadPool("inferno_bases_t1")?.items || []).filter(base => contentSlotToEquip(base.slot));
  if (!bases.length) throw new Error("The local market needs wearable item bases.");
  const session = uniqueSessionId(), now = Date.now();
  offers.clear(); started = true;
  for (let index = 0; index < size; index++) {
    const slot = SLOTS[index % SLOTS.length];
    const matching = bases.filter(base => base.slot === slot);
    const pool = index < SLOTS.length && matching.length ? matching : bases;
    const base = pool[randInt(rng, 0, pool.length - 1)];
    // Every launch offers a few inexpensive pieces as well as rarer finds.
    const rarity = index < 3 ? "normal" : index < 6 ? "magic" : RARITIES[randInt(rng, 0, RARITIES.length - 1)];
    const [minimum, maximum] = PRICE_RANGES[rarity];
    const item = makeStockItem(base, rarity, rng, `market-item-${session}-${index}`);
    const id = `market-${session}-${index}`;
    offers.set(id, { id, sellerId:"local-market", sellerName:TRADERS[randInt(rng, 0, TRADERS.length - 1)], item, priceAsh:randInt(rng, minimum, maximum), highestBidAsh:0, highestBidderId:null, createdAt:now, bids:[] });
  }
  return getListings();
}
export const startMarketSession = refreshMarket;

/** Compatibility with the old boot API: the stock is never restored from a server. */
export async function hydrateListings() { if (!started) refreshMarket(); }
export function browse() { return [...offers.values()].map(copyOffer); }
export function getListings() { return browse(); }

export async function buy(buyerId, listingId) {
  const offer = offers.get(listingId);
  if (!offer) return { ok:false, reason:"not_found" };
  const buyer = players.get(buyerId);
  if (!buyer || !Array.isArray(buyer.inventory)) return { ok:false, reason:"no_player" };
  if (!Number.isSafeInteger(buyer.ash) || buyer.ash < offer.priceAsh) return { ok:false, reason:"insufficient_ash" };
  if (buyer.inventory.filter(item => !item?.equipSlot).length >= BAG_MAX) return { ok:false, reason:"bag_full" };
  if (buyer.inventory.some(item => item?.id === offer.item.id)) return { ok:false, reason:"already_owned" };
  // No await between validating, debiting and removing the offer: two rapid
  // taps cannot buy one lot twice or overspend the same local purse.
  const item = copyItem(offer.item);
  buyer.ash -= offer.priceAsh;
  buyer.inventory.push(item);
  offers.delete(listingId);
  return { ok:true, item, paidAsh:offer.priceAsh, taxAsh:0, sellerNetAsh:0, touched:[buyerId] };
}

/** Legacy bid inputs resolve immediately at the displayed fixed asking price. */
export async function bid(bidderId, listingId, bidAsh) {
  if (!Number.isSafeInteger(bidAsh) || bidAsh <= 0) return { ok:false, reason:"bad_bid" };
  const offer = offers.get(listingId);
  if (!offer) return { ok:false, reason:"not_found" };
  if (bidAsh < offer.priceAsh) return { ok:false, reason:"below_ask" };
  return buy(bidderId, listingId);
}

/** Sell spare gear to the market now; a made-up asking price cannot mint Ash. */
export async function listItem(sellerId, itemId, _askingPrice) {
  const seller = players.get(sellerId);
  if (!seller || !Array.isArray(seller.inventory)) return { ok:false, reason:"no_player" };
  const index = seller.inventory.findIndex(item => item?.id === itemId);
  if (index < 0) return { ok:false, reason:"item_not_found" };
  const item = seller.inventory[index];
  if (item.equipSlot) return { ok:false, reason:"equipped" };
  if (item.soulbound) return { ok:false, reason:"soulbound" };
  const qty = Number(item.qty ?? 1), ash = vendorAsh(item);
  if (!Number.isSafeInteger(qty) || qty < 1 || !Number.isSafeInteger(ash) || ash < 1 || !Number.isSafeInteger(seller.ash) || seller.ash < 0 || !Number.isSafeInteger(seller.ash + ash)) return { ok:false, reason:"bad_item" };
  seller.inventory.splice(index, 1); seller.ash += ash;
  return { ok:true, item, soldAsh:ash, paidAsh:ash, listing:{ item, priceAsh:ash, status:"sold" }, touched:[sellerId] };
}

/** Local NPC stock has no player-owned listings or unsettled bid escrow. */
export async function cancelListing(_sellerId, listingId) {
  return { ok:false, reason:offers.has(listingId) ? "not_owner" : "not_found" };
}
