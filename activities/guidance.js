const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
export function flightGuidance(player, guide) {
  if (!guide) return 'All routes surveyed. Enjoy the flight.';
  const dx=guide.x-player.x,dz=guide.z-player.z,dy=(guide.y??player.y)-player.y;
  const angle=player.heading-Math.atan2(dx,dz);
  const arrow=arrows[((Math.round(angle/(Math.PI/4))%8)+8)%8];
  return `${arrow} ${Math.round(Math.hypot(dx,dz))}m · ${Math.abs(dy)<1?'Altitude aligned':`${dy>0?'Rise':'Descend'} ${Math.round(Math.abs(dy))}m`} · ${guide.instruction||guide.name||'Follow the guide'}`;
}
export function reefGuidance(state, route) {
  const gate=route.gates.find(g=>g.distance>state.distance);
  if (!gate) return 'Final stretch — bring the ribbon home!';
  const dx=gate.x-state.x,dy=gate.y-state.y;
  return `Next arch: ${Math.abs(dx)<.45?'centered':dx>0?'→ right':'← left'} · ${Math.abs(dy)<.4?'height aligned':dy>0?'↑ rise':'↓ dive'} · ${Math.max(0,(gate.distance-state.distance)/6).toFixed(1)}s`;
}
export function hopGuidance(state, preview) {
  if (!preview?.points?.length) return 'Pull a little farther to preview a hop.';
  const landing=preview.landing;
  if (!landing) return 'Splash ahead — adjust the arc before releasing.';
  if (landing.padId<=state.padId) return 'Returning to this pad — aim higher for the next one.';
  return `${landing.perfect?'Perfect landing':'Safe landing'} · pad ${landing.padId} · release to hop`;
}
export function nibRoute(state, level) {
  const finish=level.flagX??level.w-1;
  const progress=['flag','cleared','won'].includes(state.mode)?1:Math.max(0,Math.min(1,state.player.x/finish));
  return { value:Math.round(progress*1000)/1000,label:`World progress ${Math.round(progress*100)}%`,
    markers:(state.stars||[]).map(s=>({position:Math.max(0,Math.min(1,s.x/finish)),label:s.collected?'Star collected':s.x<state.player.x?'Missed star — head back':'Star ahead',complete:!!s.collected,missed:!s.collected&&s.x<state.player.x})) };
}
