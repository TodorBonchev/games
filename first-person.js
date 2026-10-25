import * as THREE from 'three';
import { getWeapon } from './weapons.js?v19';

/** Camera-space copy of the equipped carbine. Soldier geometry stays shared. */
export function createFirstPersonView(camera, player, { low = false } = {}) {
  const root = new THREE.Group(); root.name = 'first-person-view'; root.visible = false; camera.add(root);
  const source = player.getObjectByName('carbine');
  if (!source) throw new Error('First-person view requires the soldier carbine');
  const gun = source.clone(true); gun.name = 'first-person-carbine'; gun.position.set(0, 0, 0); gun.rotation.set(0, Math.PI, 0); root.add(gun);
  const objects = new Map(), materials = new Map(), ownedGeometry = [];
  const pair = (original, clone) => {
    objects.set(original, clone);
    for (let i = 0; i < original.children.length; i++) pair(original.children[i], clone.children[i]);
  };
  pair(source, gun);
  const muzzle = objects.get(player.userData.muzzle), flashMesh = objects.get(player.userData.flash);
  const precision = gun.getObjectByName('striker-hardware'), breacher = gun.getObjectByName('breacher-hardware');
  const lights = [];
  function copyMaterial(material) {
    if (!materials.has(material)) {
      const clone = material.clone(); clone.depthTest = false; clone.depthWrite = false; clone.fog = false;
      materials.set(material, clone);
    }
    return materials.get(material);
  }
  gun.traverse(object => {
    if (object.isLight) lights.push(object);
    if (object.isMesh) {
      object.material = Array.isArray(object.material) ? object.material.map(copyMaterial) : copyMaterial(object.material);
      object.castShadow = object.receiveShadow = false; object.frustumCulled = false; object.renderOrder = 102;
    }
    object.raycast = () => {};
  });
  for (const light of lights) light.removeFromParent();
  if (flashMesh) { flashMesh.visible = false; flashMesh.traverse(object => { object.renderOrder = 103; }); }

  const sleeve = new THREE.MeshLambertMaterial({ color: 0x788465, depthTest: false, depthWrite: false, fog: false });
  const glove = new THREE.MeshLambertMaterial({ color: 0x343f39, depthTest: false, depthWrite: false, fog: false });
  const cuff = new THREE.MeshLambertMaterial({ color: 0xa09e81, depthTest: false, depthWrite: false, fog: false });
  const up = new THREE.Vector3(0, 1, 0), armDirection = new THREE.Vector3();
  const arms = new THREE.Group(); arms.name = 'first-person-arms'; root.add(arms);
  function mesh(geometry, material) {
    ownedGeometry.push(geometry); const object = new THREE.Mesh(geometry, material);
    object.renderOrder = 101; object.frustumCulled = false; object.raycast = () => {}; arms.add(object); return object;
  }
  function forearm(elbow, wrist, radius) {
    armDirection.subVectors(wrist, elbow); const length = armDirection.length(); armDirection.normalize();
    const arm = mesh(new THREE.CylinderGeometry(radius * .82, radius, length, low ? 6 : 10), sleeve);
    arm.position.copy(elbow).lerp(wrist, .5); arm.quaternion.setFromUnitVectors(up, armDirection);
    const band = mesh(new THREE.CylinderGeometry(radius * .91, radius * .91, .045, low ? 6 : 10), cuff);
    band.position.copy(wrist).addScaledVector(armDirection, -.03); band.quaternion.copy(arm.quaternion);
    const hand = mesh(new THREE.BoxGeometry(.095, .105, .13), glove);
    hand.position.copy(wrist).addScaledVector(armDirection, .025); hand.rotation.set(-.35, 0, -.12);
  }
  // Wrists meet the original right trigger grip and left handguard. Elbows
  // disappear below the viewport, leaving room around the central crosshair.
  forearm(new THREE.Vector3(.22, -.37, .31), new THREE.Vector3(0, -.09, .10), .073);
  forearm(new THREE.Vector3(-.46, -.36, .25), new THREE.Vector3(-.035, -.045, -.12), .07);
  root.scale.setScalar(.82);
  let disposed = false, weapon = getWeapon('rifle');
  function setWeapon(id) {
    weapon = getWeapon(id); gun.scale.set(...weapon.modelScale);
    if (precision) precision.visible = weapon.id === 'burst';
    if (breacher) breacher.visible = weapon.id === 'scatter';
    if (muzzle) muzzle.position.z = weapon.id === 'burst' ? .81 : .59;
    if (flashMesh) {
      flashMesh.scale.setScalar(weapon.id === 'scatter' ? 1.4 : weapon.id === 'burst' ? .85 : 1);
      flashMesh.material.color.setHex(weapon.id === 'burst' ? 0xa6ddff : 0xffbc52);
    }
  }
  function update({ time = 0, speed = 0, recoil = 0, flash = false, motion = true } = {}) {
    if (disposed) return;
    const movement = Math.min(1, Math.max(0, speed)), kick = motion ? Math.min(.07, Math.max(0, recoil) * 2) : 0;
    const bobX = motion ? Math.sin(time * 9) * .006 * movement : 0;
    const bobY = motion ? Math.abs(Math.sin(time * 9)) * .007 * movement : 0;
    root.position.set(THREE.MathUtils.clamp(camera.aspect * .16, .10, .24) + bobX, -.24 - bobY, -.48 + kick);
    root.rotation.set(motion ? -kick * .6 : 0, 0, motion ? Math.sin(time * 4.5) * .004 * movement : 0);
    if (flashMesh) { flashMesh.visible = !!flash; flashMesh.rotation.z = motion ? time * 31 : 0; }
    root.updateMatrixWorld(true);
  }
  setWeapon('rifle'); update();
  return {
    root, muzzle, setWeapon, update,
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      for (const material of materials.values()) material.dispose();
      for (const material of [sleeve, glove, cuff]) material.dispose();
      for (const geometry of ownedGeometry) geometry.dispose();
    },
  };
}
