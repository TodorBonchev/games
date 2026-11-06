// There are no other players in this edition. The shared combat hooks remain
// explicit no-ops so the PvE engine does not need a separate combat fork.
export const pvpIsDown = () => false;
export const pvpAreOpponents = () => false;
export const pvpCanHit = () => false;
export const pvpAimTarget = () => null;
export const pvpRoomFields = () => ({});
export const pvpRemote = () => null;
export const pvpYou = () => null;
export const pvpHit = () => false;
export const pvpMelee = () => false;
export const pvpLandBolt = () => false;
export const pvpBurst = () => {};
export const pvpDashCut = () => {};
export const pvpBreakInvuln = () => {};
export const pvpOnJoin = () => {};
export const pvpOnRoomLeave = () => {};
export const pvpTick = () => {};
export const pvpTouch = () => {};
