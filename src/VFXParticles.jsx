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
  positionLocal,
  cos,
  sin,
  atan2,
  sqrt,
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

// Normalize a prop to [min, max] array - if single value, use same for both
const toRange = (value, defaultVal = [0, 0]) => {
  if (value === undefined || value === null) return defaultVal;
  if (Array.isArray(value)) return value.length === 2 ? value : [value[0], value[0]];
  return [value, value];
};

// Normalize rotation prop - supports:
// - Single number: rotation={0.5} → same rotation for all
// - [min, max]: rotation={[0, Math.PI]} → random in range (Y-axis for sprites, all axes for geometry)
// - [[minX, maxX], [minY, maxY], [minZ, maxZ]]: full 3D control
const toRotation3D = (value) => {
  if (value === undefined || value === null) return [[0, 0], [0, 0], [0, 0]];
  if (typeof value === 'number') return [[value, value], [value, value], [value, value]];
  if (Array.isArray(value)) {
    // Check if nested array [[x], [y], [z]]
    if (Array.isArray(value[0])) {
      return [
        toRange(value[0], [0, 0]),
        toRange(value[1], [0, 0]),
        toRange(value[2], [0, 0]),
      ];
    }
    // Simple [min, max] - apply to all axes
    const range = toRange(value, [0, 0]);
    return [range, range, range];
  }
  return [[0, 0], [0, 0], [0, 0]];
};

