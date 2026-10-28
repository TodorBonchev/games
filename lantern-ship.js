import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A small, readable silhouette built from shared, merged geometry. The rear
// engines and swept wings make the flying direction obvious on a phone.
export function createLanternShip({ THREE, registerGeometry, registerMaterial, glowTexture }) {
  const ship = new THREE.Group();
  ship.name = 'LanternScoutShip';
  const body = new THREE.Group(); body.name = 'ScoutBank'; ship.add(body);
  const standard = (color, options = {}) => registerMaterial(new THREE.MeshStandardMaterial({ color, roughness: .38, metalness: .28, ...options }));
  const ivory = standard('#fff0d2');
  const teal = standard('#266f7c', { metalness: .44, side: THREE.DoubleSide });
  const gold = standard('#dca65d', { metalness: .6 });
  const glass = standard('#50c6d5', { emissive: '#175e74', emissiveIntensity: .45, metalness: .55, roughness: .19 });
  const dark = standard('#25384b', { roughness: .62 });
  const light = registerMaterial(new THREE.MeshBasicMaterial({ color: '#a4fff5', toneMapped: false }));
  const pieces = new Map();
  function part(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation); mesh.updateMatrix();
    const baked = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    baked.deleteAttribute('uv'); baked.applyMatrix4(mesh.matrix);
    if (!pieces.has(material)) pieces.set(material, []);
    pieces.get(material).push(baked); geometry.dispose();
  }
  const ball = () => new THREE.SphereGeometry(1, 16, 10);
  part(ball(), ivory, [0, 0, .14], [.48, .26, 1.22]);
  part(ball(), teal, [0, -.13, -.04], [.45, .18, 1.08]);
  part(ball(), glass, [0, .19, .35], [.30, .20, .60]);
  // The warm spine and fin give the craft a handmade exploration-vessel feel.
  part(new THREE.BoxGeometry(.08, .055, .54), gold, [0, .255, -.52]);
  const fin = new THREE.Shape(); fin.moveTo(-.48, 0); fin.lineTo(-.94, 0); fin.lineTo(-.68, .5); fin.lineTo(-.43, .18); fin.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(fin, { depth: .06, bevelEnabled: false });
  // Shape X becomes local Z, shape Y remains height.
  part(finGeometry, teal, [-.03, .1, 0], [1, 1, 1], [0, -Math.PI / 2, 0]);
  for (const sign of [-1, 1]) {
    const wing = new THREE.Shape();
    wing.moveTo(sign * .32, .68); wing.lineTo(sign * 1.72, -.55);
    wing.lineTo(sign * 1.58, -.95); wing.lineTo(sign * .35, -.48); wing.closePath();
    part(new THREE.ExtrudeGeometry(wing, { depth: .11, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .025, bevelThickness: .025 }), ivory, [0, .015, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    const stripe = new THREE.Shape();
    stripe.moveTo(sign * .65, .20); stripe.lineTo(sign * 1.59, -.56);
    stripe.lineTo(sign * 1.53, -.72); stripe.lineTo(sign * .68, -.15); stripe.closePath();
    part(new THREE.ShapeGeometry(stripe), teal, [0, .048, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    part(ball(), gold, [sign * 1.55, .015, -.73], [.08, .065, .25]);
    part(ball(), light, [sign * 1.62, .05, -.72], [.055, .045, .12]);
    part(new THREE.CylinderGeometry(.21, .25, .72, 12), teal, [sign * .65, -.025, -.59], [1, 1, 1], [Math.PI / 2, 0, 0]);
    part(new THREE.CylinderGeometry(.225, .225, .11, 12), gold, [sign * .65, -.025, -.95], [1, 1, 1], [Math.PI / 2, 0, 0]);
    part(new THREE.CylinderGeometry(.175, .175, .12, 12), dark, [sign * .65, -.025, -1.015], [1, 1, 1], [Math.PI / 2, 0, 0]);
    part(new THREE.CircleGeometry(.13, 12), light, [sign * .65, -.025, -1.08], [1, 1, 1], [0, Math.PI, 0]);
  }
  for (const [material, geometries] of pieces) {
    const geometry = registerGeometry(mergeGeometries(geometries));
    geometries.forEach(item => item.dispose());
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'ScoutHull'; body.add(mesh);
  }
  const flameGeometry = registerGeometry(new THREE.ConeGeometry(.13, 1, 10));
  const flameMaterial = registerMaterial(new THREE.MeshBasicMaterial({ color: '#71e7ef', transparent: true, opacity: .65, depthWrite: false, toneMapped: false }));
  const glowGeometry = registerGeometry(new THREE.PlaneGeometry(1, 1));
  const glowMaterial = registerMaterial(new THREE.MeshBasicMaterial({ map: glowTexture, color: '#6eefff', transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
  const flames = [];
  for (const sign of [-1, 1]) {
    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.rotation.x = -Math.PI / 2; flame.position.set(sign * .65, -.025, -1.3); body.add(flame);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial); glow.position.set(sign * .65, -.025, -1.1); body.add(glow);
    flames.push({ flame, glow });
  }
  function update(player, time, reduced) {
    ship.position.set(player.x, player.y ?? 9, player.z);
    ship.rotation.y = player.heading || 0;
    const power = Math.min(1, Math.abs(player.speed || 0) / 10.8);
    body.rotation.z = reduced ? 0 : player.bank || 0;
    body.rotation.x = reduced ? 0 : -(player.verticalSpeed || 0) * .045;
    body.position.y = reduced ? 0 : Math.sin(time * 2.4) * .025;
    for (const { flame, glow } of flames) {
      const length = .2 + power * .95;
      flame.scale.set(1, length, 1); flame.position.z = -1.09 - length / 2;
      glow.scale.setScalar(.6 + power * .38);
    }
    flameMaterial.opacity = .4 + power * .35;
  }
  return { ship, update };
}
