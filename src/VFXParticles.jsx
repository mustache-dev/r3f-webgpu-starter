import { forwardRef, useImperativeHandle, useEffect, useRef, useMemo, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  uniform,
  float,
  uv,
  vec2,
  vec3,
  vec4,
  hash,
  mix,
  floor,
  step,
  mod,
  texture,
  instancedArray,
  instanceIndex,
} from "three/tsl";

// Appearance enum for particle shapes
export const Appearance = Object.freeze({
  DEFAULT: "default",
  GRADIENT: "gradient",
  CIRCULAR: "circular",
});

// Blending modes
export const Blending = Object.freeze({
  NORMAL: THREE.NormalBlending,
  ADDITIVE: THREE.AdditiveBlending,
  MULTIPLY: THREE.MultiplyBlending,
  SUBTRACTIVE: THREE.SubtractiveBlending,
});

// Convert hex to RGB array [0-1]
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ] : [1, 1, 1];
};

export const VFXParticles = forwardRef(function VFXParticles(
  {
    maxParticles = 10000,
    size = [0.1, 0.3],
    colorStart = ["#ffffff"],
    colorEnd = ["#ffffff"],
    fadeSize = [1, 0],
    fadeOpacity = [1, 0],
    gravity = [0, 0.001, 0],
    lifetime = [1, 2],
    directionMin = [-1, 0, -1],
    directionMax = [1, 1, 1],
    speed = [0.1, 0.1],
    friction = 0.99,
    appearance = Appearance.GRADIENT,
    alphaMap = null,
    flipbook = null, // { rows: 4, columns: 8 }
    rotation = [0, 0], // [min, max] in radians
    blending = Blending.NORMAL,
    intensity = 1,
    position = [0, 0, 0],
    autoStart = false,
    delay = 0,
    emitCount = 1,
  },
  ref
) {
  const { gl: renderer } = useThree();
  const spriteRef = useRef();
  const initialized = useRef(false);
  const nextIndex = useRef(0);
  const [emitting, setEmitting] = useState(autoStart);
  const emitAccumulator = useRef(0);

  // Convert lifetime in seconds to fade rate per second (framerate independent)
  const lifetimeToFadeRate = (seconds) => 1 / seconds;

  // Normalize size prop to array
  const sizeRange = useMemo(() => {
    if (Array.isArray(size)) return size;
    return [size, size];
  }, [size]);

  // Normalize speed prop to array
  const speedRange = useMemo(() => {
    if (Array.isArray(speed)) return speed;
    return [speed, speed];
  }, [speed]);

  // Convert color arrays to RGB (support up to 8 colors each)
  const startColors = useMemo(() => {
    const colors = colorStart.slice(0, 8).map(hexToRgb);
    while (colors.length < 8) colors.push(colors[colors.length - 1] || [1, 1, 1]);
    return colors;
  }, [colorStart]);

  const endColors = useMemo(() => {
    const colors = colorEnd.slice(0, 8).map(hexToRgb);
    while (colors.length < 8) colors.push(colors[colors.length - 1] || [1, 1, 1]);
    return colors;
  }, [colorEnd]);

  // Uniforms
  const uniforms = useMemo(
    () => ({
      sizeMin: uniform(sizeRange[0]),
      sizeMax: uniform(sizeRange[1]),
      fadeSizeStart: uniform(fadeSize[0]),
      fadeSizeEnd: uniform(fadeSize[1]),
      fadeOpacityStart: uniform(fadeOpacity[0]),
      fadeOpacityEnd: uniform(fadeOpacity[1]),
      gravity: uniform(new THREE.Vector3(...gravity)),
      friction: uniform(friction),
      speedMin: uniform(speedRange[0]),
      speedMax: uniform(speedRange[1]),
      lifetimeMin: uniform(lifetimeToFadeRate(lifetime[1])),
      lifetimeMax: uniform(lifetimeToFadeRate(lifetime[0])),
      deltaTime: uniform(1/60), // Will be updated each frame
      dirMin: uniform(new THREE.Vector3(...directionMin)),
      dirMax: uniform(new THREE.Vector3(...directionMax)),
      spawnPosition: uniform(new THREE.Vector3(...position)),
      spawnIndexStart: uniform(0),
      spawnIndexEnd: uniform(0),
      spawnSeed: uniform(0),
      intensity: uniform(intensity),
      rotationMin: uniform(rotation[0]),
      rotationMax: uniform(rotation[1]),
      // Color arrays (8 colors max each)
      colorStartCount: uniform(colorStart.length),
      colorEndCount: uniform(colorEnd.length),
      colorStart0: uniform(new THREE.Color(...startColors[0])),
      colorStart1: uniform(new THREE.Color(...startColors[1])),
      colorStart2: uniform(new THREE.Color(...startColors[2])),
      colorStart3: uniform(new THREE.Color(...startColors[3])),
      colorStart4: uniform(new THREE.Color(...startColors[4])),
      colorStart5: uniform(new THREE.Color(...startColors[5])),
      colorStart6: uniform(new THREE.Color(...startColors[6])),
      colorStart7: uniform(new THREE.Color(...startColors[7])),
      colorEnd0: uniform(new THREE.Color(...endColors[0])),
      colorEnd1: uniform(new THREE.Color(...endColors[1])),
      colorEnd2: uniform(new THREE.Color(...endColors[2])),
      colorEnd3: uniform(new THREE.Color(...endColors[3])),
      colorEnd4: uniform(new THREE.Color(...endColors[4])),
      colorEnd5: uniform(new THREE.Color(...endColors[5])),
      colorEnd6: uniform(new THREE.Color(...endColors[6])),
      colorEnd7: uniform(new THREE.Color(...endColors[7])),
    }),
    []
  );

  // Store position prop for use in spawn
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position; }, [position]);

  // Update uniforms when props change
  useEffect(() => { 
    uniforms.sizeMin.value = sizeRange[0]; 
    uniforms.sizeMax.value = sizeRange[1]; 
  }, [sizeRange, uniforms]);
  useEffect(() => { uniforms.fadeSizeStart.value = fadeSize[0]; uniforms.fadeSizeEnd.value = fadeSize[1]; }, [fadeSize, uniforms]);
  useEffect(() => { uniforms.fadeOpacityStart.value = fadeOpacity[0]; uniforms.fadeOpacityEnd.value = fadeOpacity[1]; }, [fadeOpacity, uniforms]);
  useEffect(() => { uniforms.gravity.value.set(...gravity); }, [gravity, uniforms]);
  useEffect(() => { uniforms.friction.value = friction; }, [friction, uniforms]);
  useEffect(() => { 
    uniforms.speedMin.value = speedRange[0]; 
    uniforms.speedMax.value = speedRange[1]; 
  }, [speedRange, uniforms]);
  useEffect(() => { uniforms.intensity.value = intensity; }, [intensity, uniforms]);
  useEffect(() => { 
    uniforms.rotationMin.value = rotation[0]; 
    uniforms.rotationMax.value = rotation[1]; 
  }, [rotation, uniforms]);
  useEffect(() => { 
    uniforms.lifetimeMin.value = lifetimeToFadeRate(lifetime[1]);
    uniforms.lifetimeMax.value = lifetimeToFadeRate(lifetime[0]);
  }, [lifetime, uniforms]);
  useEffect(() => { uniforms.dirMin.value.set(...directionMin); }, [directionMin, uniforms]);
  useEffect(() => { uniforms.dirMax.value.set(...directionMax); }, [directionMax, uniforms]);
  
  // Update colors
  useEffect(() => {
    uniforms.colorStartCount.value = colorStart.length;
    startColors.forEach((c, i) => {
      uniforms[`colorStart${i}`]?.value.setRGB(...c);
    });
  }, [colorStart, startColors, uniforms]);
  
  useEffect(() => {
    uniforms.colorEndCount.value = colorEnd.length;
    endColors.forEach((c, i) => {
      uniforms[`colorEnd${i}`]?.value.setRGB(...c);
    });
  }, [colorEnd, endColors, uniforms]);

  // GPU Storage arrays
  const { positions, velocities, lifetimes, fadeRates, particleSizes, particleRotations, particleColorStarts, particleColorEnds } = useMemo(
    () => ({
      positions: instancedArray(maxParticles, "vec3"),
      velocities: instancedArray(maxParticles, "vec3"),
      lifetimes: instancedArray(maxParticles, "float"),
      fadeRates: instancedArray(maxParticles, "float"),
      particleSizes: instancedArray(maxParticles, "float"),
      particleRotations: instancedArray(maxParticles, "float"),
      particleColorStarts: instancedArray(maxParticles, "vec3"),
      particleColorEnds: instancedArray(maxParticles, "vec3"),
    }),
    [maxParticles]
  );

  // Helper to select color from array based on index
  const selectColor = (idx, c0, c1, c2, c3, c4, c5, c6, c7) => {
    return idx.lessThan(1).select(c0,
      idx.lessThan(2).select(c1,
        idx.lessThan(3).select(c2,
          idx.lessThan(4).select(c3,
            idx.lessThan(5).select(c4,
              idx.lessThan(6).select(c5,
                idx.lessThan(7).select(c6, c7)
              )
            )
          )
        )
      )
    );
  };

  // Initialize all particles as dead
  const computeInit = useMemo(() => {
    return Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const lifetime = lifetimes.element(instanceIndex);
      const fadeRate = fadeRates.element(instanceIndex);
      const particleSize = particleSizes.element(instanceIndex);
      const particleRotation = particleRotations.element(instanceIndex);
      const colorStart = particleColorStarts.element(instanceIndex);
      const colorEnd = particleColorEnds.element(instanceIndex);

      position.assign(vec3(0, -1000, 0));
      velocity.assign(vec3(0, 0, 0));
      lifetime.assign(float(0));
      fadeRate.assign(float(0));
      particleSize.assign(float(0));
      particleRotation.assign(float(0));
      colorStart.assign(vec3(1, 1, 1));
      colorEnd.assign(vec3(1, 1, 1));
    })().compute(maxParticles);
  }, [maxParticles, positions, velocities, lifetimes, fadeRates, particleSizes, particleRotations, particleColorStarts, particleColorEnds]);

  // Spawn compute shader
  const computeSpawn = useMemo(() => {
    return Fn(() => {
      const idx = float(instanceIndex);
      const startIdx = uniforms.spawnIndexStart;
      const endIdx = uniforms.spawnIndexEnd;
      const seed = uniforms.spawnSeed;

      const inRange = startIdx.lessThan(endIdx)
        .select(
          idx.greaterThanEqual(startIdx).and(idx.lessThan(endIdx)),
          idx.greaterThanEqual(startIdx).or(idx.lessThan(endIdx))
        );

      If(inRange, () => {
        const position = positions.element(instanceIndex);
        const velocity = velocities.element(instanceIndex);
        const lifetime = lifetimes.element(instanceIndex);
        const fadeRate = fadeRates.element(instanceIndex);
        const particleSize = particleSizes.element(instanceIndex);
        const particleRotation = particleRotations.element(instanceIndex);
        const pColorStart = particleColorStarts.element(instanceIndex);
        const pColorEnd = particleColorEnds.element(instanceIndex);

        // Unique random per particle
        const particleSeed = idx.add(seed);
        const randDirX = hash(particleSeed.add(333));
        const randDirY = hash(particleSeed.add(444));
        const randDirZ = hash(particleSeed.add(555));
        const randFade = hash(particleSeed.add(666));
        const randColorStart = hash(particleSeed.add(777));
        const randColorEnd = hash(particleSeed.add(888));
        const randSize = hash(particleSeed.add(999));
        const randSpeed = hash(particleSeed.add(1111));
        const randRotation = hash(particleSeed.add(2222));

        // Position at spawn point (no random offset)
        position.assign(uniforms.spawnPosition);

        // Random direction (handle zero vector to avoid NaN from normalize)
        const dirX = mix(uniforms.dirMin.x, uniforms.dirMax.x, randDirX);
        const dirY = mix(uniforms.dirMin.y, uniforms.dirMax.y, randDirY);
        const dirZ = mix(uniforms.dirMin.z, uniforms.dirMax.z, randDirZ);
        const dirVec = vec3(dirX, dirY, dirZ);
        const dirLength = dirVec.length();
        // If direction is zero, use zero velocity; otherwise normalize
        const dir = dirLength.greaterThan(0.001).select(dirVec.div(dirLength), vec3(0, 0, 0));
        
        // Random speed between min and max
        const randomSpeed = mix(uniforms.speedMin, uniforms.speedMax, randSpeed);
        velocity.assign(dir.mul(randomSpeed));

        // Random fade rate
        const randomFade = mix(uniforms.lifetimeMin, uniforms.lifetimeMax, randFade);
        fadeRate.assign(randomFade);

        // Random size between min and max
        const randomSize = mix(uniforms.sizeMin, uniforms.sizeMax, randSize);
        particleSize.assign(randomSize);

        // Random rotation between min and max
        const randomRotation = mix(uniforms.rotationMin, uniforms.rotationMax, randRotation);
        particleRotation.assign(randomRotation);

        // Pick random start color from array
        const startColorIdx = floor(randColorStart.mul(uniforms.colorStartCount));
        const selectedStartColor = selectColor(
          startColorIdx,
          uniforms.colorStart0, uniforms.colorStart1, uniforms.colorStart2, uniforms.colorStart3,
          uniforms.colorStart4, uniforms.colorStart5, uniforms.colorStart6, uniforms.colorStart7
        );
        pColorStart.assign(selectedStartColor);

        // Pick random end color from array
        const endColorIdx = floor(randColorEnd.mul(uniforms.colorEndCount));
        const selectedEndColor = selectColor(
          endColorIdx,
          uniforms.colorEnd0, uniforms.colorEnd1, uniforms.colorEnd2, uniforms.colorEnd3,
          uniforms.colorEnd4, uniforms.colorEnd5, uniforms.colorEnd6, uniforms.colorEnd7
        );
        pColorEnd.assign(selectedEndColor);
        
        lifetime.assign(float(1));
      });
    })().compute(maxParticles);
  }, [maxParticles, positions, velocities, lifetimes, fadeRates, particleSizes, particleRotations, particleColorStarts, particleColorEnds, uniforms, selectColor]);

  // Update particles each frame (framerate independent)
  const computeUpdate = useMemo(() => {
    return Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const lifetime = lifetimes.element(instanceIndex);
      const fadeRate = fadeRates.element(instanceIndex);
      // Normalized delta: 1.0 at 60fps, 0.5 at 120fps, 2.0 at 30fps
      const dt60 = uniforms.deltaTime.mul(60);

      If(lifetime.greaterThan(0), () => {
        // All operations scaled by dt60 for framerate independence
        // Gravity scaled down by 0.02 for more intuitive values (0.05 prop ≈ 0.001 internal)
        velocity.addAssign(uniforms.gravity.mul(dt60).mul(0.001));
        velocity.mulAssign(uniforms.friction.pow(dt60));
        position.addAssign(velocity.mul(dt60));
        // fadeRate is per-second, multiply by actual deltaTime
        lifetime.subAssign(fadeRate.mul(uniforms.deltaTime));

        If(lifetime.lessThanEqual(0), () => {
          lifetime.assign(float(0));
          position.y.assign(float(-1000));
        });
      });
    })().compute(maxParticles);
  }, [maxParticles, positions, velocities, lifetimes, fadeRates, uniforms]);

  // Sprite material
  const material = useMemo(() => {
    const mat = new THREE.SpriteNodeMaterial();
    
    const lifetime = lifetimes.element(instanceIndex);
    const particleSize = particleSizes.element(instanceIndex);
    const particleRotation = particleRotations.element(instanceIndex);
    const pColorStart = particleColorStarts.element(instanceIndex);
    const pColorEnd = particleColorEnds.element(instanceIndex);
    
    const progress = float(1).sub(lifetime);
    
    const currentColor = mix(pColorStart, pColorEnd, progress);
    const intensifiedColor = currentColor.mul(uniforms.intensity);
    
    const sizeMultiplier = mix(uniforms.fadeSizeStart, uniforms.fadeSizeEnd, progress);
    const opacityMultiplier = mix(uniforms.fadeOpacityStart, uniforms.fadeOpacityEnd, progress);
    
    // Calculate UV - with flipbook support
    let sampleUV = uv();
    
    if (flipbook && alphaMap) {
      const rows = float(flipbook.rows || 1);
      const columns = float(flipbook.columns || 1);
      const totalFrames = rows.mul(columns);
      
      // Frame index based on lifetime progress (0 at birth → totalFrames-1 at death)
      const frameIndex = floor(progress.mul(totalFrames).min(totalFrames.sub(1)));
      
      // Calculate column and row
      const col = mod(frameIndex, columns);
      const row = floor(frameIndex.div(columns));
      
      // Scale UV to single frame size
      const scaledUV = uv().div(vec2(columns, rows));
      
      // Offset UV to correct frame (flip Y so row 0 is top)
      const offsetX = col.div(columns);
      const offsetY = rows.sub(1).sub(row).div(rows);
      
      sampleUV = scaledUV.add(vec2(offsetX, offsetY));
    }
    
    const dist = uv().mul(2).sub(1).length();
    
    let shapeMask;
    
    if (alphaMap) {
      const alphaSample = texture(alphaMap, sampleUV);
      shapeMask = alphaSample.r
    } else {
      switch (appearance) {
        case Appearance.DEFAULT:
          shapeMask = float(1);
          break;
        case Appearance.CIRCULAR:
          shapeMask = step(dist, float(1));
          break;
        case Appearance.GRADIENT:
        default:
          shapeMask = float(1).sub(dist).max(0);
          break;
      }
    }
    
    mat.colorNode = vec4(
      intensifiedColor,
      opacityMultiplier.mul(shapeMask).mul(lifetime.greaterThan(0.001).select(float(1), float(0)))
    );
    mat.positionNode = positions.toAttribute();
    mat.scaleNode = particleSize.mul(sizeMultiplier);
    mat.rotationNode = particleRotation;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = blending;
    
    return mat;
  }, [positions, lifetimes, particleSizes, particleRotations, particleColorStarts, particleColorEnds, uniforms, appearance, alphaMap, flipbook, blending]);

  // Create sprite once
  const sprite = useMemo(() => {
    const s = new THREE.Sprite(material);
    s.count = maxParticles;
    s.frustumCulled = false;
    return s;
  }, [material, maxParticles]);

  // Initialize on mount
  useEffect(() => {
    if (!renderer || initialized.current) return;
    renderer.computeAsync(computeInit).then(() => {
      initialized.current = true;
    });
  }, [renderer, computeInit]);

  // Spawn function - internal
  const spawnInternal = useCallback((x, y, z, count = 20) => {
    if (!initialized.current || !renderer) return;

    const startIdx = nextIndex.current;
    const endIdx = (startIdx + count) % maxParticles;

    uniforms.spawnPosition.value.set(x, y, z);
    uniforms.spawnIndexStart.value = startIdx;
    uniforms.spawnIndexEnd.value = endIdx;
    uniforms.spawnSeed.value = Math.random() * 10000;

    nextIndex.current = endIdx;
    renderer.computeAsync(computeSpawn);
  }, [renderer, computeSpawn, uniforms, maxParticles]);

  // Public spawn - uses position prop as offset
  const spawn = useCallback((x = 0, y = 0, z = 0, count = 20) => {
    const [px, py, pz] = positionRef.current;
    spawnInternal(px + x, py + y, pz + z, count);
  }, [spawnInternal]);

  // Update each frame + auto emit
  useFrame(async (state, delta) => {
    if (!initialized.current || !renderer) return;
    
    // Update deltaTime uniform for framerate independence
    uniforms.deltaTime.value = delta;
    
    // Update particles
    await renderer.computeAsync(computeUpdate);
    
    // Auto emit if enabled
    if (emitting) {
      const [px, py, pz] = positionRef.current;
      
      if (!delay) {
        // delay = 0 or undefined → emit every frame
        spawnInternal(px, py, pz, emitCount);
      } else {
        // delay > 0 → emit every X seconds
        emitAccumulator.current += delta;
        
        if (emitAccumulator.current >= delay) {
          emitAccumulator.current -= delay;
          spawnInternal(px, py, pz, emitCount);
        }
      }
    }
  });

  // Start/stop functions
  const start = useCallback(() => {
    setEmitting(true);
    emitAccumulator.current = 0;
  }, []);

  const stop = useCallback(() => {
    setEmitting(false);
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    spawn,
    start,
    stop,
    get isEmitting() { return emitting; },
    clear() {
      renderer.computeAsync(computeInit);
      nextIndex.current = 0;
    },
    uniforms,
  }), [spawn, start, stop, emitting, renderer, computeInit, uniforms]);

  return <primitive ref={spriteRef} object={sprite} />;
});