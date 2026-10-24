// Lightweight local avoidance for the island's static circle/box colliders.
// A short sweep is evaluated at 6 Hz per enemy, independent of render rate.
// Keeping the chosen turning side prevents left/right oscillation at a trunk.
export function createEnemyNavigator(circles, boxes) {
  const angles = [0, .4, -.4, .8, -.8, 1.2, -1.2, 1.55, -1.55, 1.9, -1.9];
  function blocked(x, z, dx, dz, length) {
    for (const c of circles) {
      const cx = c.x - x, cz = c.z - z, along = cx * dx + cz * dz;
      if (along <= 0 || along > length + c.r + .42) continue;
      const t = Math.min(length, along), px = cx - dx * t, pz = cz - dz * t;
      if (px * px + pz * pz < (c.r + .42) ** 2) return true;
    }
    for (const b of boxes) {
      // A collision correction may leave us in the extra steering margin.
      // Permit movement away from that face so the enemy can get unstuck.
      if ((x < b.x-b.hx && dx <= 0) || (x > b.x+b.hx && dx >= 0) ||
          (z < b.z-b.hz && dz <= 0) || (z > b.z+b.hz && dz >= 0)) continue;
      let near = 0, far = length;
      for (const [start, direction, min, max] of [[x, dx, b.x-b.hx-.42, b.x+b.hx+.42], [z, dz, b.z-b.hz-.42, b.z+b.hz+.42]]) {
        if (Math.abs(direction) < .00001) { if (start < min || start > max) { far = -1; break; } }
        else { const a = (min-start)/direction, c = (max-start)/direction; near = Math.max(near, Math.min(a,c)); far = Math.min(far, Math.max(a,c)); }
      }
      if (near <= far && far > .02) return true;
    }
    return false;
  }
  return (position, target, state, dt) => {
    const dx = target.x-position.x, dz = target.z-position.z, distance = Math.hypot(dx,dz);
    state.navTimer = (state.navTimer || 0)-dt;
    if (state.navTimer <= 0 || !Number.isFinite(state.navX)) {
      state.navTimer = .16;
      const heading = Math.atan2(dx,dz), lookahead = Math.min(distance,1.4);
      let best = -Infinity, chosen = 0, found = false;
      for (const angle of angles) {
        const x = Math.sin(heading+angle), z = Math.cos(heading+angle);
        if (blocked(position.x,position.z,x,z,lookahead)) continue;
        if (angle === 0) { chosen=0; state.navX=x; state.navZ=z; found=true; break; }
        const score = Math.cos(angle) + (state.navSide && Math.sign(angle)===state.navSide ? 1 : 0);
        if (score > best) { best=score; chosen=angle; state.navX=x; state.navZ=z; found=true; }
      }
      if (found) state.navSide = Math.abs(chosen)>.1 ? Math.sign(chosen) : 0;
      else { state.navX=dx/(distance||1); state.navZ=dz/(distance||1); }
    }
    return state;
  };
}
