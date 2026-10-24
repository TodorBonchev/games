import * as THREE from 'three';

// The short rifle samples are generated once. Playing a shot only allocates a
// source and a gain node; both disconnect as soon as the sample ends.
export function createCombatAudio(context, output, enabled) {
  const buffers = new Map();
  const sample = (name, seconds, make) => {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    let filtered = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / context.sampleRate, noise = Math.random() * 2 - 1;
      filtered += (noise - filtered) * .18;
      data[i] = make(t, noise, filtered);
    }
    buffers.set(name, buffer);
  };
  sample('rifle', .19, (t, noise, low) => {
    const attack = Math.min(1, t / .0015);
    const crack = noise * Math.exp(-t * 100) * .58;
    const body = Math.sin(2 * Math.PI * (130 * t - 180 * t * t)) * Math.exp(-t * 32) * .38;
    const tail = low * Math.exp(-t * 20) * .18;
    const mechanism = noise * Math.exp(-Math.abs(t - .035) * 550) * .08;
    return attack * (crack + body + tail + mechanism);
  });
  sample('burst', .13, (t, noise, low) => Math.min(1, t / .001) * (noise * .42 * Math.exp(-t * 130) + Math.sin(2 * Math.PI * 190 * t) * .24 * Math.exp(-t * 43) + low * .17 * Math.exp(-t * 32)));
  sample('scatter', .36, (t, noise, low) => Math.min(1, t / .0015) * (noise * .56 * Math.exp(-t * 65) + Math.sin(2 * Math.PI * (85 * t - 60 * t * t)) * .4 * Math.exp(-t * 20) + low * .25 * Math.exp(-t * 12)));
  sample('impact', .11, (t, noise, low) => (noise * .11 + low * .38) * Math.exp(-t * 55));
  sample('kill', .18, (t, noise, low) => (low * .3 + Math.sin(t * 2 * Math.PI * (530 - 800 * t)) * .12) * Math.exp(-t * 28));
  sample('swipe', .22, (t, noise, low) => low * .25 * Math.sin(Math.PI * Math.min(1, t / .22)));
  return (name, volume = 1) => {
    if (!enabled() || !buffers.has(name)) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffers.get(name);
    source.playbackRate.value = ['rifle', 'burst', 'scatter'].includes(name) ? .96 + Math.random() * .08 : 1;
    gain.gain.value = volume;
    source.connect(gain).connect(output);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
  };
}

// One pooled draw call for all bullet impacts. No per-shot geometry, materials,
// lights, textures or DOM nodes; particles become tiny when their short life ends.
export function createImpactPool(scene, low) {
  const count = low ? 40 : 80, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3), life = new Float32Array(count), duration = new Float32Array(count);
  const baseColors = new Float32Array(count * 3);
  positions.fill(-10000);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.PointsMaterial({size:.065,vertexColors:true,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.name = 'bullet-impacts';
  scene.add(mesh);
  let cursor = 0;
  return {
    emit(point, direction, enemy = false) {
      for (let i = 0; i < (low ? 4 : 7); i++) {
        const n = cursor++ % count, p = n * 3;
        positions.set([point.x, point.y, point.z], p);
        velocities.set([(Math.random()-.5)*2-direction.x*.8, Math.random()*1.8+.3, (Math.random()-.5)*2-direction.z*.8], p);
        life[n] = duration[n] = .12 + Math.random() * .14;
        const color = enemy ? [1,.55,.21] : [1,.86,.48];
        baseColors.set(color, p); colors.set(color, p);
      }
      mesh.visible = true;
    },
    update(dt) {
      if (!mesh.visible) return;
      let active = 0;
      for (let n = 0; n < count; n++) {
        if (life[n] <= 0) continue;
        life[n] -= dt; const p = n * 3;
        if (life[n] <= 0) { positions[p + 1] = -10000; continue; }
        active++;
        velocities[p + 1] -= 7 * dt;
        const fade = life[n] / duration[n];
        for (let axis = 0; axis < 3; axis++) {
          positions[p + axis] += velocities[p + axis] * dt;
          colors[p + axis] = baseColors[p + axis] * fade;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      mesh.visible = active > 0;
    },
    clear() { life.fill(0); mesh.visible = false; },
    get active() { return life.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0); },
    capacity: count
  };
}
