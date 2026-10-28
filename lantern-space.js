// A quiet, layered sky for the flying village. Its four draw calls stay behind
// the island, while camera translation moves nearby stars farther than distant
// ones. Nothing here changes gameplay coordinates or owns an animation loop.
export function createLanternSpace({ THREE, scene, camera, reducedMotion = false }) {
  let disposed = false, anchored = false;
  const origin = new THREE.Vector3(), delta = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const paint = document.createElement('canvas'); paint.width = 1024; paint.height = 768;
  const ctx = paint.getContext('2d');
  ctx.fillStyle = '#07101f'; ctx.fillRect(0, 0, paint.width, paint.height);
  const wash = (x, y, radius, color) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, '#00000000');
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  // Soft, asymmetrical clouds of color. The broad strokes are baked once, not
  // evaluated as noise in every pixel on every phone frame.
  wash(250, 580, 560, '#16496980');
  wash(700, 190, 480, '#4c365d88');
  wash(1000, 600, 560, '#142f5555');
  wash(80, 100, 320, '#121b4266');
  let randomState = 748391;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  for (let i = 0; i < 27; i++) {
    const f = i / 26;
    const x = 80 + f * 940 + (random() - .5) * 130;
    const y = 670 - f * 560 + Math.sin(f * 8) * 85 + (random() - .5) * 120;
    wash(x, y, 60 + random() * 115, i % 3 ? '#546a9913' : '#94749713');
  }
  const texture = new THREE.CanvasTexture(paint);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const backdropMaterial = new THREE.ShaderMaterial({
    uniforms: { uNebula: { value: texture }, uAspect: { value: 1 }, uOffset: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, .999999, 1.0); }`,
    fragmentShader: `uniform sampler2D uNebula; uniform float uAspect; uniform vec2 uOffset; varying vec2 vUv;
      void main() {
        vec2 p = vUv - .5;
        p.x *= min(1.0, uAspect / 1.3333);
        p.y *= min(1.0, 1.3333 / uAspect);
        gl_FragColor = vec4(texture2D(uNebula, clamp(p * .82 + .5 + uOffset, .01, .99)).rgb, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: true, depthWrite: false, toneMapped: false,
  });
  const backdrop = new THREE.Mesh(geometry, backdropMaterial);
  backdrop.name = 'LanternSpaceNebula'; backdrop.frustumCulled = false; backdrop.renderOrder = -1000;
  scene.add(backdrop);

  const colors = ['#d8e6ff', '#b7d0f2', '#f3e2ca', '#d9c5ed', '#b7e4e4'];
  const tint = new THREE.Color();
  const layerSpecs = [
    { name: 'Far', depth: 220, count: 410, size: .95, opacity: .46 },
    { name: 'Middle', depth: 130, count: 230, size: 1.45, opacity: .68 },
    { name: 'Near', depth: 80, count: 95, size: 2.15, opacity: .86 },
  ];
  const layers = layerSpecs.map((spec, layerIndex) => {
    const positions = new Float32Array(spec.count * 3), sizes = new Float32Array(spec.count);
    const phases = new Float32Array(spec.count), hues = new Float32Array(spec.count * 3);
    for (let i = 0; i < spec.count; i++) {
      positions[i * 3] = random(); positions[i * 3 + 1] = random();
      positions[i * 3 + 2] = .9999;
      sizes[i] = spec.size * (.75 + random() * .65) + (i % 19 === 0 ? .8 : 0);
      phases[i] = random() * Math.PI * 2;
      tint.set(colors[Math.floor(random() * colors.length)]);
      hues[i * 3] = tint.r; hues[i * 3 + 1] = tint.g; hues[i * 3 + 2] = tint.b;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    starGeometry.setAttribute('aTint', new THREE.BufferAttribute(hues, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uOffset: { value: new THREE.Vector2() }, uTime: { value: 0 },
        uMotion: { value: reducedMotion ? 0 : 1 }, uOpacity: { value: spec.opacity },
        uPixelRatio: { value: Math.min(globalThis.devicePixelRatio || 1, 1.35) },
      },
      vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aTint;
        uniform vec2 uOffset; uniform float uPixelRatio;
        varying vec3 vTint; varying float vPhase; varying float vSize;
        void main() {
          // The overscan margin hides wrap transitions entirely off screen.
          vec2 p = fract(position.xy + uOffset / 2.12) * 2.12 - 1.06;
          gl_Position = vec4(p, .99995, 1.0);
          gl_PointSize = max(1.0, aSize * uPixelRatio);
          vTint = aTint; vPhase = aPhase; vSize = aSize;
        }`,
      fragmentShader: `uniform float uTime; uniform float uMotion; uniform float uOpacity;
        varying vec3 vTint; varying float vPhase; varying float vSize;
        void main() {
          vec2 p = gl_PointCoord - .5;
          float radius = length(p);
          float soft = 1.0 - smoothstep(.12, .5, radius);
          float core = exp(-dot(p, p) * 48.0);
          float sparkle = .89 + uMotion * .11 * sin(uTime * .7 + vPhase);
          float alpha = (soft * .5 + core * .5) * sparkle * uOpacity;
          if (alpha < .015) discard;
          gl_FragColor = vec4(vTint, alpha);
          #include <colorspace_fragment>
        }`,
      transparent: true, blending: THREE.AdditiveBlending,
      depthTest: true, depthWrite: false, toneMapped: false,
    });
    const points = new THREE.Points(starGeometry, material);
    points.name = `LanternStars${spec.name}`;
    points.userData.depth = spec.depth;
    points.userData.parallax = 1 / spec.depth;
    points.userData.count = spec.count;
    points.frustumCulled = false; points.renderOrder = -900 + layerIndex;
    scene.add(points); return points;
  });

  function update({ time = 0, cameraPosition = camera.position, reducedMotion: reduce = reducedMotion } = {}) {
    if (disposed) return;
    if (!anchored) {
      origin.copy(cameraPosition);
      right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      anchored = true;
    }
    delta.copy(cameraPosition).sub(origin);
    const aspect = Math.max(.2, camera.aspect || 1);
    const slope = Math.tan((camera.fov || 43) * Math.PI / 360);
    const seconds = Number.isFinite(time) ? time : 0;
    const horizontal = delta.dot(right), vertical = delta.dot(up);
    for (const layer of layers) {
      const uniforms = layer.material.uniforms, depth = layer.userData.depth;
      // Treat each layer as a distant plane perpendicular to the view. Camera
      // travel has the projected angular size delta/(depth*tan(fov/2)); nearer
      // stars consequently move faster. A tiny shared world drift makes an
      // idle island feel airborne without needing camera shake.
      const x = reduce ? 0 : (-horizontal - seconds * .20) / (depth * slope * aspect);
      const y = reduce ? 0 : (-vertical + seconds * .055) / (depth * slope);
      uniforms.uOffset.value.set(x % 2.12, y % 2.12);
      uniforms.uTime.value = reduce ? 0 : seconds;
      uniforms.uMotion.value = reduce ? 0 : 1;
    }
    backdropMaterial.uniforms.uAspect.value = aspect;
    backdropMaterial.uniforms.uOffset.value.set(
      reduce ? 0 : Math.sin(seconds * .002 - horizontal * .0004) * .012,
      reduce ? 0 : Math.sin(seconds * .001 + vertical * .0004) * .007,
    );
  }
  function dispose() {
    if (disposed) return; disposed = true;
    backdrop.removeFromParent(); geometry.dispose(); backdropMaterial.dispose(); texture.dispose();
    for (const layer of layers) { layer.removeFromParent(); layer.geometry.dispose(); layer.material.dispose(); }
  }
  return { update, dispose, layers, backdrop };
}
