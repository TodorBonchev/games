// Authored content bundled with the single-player game. No runtime fetch or server.
import inferno01 from "../content/cantos/inferno_01.json" with { type: "json" };
import inferno05 from "../content/cantos/inferno_05.json" with { type: "json" };
import inferno06 from "../content/cantos/inferno_06.json" with { type: "json" };
import inferno07 from "../content/cantos/inferno_07.json" with { type: "json" };
import inferno08 from "../content/cantos/inferno_08.json" with { type: "json" };
import inferno31 from "../content/cantos/inferno_31.json" with { type: "json" };
import packCommon from "../content/drops/tables/inferno_pack_common.json" with { type: "json" };
import fiorino from "../content/drops/tables/avarice_fiorino.json" with { type: "json" };
import packWeights from "../content/drops/tables/avarice_pack_weights.json" with { type: "json" };
import bases from "../content/drops/pools/inferno_bases_t1.json" with { type: "json" };
import affixes from "../content/drops/pools/inferno_affixes.json" with { type: "json" };
import emits from "../content/economy/emit_rates.json" with { type: "json" };
import burns from "../content/economy/burns.json" with { type: "json" };

export const CONTENT_ROOT = "bundled";
const tables = {inferno_pack_common:packCommon, avarice_fiorino:fiorino, avarice_pack_weights:packWeights};
export const loadDropTable = id => tables[id] || packCommon;
export const loadPool = id => id === 'inferno_bases_t1' ? bases : null;
export const loadAffixPools = () => affixes;
export const loadEmitRates = () => emits;
export const loadBurns = () => burns;
// The old empty multiplayer pit becomes an optional solo trial.
const soloHub=structuredClone(inferno01);
soloHub.geo.exits.find(exit=>exit.to_canto==='inferno_31').label='← Giants’ Trial';
soloHub.geo.pois.find(poi=>poi.id==='hub_ah').hint='Browse fresh equipment offers and sell spare gear for Ash';
const soloWell = structuredClone(inferno31);
soloWell.role = 'combat';
soloWell.packs = [{id:'giants_trial', archetype:'gale_champion', champion:true, count:3, anchor:{x:48,y:40}, drop_table:'inferno_pack_common'}];
soloWell.bosses=[{id:'giants_keeper',name:'Keeper of Chains',anchor:{x:48,y:22},drop_table:'inferno_pack_common',first_clear_emit:true}];
soloWell.first_clear = {enabled:true};
soloWell.loot_density = 'normal';
export const CANTOS = {inferno_01:soloHub, inferno_05:inferno05, inferno_06:inferno06, inferno_07:inferno07, inferno_08:inferno08, inferno_31:soloWell};
export function loadCanto(id){const canto=CANTOS[id];if(!canto)throw new Error('Unknown canto '+id);return canto;}
