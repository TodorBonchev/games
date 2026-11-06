// Local single-player adapter. The renderer keeps its message contract while
// the authored combat engine runs in this browser instead of over a network.
// @ts-ignore Plain ESM game rules are shared with the Node regression suite.
import { createLocalSession, readLocalSave, LOCAL_SAVE_KEY } from '../../../engine/session.mjs';
export { LOCAL_SAVE_KEY };
export const hasLocalSave = (): boolean => !!readLocalSave();
export type Handler = (msg: any) => void;
export class GameSocket {
  playerId: string | null = null;
  lastSnapshot: any = null;
  rttMs = 0;
  replaced = false;
  ws: null = null;
  local: any = null;
  private handlers = new Set<Handler>();
  private timer: number | null = null;
  private chain: Promise<void> = Promise.resolve();
  private name: string;
  private lastTick = 0;
  constructor(_unused: string, name: string){this.name=name;}
  connect(){
    if(this.local)return;
    const debug=new URLSearchParams(location.search).get('debug')==='1';
    let storage: Storage | null=null;try{storage=window.localStorage;}catch{/* Private browsing can deny saves while play remains available. */}
    this.local=createLocalSession({name:this.name,storage,debug,onMessage:(msg:any)=>{
      if(msg.type==='welcome')this.playerId=msg.playerId;
      if(msg.type==='snapshot')this.lastSnapshot=msg;
      for(const handler of this.handlers)handler(msg);
    }});
    this.local.start();
    this.local.setBackgroundPaused(document.hidden);
    this.lastTick=performance.now();
    this.timer=window.setInterval(()=>{const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-this.lastTick)/1000));this.lastTick=now;if(!document.hidden)this.local?.tick(dt);},66);
    addEventListener('pagehide',this.save);
    document.addEventListener('visibilitychange',this.onVisibility);
    if(debug)(window as any).__selvaLocal={socket:this,engine:this.local};
  }
  private onVisibility=()=>{this.lastTick=performance.now();this.local?.setBackgroundPaused(document.hidden);if(document.hidden)this.save();};
  save=()=>{return this.local?.save()??false;};
  setPaused(value:boolean){this.local?.setPaused(value);this.lastTick=performance.now();}
  dispose(){if(this.timer!=null)clearInterval(this.timer);this.timer=null;removeEventListener('pagehide',this.save);document.removeEventListener('visibilitychange',this.onVisibility);this.local?.dispose();this.local=null;}
  on(handler:Handler){this.handlers.add(handler);return()=>this.handlers.delete(handler);}
  send(msg:object){this.chain=this.chain.then(()=>this.local?.dispatch(msg)).catch((error:any)=>{console.error('[solo]',error);for(const handler of this.handlers)handler({type:'error',code:'local_action',message:'That action could not be completed.'});});}
  move(x: number, y: number) {
    this.send({ type: "move", x, y });
  }
  /** Date.now() of the last attack packet (the server's swing cooldown runs from it). */
  lastAttackAt = 0;
  /** combo: this swing's place in the 3-hit chain (2 = the overhead finisher). */
  attack(targetId: string, combo = 0) {
    this.lastAttackAt = Date.now();
    this.send({ type: "attack", targetId, combo });
  }
  duelChallenge(targetId: string) {
    this.send({ type: "duel_challenge", targetId });
  }
  duelRespond(fromId: string, accept: boolean) {
    this.send({ type: "duel_respond", fromId, accept });
  }
  duelCancel() {
    this.send({ type: "duel_cancel" });
  }
  pvpQueue(join: boolean) {
    this.send({ type: "pvp_queue", join });
  }
  pvpLeaderboard() {
    this.send({ type: "pvp_leaderboard" });
  }
  cast(spellId: string, aim?: { x?: number; y?: number }) {
    this.send({
      type: "cast",
      spellId,
      aimX: aim?.x,
      aimY: aim?.y,
    });
  }
  skillLearn(skillId: string) {
    this.send({ type: "skill_learn", skillId });
  }
  skillLoadout(slots: (string | null)[]) {
    this.send({ type: "skill_loadout", slots });
  }
  skillRespec() {
    this.send({ type: "skill_respec" });
  }
  devGrantXp(amount: number) {
    this.send({ type: "dev_grant_xp", amount });
  }
  interact(targetId: string) {
    this.send({ type: "interact", targetId });
  }
  travel(toCanto: string, opts?: { bypassGates?: boolean }) {
    this.send({
      type: "travel",
      toCanto,
      ...(opts?.bypassGates ? { bypassGates: true } : {}),
    });
  }
  pickup(lootId: string) {
    this.send({ type: "pickup", lootId });
  }
  ahBrowse() {
    this.send({ type: "ah_browse" });
  }
  ahList(itemId: string, priceAsh: number) {
    this.send({ type: "ah_list", itemId, priceAsh });
  }
  ahBuy(listingId: string) {
    this.send({ type: "ah_buy", listingId });
  }
  ahBid(listingId: string, bidAsh: number) {
    this.send({ type: "ah_bid", listingId, bidAsh });
  }
  ahCancel(listingId: string) {
    this.send({ type: "ah_cancel", listingId });
  }
  claimDaily() {
    this.send({ type: "claim_daily" });
  }
  equip(itemId: string) {
    this.send({ type: "equip", itemId });
  }
  unequip(opts: { itemId?: string; slot?: string }) {
    this.send({ type: "unequip", itemId: opts.itemId, slot: opts.slot });
  }
  salvageBag() {
    this.send({ type: "salvage_bag" });
  }
  stashPut(itemId: string) {
    this.send({ type: "stash_put", itemId });
  }
  stashTake(itemId: string) {
    this.send({ type: "stash_take", itemId });
  }
  sip() {
    this.send({ type: "sip" });
  }
  dash(x: number, y: number) {
    this.send({ type: "dash", x, y });
  }
}
