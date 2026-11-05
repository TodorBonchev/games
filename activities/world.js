import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DISTRICTS, byId } from './catalog.js';

export const ACTIVITY_SAFE_RADIUS = 4.4;
export const ACTIVITY_SPACING = 6.2;
const TAU = Math.PI * 2;
const ANCHORS = {
  1: [[-21, 12], [-6, 25], [18, 21], [27, -8], [7, -25], [-3, -5]],
  2: [[-25, 14], [-7, 26], [22, 23], [28, -9], [7, -25], [3, -3]],
};
const OFFSETS = [[0, 0], [-5.7, -5.4], [5.7, -5.4], [-5.7, 5.4], [5.7, 5.4]];

// World decoration is randomized, so anchors alone are not valid spawn locations.
// Every terminal and its approach are checked against the actual built terrain.
export function placeActivityStations({ groundH, islandD, lavaF = () => 0, onLand = () => true, level = 1 }) {
  const stations = [], anchors = ANCHORS[level] || ANCHORS[1];
  function terrainSafe(x, z) {
    const y = groundH(x, z);
    if (!Number.isFinite(y) || y < .55 || islandD(x, z) >= .78 || lavaF(x, z) >= .02 || !onLand(x, z, 1.5)) return false;
    for (let index = 0; index < 8; index++) {
      const angle = index * TAU / 8, dx = Math.cos(angle), dz = Math.sin(angle);
      const near = groundH(x + dx * .8, z + dz * .8);
      const edgeX = x + dx * 2.3, edgeZ = z + dz * 2.3, edge = groundH(edgeX, edgeZ);
      if (Math.abs(near - y) > .7 || Math.abs(edge - y) > 1.4 || edge < .4 ||
        islandD(edgeX, edgeZ) >= .86 || lavaF(edgeX, edgeZ) >= .02 || !onLand(edgeX, edgeZ, .45)) return false;
    }
    return true;
  }
  function clear(x, z) {
    return stations.every(other => Math.hypot(other.x - x, other.z - z) >= ACTIVITY_SPACING) && terrainSafe(x, z);
  }
  function search(x, z, phase) {
    if (clear(x, z)) return { x, z };
    // Nearest-first rings keep five activities recognizable as one district.
    for (let radius = 1.25; radius <= 16.25; radius += 1.25) {
      const count = Math.ceil(TAU * radius / 1.5);
      for (let index = 0; index < count; index++) {
        const angle = phase + index * TAU / count;
        const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
        if (clear(px, pz)) return { x: px, z: pz };
      }
    }
    // Very dense random prop layouts may need a wider search. Never relax
    // lava, slope, collision, or separation requirements to place a station.
    let best = null, cost = Infinity;
    for (let pz = -42; pz <= 42; pz += 1.4) for (let px = -42; px <= 42; px += 1.4) {
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < cost && clear(px, pz)) { best = { x: px, z: pz }; cost = d; }
    }
    return best;
  }
  for (let districtIndex = 0; districtIndex < DISTRICTS.length; districtIndex++) {
    const district = DISTRICTS[districtIndex], anchor = anchors[districtIndex];
    for (let index = 0; index < district.missions.length; index++) {
      const id = district.missions[index], [dx, dz] = OFFSETS[index];
      const point = search(anchor[0] + dx, anchor[1] + dz, districtIndex * .63 + index * 1.7);
      if (!point) throw new Error(`No safe ground for activity station ${id}`);
      stations.push({ ...byId.get(id), ...point, y: groundH(point.x, point.z), district: district.id,
        districtTitle: district.title, districtIndex, number: stations.length + 1,
        heading: Math.atan2(-point.x, -point.z), radius: ACTIVITY_SAFE_RADIUS, completed: false });
    }
  }
  return stations;
}