export const VFXParticles = forwardRef(function VFXParticles(
  {
    maxParticles = 10000,
    size = [0.1, 0.3],
    colorStart = ["#ffffff"],
    colorEnd = null, // If null, uses colorStart (no color transition)
    fadeSize = [1, 0],
    fadeOpacity = [1, 0],
    gravity = [0, 0.001, 0],
    lifetime = [1, 2],
    directionMin = [-1, 0, -1],
    directionMax = [1, 1, 1],
    startPositionMin = [0, 0, 0],
    startPositionMax = [0, 0, 0],
    speed = [0.1, 0.1],
    friction = 0.99,
    appearance = Appearance.GRADIENT,
    alphaMap = null,
    flipbook = null, // { rows: 4, columns: 8 }
    rotation = [0, 0], // [min, max] in radians
    rotationSpeed = [0, 0], // [min, max] rotation speed in radians/second
    geometry = null, // Custom geometry (e.g. new THREE.SphereGeometry(0.5, 8, 8))
    orientToDirection = false, // Rotate geometry to face velocity direction (geometry mode only)
    castShadow = false,
    blending = Blending.NORMAL,
    intensity = 1,
    position = [0, 0, 0],
    autoStart = false,
    delay = 0,
    backdropNode = null, // TSL node or function for backdrop sampling
    opacityNode = null,  // TSL node or function for custom opacity control
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

  // Normalize props to [min, max] ranges
  const sizeRange = useMemo(() => toRange(size, [0.1, 0.3]), [size]);
  const speedRange = useMemo(() => toRange(speed, [0.1, 0.1]), [speed]);
  const fadeSizeRange = useMemo(() => toRange(fadeSize, [1, 0]), [fadeSize]);
  const fadeOpacityRange = useMemo(() => toRange(fadeOpacity, [1, 0]), [fadeOpacity]);
  const lifetimeRange = useMemo(() => toRange(lifetime, [1, 2]), [lifetime]);
  const rotation3D = useMemo(() => toRotation3D(rotation), [rotation]);
  const rotationSpeed3D = useMemo(() => toRotation3D(rotationSpeed), [rotationSpeed]);

  // Convert color arrays to RGB (support up to 8 colors each)
  const startColors = useMemo(() => {
    const colors = colorStart.slice(0, 8).map(hexToRgb);
    while (colors.length < 8) colors.push(colors[colors.length - 1] || [1, 1, 1]);
    return colors;
  }, [colorStart]);

  // Use colorStart if colorEnd is not provided (no color transition)
  const effectiveColorEnd = colorEnd ?? colorStart;
  
  const endColors = useMemo(() => {
    const colors = effectiveColorEnd.slice(0, 8).map(hexToRgb);
    while (colors.length < 8) colors.push(colors[colors.length - 1] || [1, 1, 1]);
    return colors;
  }, [effectiveColorEnd]);

  // Uniforms
  const uniforms = useMemo(
    () => ({
      sizeMin: uniform(sizeRange[0]),
      sizeMax: uniform(sizeRange[1]),
      fadeSizeStart: uniform(fadeSizeRange[0]),
      fadeSizeEnd: uniform(fadeSizeRange[1]),
      fadeOpacityStart: uniform(fadeOpacityRange[0]),
      fadeOpacityEnd: uniform(fadeOpacityRange[1]),
      gravity: uniform(new THREE.Vector3(...gravity)),
      friction: uniform(friction),
      speedMin: uniform(speedRange[0]),
      speedMax: uniform(speedRange[1]),
      lifetimeMin: uniform(lifetimeToFadeRate(lifetimeRange[1])),
      lifetimeMax: uniform(lifetimeToFadeRate(lifetimeRange[0])),
      deltaTime: uniform(1/60), // Will be updated each frame
      dirMin: uniform(new THREE.Vector3(...directionMin)),
      dirMax: uniform(new THREE.Vector3(...directionMax)),
      startPosMin: uniform(new THREE.Vector3(...startPositionMin)),
      startPosMax: uniform(new THREE.Vector3(...startPositionMax)),
      spawnPosition: uniform(new THREE.Vector3(...position)),
      spawnIndexStart: uniform(0),
      spawnIndexEnd: uniform(0),
      spawnSeed: uniform(0),
      intensity: uniform(intensity),
      // 3D rotation ranges
      rotationMinX: uniform(rotation3D[0][0]),
      rotationMaxX: uniform(rotation3D[0][1]),
      rotationMinY: uniform(rotation3D[1][0]),
      rotationMaxY: uniform(rotation3D[1][1]),
      rotationMinZ: uniform(rotation3D[2][0]),
      rotationMaxZ: uniform(rotation3D[2][1]),
      // 3D rotation speed ranges (radians/second)
      rotationSpeedMinX: uniform(rotationSpeed3D[0][0]),
      rotationSpeedMaxX: uniform(rotationSpeed3D[0][1]),
      rotationSpeedMinY: uniform(rotationSpeed3D[1][0]),
      rotationSpeedMaxY: uniform(rotationSpeed3D[1][1]),
      rotationSpeedMinZ: uniform(rotationSpeed3D[2][0]),
      rotationSpeedMaxZ: uniform(rotationSpeed3D[2][1]),
      // Color arrays (8 colors max each)
      colorStartCount: uniform(colorStart.length),
      colorEndCount: uniform(effectiveColorEnd.length),
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
  
  // Update all uniforms when props change
  useEffect(() => {
    positionRef.current = position;
    
    // Size
    uniforms.sizeMin.value = sizeRange[0];
    uniforms.sizeMax.value = sizeRange[1];
    
    // Fade
    uniforms.fadeSizeStart.value = fadeSizeRange[0];
    uniforms.fadeSizeEnd.value = fadeSizeRange[1];
    uniforms.fadeOpacityStart.value = fadeOpacityRange[0];
    uniforms.fadeOpacityEnd.value = fadeOpacityRange[1];
    
    // Physics
    uniforms.gravity.value.set(...gravity);
    uniforms.friction.value = friction;
    uniforms.speedMin.value = speedRange[0];
    uniforms.speedMax.value = speedRange[1];
    
    // Lifetime
    uniforms.lifetimeMin.value = lifetimeToFadeRate(lifetimeRange[1]);
    uniforms.lifetimeMax.value = lifetimeToFadeRate(lifetimeRange[0]);
    
    // Direction
    uniforms.dirMin.value.set(...directionMin);
    uniforms.dirMax.value.set(...directionMax);
    
    // Start position offset
    uniforms.startPosMin.value.set(...startPositionMin);
    uniforms.startPosMax.value.set(...startPositionMax);
    
    // 3D Rotation
    uniforms.rotationMinX.value = rotation3D[0][0];
    uniforms.rotationMaxX.value = rotation3D[0][1];
    uniforms.rotationMinY.value = rotation3D[1][0];
    uniforms.rotationMaxY.value = rotation3D[1][1];
    uniforms.rotationMinZ.value = rotation3D[2][0];
    uniforms.rotationMaxZ.value = rotation3D[2][1];
    
    // 3D Rotation Speed
    uniforms.rotationSpeedMinX.value = rotationSpeed3D[0][0];
    uniforms.rotationSpeedMaxX.value = rotationSpeed3D[0][1];
    uniforms.rotationSpeedMinY.value = rotationSpeed3D[1][0];
    uniforms.rotationSpeedMaxY.value = rotationSpeed3D[1][1];
    uniforms.rotationSpeedMinZ.value = rotationSpeed3D[2][0];
    uniforms.rotationSpeedMaxZ.value = rotationSpeed3D[2][1];
    
    // Intensity
    uniforms.intensity.value = intensity;
    
    // Colors
    uniforms.colorStartCount.value = colorStart.length;
    uniforms.colorEndCount.value = effectiveColorEnd.length;
    startColors.forEach((c, i) => {
      uniforms[`colorStart${i}`]?.value.setRGB(...c);
    });
    endColors.forEach((c, i) => {
      uniforms[`colorEnd${i}`]?.value.setRGB(...c);
    });
  }, [
    position, sizeRange, fadeSizeRange, fadeOpacityRange, gravity, friction, 
    speedRange, lifetimeRange, directionMin, directionMax, rotation3D, 
    intensity, colorStart, effectiveColorEnd, startColors, endColors, uniforms
  ]);

  // GPU Storage arrays
  const { positions, velocities, lifetimes, fadeRates, particleSizes, particleRotations, particleColorStarts, particleColorEnds } = useMemo(
    () => ({
      positions: instancedArray(maxParticles, "vec3"),
      velocities: instancedArray(maxParticles, "vec3"),
      lifetimes: instancedArray(maxParticles, "float"),
      fadeRates: instancedArray(maxParticles, "float"),
      particleSizes: instancedArray(maxParticles, "float"),
      particleRotations: instancedArray(maxParticles, "vec3"), // X, Y, Z rotations
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
      particleRotation.assign(vec3(0, 0, 0));
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
        const randRotationX = hash(particleSeed.add(2222));
        const randRotationY = hash(particleSeed.add(3333));
        const randRotationZ = hash(particleSeed.add(4444));
        const randPosX = hash(particleSeed.add(5555));
        const randPosY = hash(particleSeed.add(6666));
        const randPosZ = hash(particleSeed.add(7777));

        // Position at spawn point + random offset
        const offsetX = mix(uniforms.startPosMin.x, uniforms.startPosMax.x, randPosX);
        const offsetY = mix(uniforms.startPosMin.y, uniforms.startPosMax.y, randPosY);
        const offsetZ = mix(uniforms.startPosMin.z, uniforms.startPosMax.z, randPosZ);
        position.assign(uniforms.spawnPosition.add(vec3(offsetX, offsetY, offsetZ)));

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

        // Random 3D rotation between min and max for each axis
        const rotX = mix(uniforms.rotationMinX, uniforms.rotationMaxX, randRotationX);
        const rotY = mix(uniforms.rotationMinY, uniforms.rotationMaxY, randRotationY);
        const rotZ = mix(uniforms.rotationMinZ, uniforms.rotationMaxZ, randRotationZ);
        particleRotation.assign(vec3(rotX, rotY, rotZ));

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
      const particleRotation = particleRotations.element(instanceIndex);
      // Normalized delta: 1.0 at 60fps, 0.5 at 120fps, 2.0 at 30fps
      const dt60 = uniforms.deltaTime.mul(60);

      If(lifetime.greaterThan(0), () => {
        // All operations scaled by dt60 for framerate independence
        // Gravity scaled down by 0.02 for more intuitive values (0.05 prop ≈ 0.001 internal)
        velocity.addAssign(uniforms.gravity.mul(dt60).mul(0.001));
        velocity.mulAssign(uniforms.friction.pow(dt60));
        position.addAssign(velocity.mul(dt60));
        
        // Calculate rotation speed per-particle using hash (consistent per particle)
        const idx = float(instanceIndex);
        const rotSpeedX = mix(uniforms.rotationSpeedMinX, uniforms.rotationSpeedMaxX, hash(idx.add(8888)));
        const rotSpeedY = mix(uniforms.rotationSpeedMinY, uniforms.rotationSpeedMaxY, hash(idx.add(9999)));
        const rotSpeedZ = mix(uniforms.rotationSpeedMinZ, uniforms.rotationSpeedMaxZ, hash(idx.add(10101)));
        
        // Apply rotation speed (radians/second * deltaTime)
        particleRotation.addAssign(vec3(rotSpeedX, rotSpeedY, rotSpeedZ).mul(uniforms.deltaTime));
        
        // fadeRate is per-second, multiply by actual deltaTime
        lifetime.subAssign(fadeRate.mul(uniforms.deltaTime));

        If(lifetime.lessThanEqual(0), () => {
          lifetime.assign(float(0));
          position.y.assign(float(-1000));
        });
      });
    })().compute(maxParticles);
  }, [maxParticles, positions, velocities, lifetimes, fadeRates, particleRotations, uniforms]);

  // Material (either Sprite or Mesh material based on geometry prop)
  const material = useMemo(() => {
    const lifetime = lifetimes.element(instanceIndex);
    const particleSize = particleSizes.element(instanceIndex);
    const particleRotation = particleRotations.element(instanceIndex);
    const pColorStart = particleColorStarts.element(instanceIndex);
    const pColorEnd = particleColorEnds.element(instanceIndex);
    const particlePos = positions.element(instanceIndex);
    const particleVel = velocities.element(instanceIndex);
    
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
    
    let shapeMask;
    
    if (geometry) {
      // For custom geometry, don't apply UV-based shape masking
      shapeMask = float(1);
    } else if (alphaMap) {
      const alphaSample = texture(alphaMap, sampleUV);
      shapeMask = alphaSample.r;
    } else {
      const dist = uv().mul(2).sub(1).length();
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
    
    const baseOpacity = opacityMultiplier.mul(shapeMask).mul(lifetime.greaterThan(0.001).select(float(1), float(0)));
    
    // Particle data object for function-based nodes
    const particleData = {
      progress,           // 0→1 over lifetime
      lifetime,           // 1→0 over lifetime (inverse of progress)
      position: particlePos,  // vec3 world position
      velocity: particleVel,  // vec3 velocity
      size: particleSize,     // float size
      rotation: particleRotation, // vec3 rotation (x, y, z)
      colorStart: pColorStart,    // vec3 start color
      colorEnd: pColorEnd,        // vec3 end color
      color: currentColor,        // vec3 interpolated color
      index: instanceIndex,       // particle index (for randomization)
    };
    
    // Apply custom opacity node if provided (multiplies with base opacity)
    const finalOpacity = opacityNode
      ? baseOpacity.mul(typeof opacityNode === 'function' ? opacityNode(particleData) : opacityNode)
      : baseOpacity;
    
    if (geometry) {
      // InstancedMesh mode with custom geometry
      const mat = new THREE.MeshStandardNodeMaterial();
      
      // Scale local position and add particle world position
      const scale = particleSize.mul(sizeMultiplier);
      
      let rotX, rotY, rotZ;
      
      if (orientToDirection) {
        // Calculate rotation from velocity to orient geometry along movement direction
        // Yaw (Y rotation) - direction on XZ plane
        rotY = atan2(particleVel.x, particleVel.z);
        
        // Pitch (X rotation) - vertical angle
        const horizontalSpeed = sqrt(particleVel.x.mul(particleVel.x).add(particleVel.z.mul(particleVel.z)));
        rotX = atan2(particleVel.y.negate(), horizontalSpeed);
        
        // No roll
        rotZ = float(0);
      } else {
        // Use stored particle rotation
        rotX = particleRotation.x;
        rotY = particleRotation.y;
        rotZ = particleRotation.z;
      }
      
      // Rotation around X axis
      const cX = cos(rotX);
      const sX = sin(rotX);
      const afterX = vec3(
        positionLocal.x,
        positionLocal.y.mul(cX).sub(positionLocal.z.mul(sX)),
        positionLocal.y.mul(sX).add(positionLocal.z.mul(cX))
      );
      
      // Rotation around Y axis
      const cY = cos(rotY);
      const sY = sin(rotY);
      const afterY = vec3(
        afterX.x.mul(cY).add(afterX.z.mul(sY)),
        afterX.y,
        afterX.z.mul(cY).sub(afterX.x.mul(sY))
      );
      
      // Rotation around Z axis
      const cZ = cos(rotZ);
      const sZ = sin(rotZ);
      const rotatedPos = vec3(
        afterY.x.mul(cZ).sub(afterY.y.mul(sZ)),
        afterY.x.mul(sZ).add(afterY.y.mul(cZ)),
        afterY.z
      );
      
      mat.positionNode = rotatedPos.mul(scale).add(particlePos);
      mat.colorNode = vec4(intensifiedColor, finalOpacity);
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = blending;
      mat.side = THREE.DoubleSide;
      
      // Apply custom backdrop node if provided (for advanced effects like refraction)
      // Supports both direct TSL node OR function that receives particle data
      if (backdropNode) {
        mat.backdropNode = typeof backdropNode === 'function' 
          ? backdropNode(particleData)
          : backdropNode;
      }
      
      return mat;
    } else {
      // Sprite mode (default) - uses Y rotation only for 2D sprites
      const mat = new THREE.SpriteNodeMaterial();
      
      mat.colorNode = vec4(intensifiedColor, finalOpacity);
      mat.positionNode = positions.toAttribute();
      mat.scaleNode = particleSize.mul(sizeMultiplier);
      mat.rotationNode = particleRotation.y; // Use Y rotation for sprites
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = blending;
      
      // Apply custom backdrop node if provided (for advanced effects like refraction)
      // Supports both direct TSL node OR function that receives particle data
      if (backdropNode) {
        mat.backdropNode = typeof backdropNode === 'function' 
          ? backdropNode(particleData)
          : backdropNode;
      }
      
      return mat;
    }
  }, [positions, velocities, lifetimes, particleSizes, particleRotations, particleColorStarts, particleColorEnds, uniforms, appearance, alphaMap, flipbook, blending, geometry, orientToDirection, backdropNode, opacityNode]);

  // Create sprite or instanced mesh based on geometry prop
  const renderObject = useMemo(() => {
    if (geometry) {
      // InstancedMesh mode
      const mesh = new THREE.InstancedMesh(geometry, material, maxParticles);
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow;
      return mesh;
    } else {
      // Sprite mode (default)
      const s = new THREE.Sprite(material);
      s.count = maxParticles;
      s.frustumCulled = false;
      return s;
    }
  }, [material, maxParticles, geometry, castShadow]);

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

  return <primitive ref={spriteRef} object={renderObject} />;
});