export function createActivityWorld({ scene, groundH, islandD, lavaF = () => 0, onLand, level = 1, progress = {} }) {
  const stations = placeActivityStations({ groundH, islandD, lavaF, onLand, level });
  const root = new THREE.Group(); root.name = 'activity-outposts'; scene.add(root);
  const geometries = [], materials = [], textures = [];
  const bodies = [], screens = [], rings = [], ringRanges = [];
  const color = new THREE.Color(), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), unit = new THREE.Vector3(1, 1, 1);
  let disposed = false, target = null, totalRingVertices = 0;
  const completedColor = new THREE.Color('#88f4ad');
  const ringColor = new THREE.Color();
  const doc = typeof document === 'object' ? document : null;
  const atlas = doc?.createElement('canvas');
  let atlasTexture = null;
  if (atlas) {
    atlas.width = 768; atlas.height = 640;
    const paint = atlas.getContext('2d');
    if (paint) {
      for (const station of stations) {
        const slot = station.number - 1, x = slot % 6 * 128, y = Math.floor(slot / 6) * 128;
        paint.fillStyle = '#10272b'; paint.fillRect(x, y, 128, 128);
        paint.strokeStyle = station.color; paint.lineWidth = 5; paint.strokeRect(x + 4, y + 4, 120, 120);
        paint.fillStyle = station.color; paint.font = 'bold 49px sans-serif'; paint.textAlign = 'center'; paint.textBaseline = 'middle';
        paint.fillText(String(station.number).padStart(2, '0'), x + 64, y + 44);
        const words = station.originalTitle.replace(/:/g, '').split(' '), lines = [];
        for (const word of words) {
          const last = lines.length - 1;
          if (last >= 0 && `${lines[last]} ${word}`.length <= 13) lines[last] += ` ${word}`;
          else lines.push(word);
        }
        paint.font = 'bold 12px sans-serif'; paint.fillStyle = '#eef9e3';
        lines.slice(0, 3).forEach((line, index) => paint.fillText(line.toUpperCase(), x + 64, y + 82 + index * 15, 113));
      }
      atlasTexture = new THREE.CanvasTexture(atlas); atlasTexture.colorSpace = THREE.SRGBColorSpace;
      textures.push(atlasTexture);
    }
  }
  function tint(geometry, hex) {
    const result = geometry.index ? geometry.toNonIndexed() : geometry;
    if (result !== geometry) geometry.dispose();
    color.set(hex);
    const values = new Float32Array(result.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
    result.setAttribute('color', new THREE.BufferAttribute(values, 3)); result.clearGroups();
    return result;
  }
  function pose(station) {
    rotation.setFromAxisAngle(up, station.heading);
    matrix.compose(new THREE.Vector3(station.x, station.y, station.z), rotation, unit);
    return matrix;
  }
  function body(station, geometry, hex, x, y, z, tilt = 0) {
    const part = tint(geometry, hex); part.rotateZ(tilt); part.translate(x, y, z); part.applyMatrix4(pose(station)); bodies.push(part);
  }
  function mesh(parts, material, name) {
    const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
    const object = new THREE.Mesh(geometry, material); object.name = name; object.raycast = () => {};
    geometries.push(geometry); materials.push(material); root.add(object); return object;
  }
  for (const station of stations) {
    // A substantial field console, workbench, stock box, and tall station sign.
    body(station, new THREE.BoxGeometry(1.8, .22, 1.5), '#728075', 0, .12, 0);
    body(station, new THREE.BoxGeometry(1.34, .78, .66), '#354e4d', 0, .60, 0);
    body(station, new THREE.BoxGeometry(1.68, .10, 1.05), '#c5ae7e', 0, 1.03, .12);
    body(station, new THREE.BoxGeometry(1.15, .77, .12), '#132e32', 0, 1.48, -.18);
    body(station, new THREE.BoxGeometry(.5, .48, .5), station.color, -.50, .34, -.46);
    body(station, new THREE.CylinderGeometry(.045, .065, 2.95, 5), '#b6bca5', .76, 1.58, -.35);
    body(station, new THREE.BoxGeometry(.95, .76, .09), '#173b3d', .76, 2.75, -.35);
    if (station.district === 'meadow') {
      body(station, new THREE.CylinderGeometry(.24, .18, .29, 6), '#aa7d51', -.52, 1.24, .20);
      body(station, new THREE.ConeGeometry(.23, .5, 5), station.color, -.52, 1.60, .20);
    } else if (station.district === 'harbor') {
      body(station, new THREE.CylinderGeometry(.29, .29, .70, 8), '#ad8b5f', -1.0, .40, -.18);
      body(station, new THREE.CylinderGeometry(.31, .31, .08, 8), '#465e5e', -1.0, .52, -.18);
    } else if (station.district === 'coral') {
      body(station, new THREE.BoxGeometry(.08, .65, .08), '#e9d6ae', -.57, 1.38, .22, -.42);
      body(station, new THREE.BoxGeometry(.4, .15, .16), '#7b9194', -.71, 1.69, .22, -.42);
    } else if (station.district === 'cloud') {
      body(station, new THREE.BoxGeometry(.7, .11, .6), station.color, -.43, 1.19, .19, -.1);
      body(station, new THREE.BoxGeometry(.11, .35, .11), '#f2e2b4', -.43, 1.41, .19);
    } else if (station.district === 'stars') {
      body(station, new THREE.CylinderGeometry(.025, .025, .85, 4), '#d3d7c8', -.58, 1.52, .19, .3);
      body(station, new THREE.BoxGeometry(.42, .06, .06), station.color, -.70, 1.92, .19);
    } else {
      body(station, new THREE.BoxGeometry(.46, .38, .45), '#a6bbad', -.50, 1.28, .18);
      body(station, new THREE.CylinderGeometry(.18, .05, .18, 7), station.color, -.50, 1.60, .18, .3);
    }
    for (const [x, y, z, width, height] of [[0, 1.48, -.109, 1.02, .64], [.76, 2.75, -.299, .84, .65]]) {
      const panel = new THREE.PlaneGeometry(width, height), uv = panel.attributes.uv, slot = station.number - 1;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (slot % 6 + uv.getX(i)) / 6, 1 - (Math.floor(slot / 6) + 1 - uv.getY(i)) / 5);
      panel.translate(x, y, z); panel.applyMatrix4(pose(station)); screens.push(panel);
    }
    const indexedRing = new THREE.RingGeometry(2.13, 2.23, 36).rotateX(-Math.PI / 2), ring = indexedRing.toNonIndexed();
    indexedRing.dispose();
    const points = ring.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = station.x + points.getX(i), z = station.z + points.getZ(i);
      points.setXYZ(i, x, groundH(x, z) + .07, z);
    }
    tint(ring, station.color); ringRanges.push({ start: totalRingVertices, count: points.count }); totalRingVertices += points.count; rings.push(ring);
  }
  mesh(bodies, new THREE.MeshLambertMaterial({ vertexColors: true }), 'activity-workbenches');
  mesh(screens, new THREE.MeshBasicMaterial({ map: atlasTexture, color: atlasTexture ? '#ffffff' : '#8edfd8', side: THREE.DoubleSide, toneMapped: false }), 'activity-signs');
  const ringMesh = mesh(rings, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .65, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }), 'activity-ground-rings');
  const glowParts = [
    new THREE.BoxGeometry(1.18, .055, .055).translate(0, 1.89, -.16),
    new THREE.BoxGeometry(.055, .78, .055).translate(-.58, 1.48, -.16),
    new THREE.BoxGeometry(.055, .78, .055).translate(.58, 1.48, -.16),
    new THREE.OctahedronGeometry(.15).translate(.76, 3.24, -.35),
  ].map(geometry => { if (!geometry.index) return geometry; const result = geometry.toNonIndexed(); geometry.dispose(); return result; });
  const glowGeometry = mergeGeometries(glowParts, false); glowParts.forEach(geometry => geometry.dispose());
  const glowMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  const glow = new THREE.InstancedMesh(glowGeometry, glowMaterial, stations.length); glow.name = 'activity-console-lights'; glow.raycast = () => {};
  geometries.push(glowGeometry); materials.push(glowMaterial); root.add(glow);
  const beamGeometry = new THREE.CylinderGeometry(.025, .15, 4.6, 5, 1, true).translate(.76, 5.65, -.35);
  const beamMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: .19, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false });
  const beams = new THREE.InstancedMesh(beamGeometry, beamMaterial, stations.length); beams.name = 'activity-beacons'; beams.raycast = () => {};
  geometries.push(beamGeometry); materials.push(beamMaterial); root.add(beams);
  for (let i = 0; i < stations.length; i++) { glow.setMatrixAt(i, pose(stations[i])); beams.setMatrixAt(i, matrix); }
  glow.instanceMatrix.needsUpdate = beams.instanceMatrix.needsUpdate = true;
  const markerGeometry = new THREE.OctahedronGeometry(.35), markerMaterial = new THREE.MeshBasicMaterial({ color: '#ffdf91', toneMapped: false });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial); marker.name = 'activity-waypoint'; marker.visible = false; marker.raycast = () => {};
  geometries.push(markerGeometry); materials.push(markerMaterial); root.add(marker);

  const labels = doc?.createElement('div'), labelPool = [];
  if (labels) {
    labels.className = 'activity-world-labels'; labels.setAttribute('aria-hidden', 'true');
    Object.assign(labels.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
    for (let i = 0; i < 2; i++) {
      const element = doc.createElement('div'), arrow = doc.createElement('span'), title = doc.createElement('strong'), detail = doc.createElement('small');
      element.className = 'activity-world-label'; arrow.className = 'activity-label-arrow'; arrow.textContent = '➜';
      title.className = 'activity-label-name'; detail.className = 'activity-label-meta';
      element.append(arrow, title, detail); element.hidden = true; labels.append(element); labelPool.push({ element, arrow, title, detail });
      Object.assign(element.style, { position: 'absolute', transform: 'translate(-50%, -100%)' });
    }
    doc.body.append(labels);
  }
  const projected = new THREE.Vector3(), cameraPoint = new THREE.Vector3();
  function nearest(position, max = Infinity) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    let found = null, distance = max;
    for (const station of stations) {
      const d = Math.hypot(station.x - position.x, station.z - position.z);
      if (d <= distance) { found = station; distance = d; }
    }
    return found ? { ...found, distance } : null;
  }
  function safe(position, radius = ACTIVITY_SAFE_RADIUS) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z) || lavaF(position.x, position.z) >= .02) return false;
    const station = nearest(position, radius); if (!station) return false;
    const ground = groundH(position.x, position.z), height = Number.isFinite(position.y) ? position.y : ground;
    return height <= station.y + 2 && height <= ground + 2 && height >= ground - .75;
  }
  function setTarget(id) {
    target = stations.find(station => station.id === id) || null;
    marker.visible = !!target;
    return !!target;
  }
  function refresh(next = {}) {
    const completed = new Set(Array.isArray(next.completed) ? next.completed : []), values = ringMesh.geometry.attributes.color;
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i]; station.completed = completed.has(station.id);
      ringColor.copy(station.completed ? completedColor : color.set(station.color));
      glow.setColorAt(i, ringColor); beams.setColorAt(i, ringColor);
      const range = ringRanges[i];
      for (let vertex = range.start; vertex < range.start + range.count; vertex++) values.setXYZ(vertex, ringColor.r, ringColor.g, ringColor.b);
    }
    values.needsUpdate = true; glow.instanceColor.needsUpdate = beams.instanceColor.needsUpdate = true;
    if (Object.hasOwn(next, 'target')) setTarget(next.target);
  }
  function label(entry, station, player, camera, width, height, isTarget, journalRect) {
    if (!station || !camera) { entry.element.hidden = true; return; }
    const distance = Math.hypot(station.x - player.x, station.z - player.z);
    projected.set(station.x, station.y + 3.65, station.z);
    cameraPoint.copy(projected).applyMatrix4(camera.matrixWorldInverse);
    projected.project(camera);
    let nx = projected.x, ny = -projected.y;
    const behind = cameraPoint.z >= 0;
    if (behind) { nx = -nx; ny = -ny; }
    const outside = behind || Math.abs(nx) > .88 || Math.abs(ny) > .76;
    if (outside && !isTarget) { entry.element.hidden = true; return; }
    if (outside) {
      const length = Math.max(Math.abs(nx) / .80, Math.abs(ny) / .65, .001); nx /= length; ny /= length;
    }
    const marginX = Math.min(105, width * .30), marginY = Math.min(105, height * .27);
    let x = Math.max(marginX, Math.min(width - marginX, (nx + 1) * width / 2));
    let y = Math.max(72, Math.min(height - marginY, (ny + 1) * height / 2));
    entry.element.hidden = false; entry.element.style.left = `${Math.round(x)}px`; entry.element.style.top = `${Math.round(y)}px`;
    entry.element.classList.toggle('is-target', isTarget); entry.element.classList.toggle('is-complete', station.completed); entry.element.classList.toggle('is-offscreen', outside);
    entry.element.style.setProperty('--activity-color', station.completed ? '#88f4ad' : station.color);
    entry.element.dataset.activity = station.id;
    entry.title.textContent = `${station.completed ? '✓ ' : ''}${station.originalTitle}`;
    entry.detail.textContent = `${isTarget ? 'WAYPOINT · ' : ''}${Math.round(distance)} m · ${station.districtTitle}`;
    entry.arrow.hidden = !outside; entry.arrow.style.transform = `rotate(${Math.atan2(ny, nx)}rad)`;
    // Edge waypoints must remain readable beside the clickable outpost journal.
    // Measure only when label content or viewport changes; most frames reuse it.
    const measureKey = `${entry.title.textContent}|${entry.detail.textContent}|${width}|${height}`;
    if (entry.measureKey !== measureKey) { entry.measureKey = measureKey; entry.labelWidth = entry.element.offsetWidth; entry.labelHeight = entry.element.offsetHeight; }
    const half = entry.labelWidth / 2, labelHeight = entry.labelHeight;
    if (journalRect?.width && half && x + half > journalRect.left && x - half < journalRect.right && y > journalRect.top && y - labelHeight < journalRect.bottom) {
      const beside = journalRect.right + 8 + half;
      if (beside + half <= width - 8) x = beside;
      else y = Math.min(height - marginY, journalRect.bottom + 8 + labelHeight);
      entry.element.style.left = `${Math.round(x)}px`; entry.element.style.top = `${Math.round(y)}px`;
    }
  }
  function update({ time = 0, player, camera, width = globalThis.innerWidth || 1280, height = globalThis.innerHeight || 720, playing = true } = {}) {
    if (disposed) return;
    marker.visible = !!target && playing;
    if (target) { marker.position.set(target.x, target.y + 4.1 + Math.sin(time * 2) * .13, target.z); marker.rotation.y = time * .7; }
    if (!labels) return;
    labels.hidden = !playing || !player;
    if (!playing || !player) return;
    const near = nearest(player, 18);
    const journalRect = doc.getElementById('expeditionJournal')?.getBoundingClientRect();
    label(labelPool[0], near?.id === target?.id ? null : near, player, camera, width, height, false, journalRect);
    label(labelPool[1], target, player, camera, width, height, true, journalRect);
  }
  refresh(progress);
  return {
    stations, root, labels, zones: stations.map(({ id, x, y, z, radius }) => ({ id, x, y, z, radius })),
    nearest, safe, setTarget, update, refresh,
    get target() { return target?.id ?? null; },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); labels?.remove(); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); },
  };
}
