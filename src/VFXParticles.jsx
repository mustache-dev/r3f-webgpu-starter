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
  acos,
  PI,
  mx_noise_vec3,
  screenUV,
  viewportDepthTexture,
  positionView,
  cameraNear,
  cameraFar,
  clamp,
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

// Emitter shape types
export const EmitterShape = Object.freeze({
  POINT: 0,   // Single point emission
  BOX: 1,     // Box/cube volume (uses startPositionMin/Max)
  SPHERE: 2,  // Sphere surface or volume
  CONE: 3,    // Cone shape (great for fire, fountains)
  DISK: 4,    // Flat disk/circle
  EDGE: 5,    // Line between two points
});

// Attractor types
export const AttractorType = Object.freeze({
  POINT: 0,   // Pull toward a point (or push if negative strength)
  VORTEX: 1,  // Swirl around an axis
});

// Easing types for curves (friction, etc.)
export const Easing = Object.freeze({
  LINEAR: 0,
  EASE_IN: 1,
  EASE_OUT: 2,
  EASE_IN_OUT: 3,
});

// Lighting/material types for geometry-based particles
export const Lighting = Object.freeze({
  BASIC: "basic",       // No lighting, flat colors (MeshBasicNodeMaterial)
  STANDARD: "standard", // Standard PBR (MeshStandardNodeMaterial)
  PHYSICAL: "physical", // Advanced PBR with clearcoat, transmission, etc. (MeshPhysicalNodeMaterial)
});

// Max number of attractors supported
const MAX_ATTRACTORS = 4;

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

// Convert easing string to type number
const easingToType = (easing) => {
  if (typeof easing === 'number') return easing;
  switch (easing) {
    case 'easeIn': return 1;
    case 'easeOut': return 2;
    case 'easeInOut': return 3;
    default: return 0; // linear
  }
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
    friction = { intensity: 0, easing: 'linear' }, // { intensity: [start, end] or single value, easing: string }
    // intensity: 1 = max friction (almost stopped), 0 = no friction (normal), negative = boost/acceleration
    appearance = Appearance.GRADIENT,
    alphaMap = null,
    flipbook = null, // { rows: 4, columns: 8 }
    rotation = [0, 0], // [min, max] in radians
    rotationSpeed = [0, 0], // [min, max] rotation speed in radians/second
    geometry = null, // Custom geometry (e.g. new THREE.SphereGeometry(0.5, 8, 8))
    orientToDirection = false, // Rotate geometry to face velocity direction (geometry mode only)
    lighting = Lighting.STANDARD, // 'basic' | 'standard' | 'physical' - material type for geometry mode
    shadow = false, // Enable both castShadow and receiveShadow on geometry instances
    blending = Blending.NORMAL,
    intensity = 1,
    position = [0, 0, 0],
    autoStart = false,
    delay = 0,
    backdropNode = null, // TSL node or function for backdrop sampling
    opacityNode = null,  // TSL node or function for custom opacity control
    colorNode = null,    // TSL node or function to override color (receives particleData, should return vec4)
    castShadowNode = null,   // TSL node or function for shadow map output (what shadow the particle casts)
    emitCount = 1,
    // Emitter shape props
    emitterShape = EmitterShape.BOX, // Emission shape type
    emitterRadius = [0, 1], // [inner, outer] radius for sphere/cone/disk (inner=0 for solid)
    emitterAngle = Math.PI / 4, // Cone angle in radians (0 = line, PI/2 = hemisphere)
    emitterHeight = [0, 1], // [min, max] height for cone
    emitterSurfaceOnly = false, // Emit from surface only (sphere/disk)
    emitterDirection = [0, 1, 0], // Direction for cone/disk normal
    // Turbulence (curl noise)
    turbulence = null, // { intensity: 0.5, frequency: 1, speed: 1 }
    // Attractors - array of up to 4 attractors
    // { position: [x,y,z], strength: 1, radius: 3, type: 'point'|'vortex', axis?: [x,y,z] }
    attractors = null,
    // Simple attract to center - particles move from spawn position to center over lifetime
    // Overrides speed/direction - lifetime controls how long it takes to reach center
    attractToCenter = false,
    // Soft particles - fade when intersecting scene geometry
    softParticles = false,
    softDistance = 0.5, // Distance in world units over which to fade
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
  const emitterRadiusRange = useMemo(() => toRange(emitterRadius, [0, 1]), [emitterRadius]);
  const emitterHeightRange = useMemo(() => toRange(emitterHeight, [0, 1]), [emitterHeight]);
  
  // Parse friction object: { intensity: [start, end] or single value, easing: string }
  const frictionIntensityRange = useMemo(() => {
    if (typeof friction === 'object' && friction !== null && 'intensity' in friction) {
      return toRange(friction.intensity, [0, 0]);
    }
    return [0, 0]; // Default: no friction
  }, [friction]);
  const frictionEasingType = useMemo(() => {
    if (typeof friction === 'object' && friction !== null && 'easing' in friction) {
      return easingToType(friction.easing);
    }
    return 0; // linear
  }, [friction]);

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
      frictionIntensityStart: uniform(frictionIntensityRange[0]),
      frictionIntensityEnd: uniform(frictionIntensityRange[1]),
      frictionEasingType: uniform(frictionEasingType),
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
      // Emitter shape uniforms
      emitterShapeType: uniform(emitterShape),
      emitterRadiusInner: uniform(emitterRadiusRange[0]),
      emitterRadiusOuter: uniform(emitterRadiusRange[1]),
      emitterAngle: uniform(emitterAngle),
      emitterHeightMin: uniform(emitterHeightRange[0]),
      emitterHeightMax: uniform(emitterHeightRange[1]),
      emitterSurfaceOnly: uniform(emitterSurfaceOnly ? 1 : 0),
      emitterDir: uniform(new THREE.Vector3(...emitterDirection).normalize()),
      // Turbulence uniforms
      turbulenceIntensity: uniform(turbulence?.intensity ?? 0),
      turbulenceFrequency: uniform(turbulence?.frequency ?? 1),
      turbulenceSpeed: uniform(turbulence?.speed ?? 1),
      turbulenceTime: uniform(0), // Updated each frame
      // Attractor uniforms (up to 4)
      attractorCount: uniform(0),
      attractor0Pos: uniform(new THREE.Vector3(0, 0, 0)),
      attractor0Strength: uniform(0),
      attractor0Radius: uniform(1),
      attractor0Type: uniform(0),
      attractor0Axis: uniform(new THREE.Vector3(0, 1, 0)),
      attractor1Pos: uniform(new THREE.Vector3(0, 0, 0)),
      attractor1Strength: uniform(0),
      attractor1Radius: uniform(1),
      attractor1Type: uniform(0),
      attractor1Axis: uniform(new THREE.Vector3(0, 1, 0)),
      attractor2Pos: uniform(new THREE.Vector3(0, 0, 0)),
      attractor2Strength: uniform(0),
      attractor2Radius: uniform(1),
      attractor2Type: uniform(0),
      attractor2Axis: uniform(new THREE.Vector3(0, 1, 0)),
      attractor3Pos: uniform(new THREE.Vector3(0, 0, 0)),
      attractor3Strength: uniform(0),
      attractor3Radius: uniform(1),
      attractor3Type: uniform(0),
      attractor3Axis: uniform(new THREE.Vector3(0, 1, 0)),
      // Simple attract to center
      attractToCenter: uniform(attractToCenter ? 1 : 0),
      // Soft particles
      softParticlesEnabled: uniform(softParticles ? 1 : 0),
      softDistance: uniform(softDistance),
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
    uniforms.frictionIntensityStart.value = frictionIntensityRange[0];
    uniforms.frictionIntensityEnd.value = frictionIntensityRange[1];
    uniforms.frictionEasingType.value = frictionEasingType;
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
    
    // Emitter shape
    uniforms.emitterShapeType.value = emitterShape;
    uniforms.emitterRadiusInner.value = emitterRadiusRange[0];
    uniforms.emitterRadiusOuter.value = emitterRadiusRange[1];
    uniforms.emitterAngle.value = emitterAngle;
    uniforms.emitterHeightMin.value = emitterHeightRange[0];
    uniforms.emitterHeightMax.value = emitterHeightRange[1];
    uniforms.emitterSurfaceOnly.value = emitterSurfaceOnly ? 1 : 0;
    uniforms.emitterDir.value.set(...emitterDirection).normalize();
    
    // Turbulence
    uniforms.turbulenceIntensity.value = turbulence?.intensity ?? 0;
    uniforms.turbulenceFrequency.value = turbulence?.frequency ?? 1;
    uniforms.turbulenceSpeed.value = turbulence?.speed ?? 1;
    
    // Attractors
    const attractorList = attractors ?? [];
    uniforms.attractorCount.value = Math.min(attractorList.length, MAX_ATTRACTORS);
    for (let i = 0; i < MAX_ATTRACTORS; i++) {
      const a = attractorList[i];
      if (a) {
        uniforms[`attractor${i}Pos`].value.set(...(a.position ?? [0, 0, 0]));
        uniforms[`attractor${i}Strength`].value = a.strength ?? 1;
        uniforms[`attractor${i}Radius`].value = a.radius ?? 0; // 0 = infinite
        uniforms[`attractor${i}Type`].value = a.type === 'vortex' ? 1 : 0;
        uniforms[`attractor${i}Axis`].value.set(...(a.axis ?? [0, 1, 0])).normalize();
      } else {
        uniforms[`attractor${i}Strength`].value = 0;
      }
    }
    
    // Simple attract to center
    uniforms.attractToCenter.value = attractToCenter ? 1 : 0;
    
    // Soft particles
    uniforms.softParticlesEnabled.value = softParticles ? 1 : 0;
    uniforms.softDistance.value = softDistance;
  }, [
    position, sizeRange, fadeSizeRange, fadeOpacityRange, gravity, frictionIntensityRange, frictionEasingType,
    speedRange, lifetimeRange, directionMin, directionMax, rotation3D, rotationSpeed3D,
    intensity, colorStart, effectiveColorEnd, startColors, endColors, uniforms,
    emitterShape, emitterRadiusRange, emitterAngle, emitterHeightRange, emitterSurfaceOnly, emitterDirection,
    turbulence, startPositionMin, startPositionMax, attractors, attractToCenter, softParticles, softDistance
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
        const randRadius = hash(particleSeed.add(8880));
        const randTheta = hash(particleSeed.add(9990));
        const randPhi = hash(particleSeed.add(10100));
        const randHeight = hash(particleSeed.add(11110));

        // Calculate position based on emitter shape
        const shapeType = uniforms.emitterShapeType;
        const radiusInner = uniforms.emitterRadiusInner;
        const radiusOuter = uniforms.emitterRadiusOuter;
        const coneAngle = uniforms.emitterAngle;
        const heightMin = uniforms.emitterHeightMin;
        const heightMax = uniforms.emitterHeightMax;
        const surfaceOnly = uniforms.emitterSurfaceOnly;
        const emitDir = uniforms.emitterDir;

        // Theta: full rotation around Y axis (0 to 2*PI)
        const theta = randTheta.mul(PI.mul(2));
        
        // For sphere: phi is the vertical angle (0 to PI for full sphere)
        // Using acos for uniform distribution on sphere surface
        const phi = acos(float(1).sub(randPhi.mul(2)));
        
        // Radius interpolation (inner to outer, with optional surface-only)
        // For volume: use cube root for uniform volume distribution
        // For surface: use outer radius only
        const radiusT = surfaceOnly.greaterThan(0.5).select(
          float(1),
          randRadius.pow(float(1).div(3)) // Cube root for uniform volume
        );
        const radius = mix(radiusInner, radiusOuter, radiusT);

        // === SHAPE CALCULATIONS ===
        
        // Pre-compute rotation values for emitDir (rotate from Y-up to emitDir)
        // Dot product with Y axis
        const cosAngle = emitDir.y;
        // Cross product: (0,1,0) × emitDir = (-emitDir.z, 0, emitDir.x)
        const axisX = emitDir.z.negate();
        const axisZ = emitDir.x;
        const axisLenSq = axisX.mul(axisX).add(axisZ.mul(axisZ));
        const axisLen = sqrt(axisLenSq.max(0.0001)); // Avoid division by zero
        const kx = axisX.div(axisLen);
        const kz = axisZ.div(axisLen);
        const sinAngle = axisLen;
        const oneMinusCos = float(1).sub(cosAngle);
        
        // Helper: rotate a vector from Y-up to align with emitDir
        // Using Rodrigues' rotation formula simplified for rotating from (0,1,0)
        const rotateToEmitDir = (localPos) => {
          // k × localPos where k = (kx, 0, kz)
          const crossX = kz.mul(localPos.y).negate();
          const crossY = kz.mul(localPos.x).sub(kx.mul(localPos.z));
          const crossZ = kx.mul(localPos.y);
          
          // k · localPos
          const kDotV = kx.mul(localPos.x).add(kz.mul(localPos.z));
          
          // Rodrigues rotation
          const rotatedX = localPos.x.mul(cosAngle).add(crossX.mul(sinAngle)).add(kx.mul(kDotV).mul(oneMinusCos));
          const rotatedY = localPos.y.mul(cosAngle).add(crossY.mul(sinAngle));
          const rotatedZ = localPos.z.mul(cosAngle).add(crossZ.mul(sinAngle)).add(kz.mul(kDotV).mul(oneMinusCos));
          
          // If emitDir is nearly parallel to Y, use simpler logic
          return cosAngle.greaterThan(0.999).select(
            localPos,
            cosAngle.lessThan(-0.999).select(
              vec3(localPos.x, localPos.y.negate(), localPos.z),
              vec3(rotatedX, rotatedY, rotatedZ)
            )
          );
        };
        
        // BOX (shape 1): use startPositionMin/Max
        const boxOffsetX = mix(uniforms.startPosMin.x, uniforms.startPosMax.x, randPosX);
        const boxOffsetY = mix(uniforms.startPosMin.y, uniforms.startPosMax.y, randPosY);
        const boxOffsetZ = mix(uniforms.startPosMin.z, uniforms.startPosMax.z, randPosZ);
        const boxPos = vec3(boxOffsetX, boxOffsetY, boxOffsetZ);
        
        // SPHERE (shape 2): spherical coordinates
        const sphereX = radius.mul(sin(phi)).mul(cos(theta));
        const sphereY = radius.mul(cos(phi));
        const sphereZ = radius.mul(sin(phi)).mul(sin(theta));
        const spherePos = vec3(sphereX, sphereY, sphereZ);
        
        // CONE (shape 3): emit within cone angle, with height
        // Cone points along emitDir, angle is half-angle from center
        const coneH = mix(heightMin, heightMax, randHeight);
        const coneR = coneH.mul(sin(coneAngle)).mul(radiusT);
        const coneLocalX = coneR.mul(cos(theta));
        const coneLocalY = coneH.mul(cos(coneAngle));
        const coneLocalZ = coneR.mul(sin(theta));
        const conePos = rotateToEmitDir(vec3(coneLocalX, coneLocalY, coneLocalZ));
        
        // DISK (shape 4): flat circle on XZ plane, then rotated to emitDir
        const diskR = surfaceOnly.greaterThan(0.5).select(
          radiusOuter,
          mix(radiusInner, radiusOuter, sqrt(randRadius)) // sqrt for uniform area distribution
        );
        const diskLocalX = diskR.mul(cos(theta));
        const diskLocalZ = diskR.mul(sin(theta));
        // Disk is in XZ plane (Y=0), rotate so Y-up becomes emitDir
        const diskPos = rotateToEmitDir(vec3(diskLocalX, float(0), diskLocalZ));
        
        // EDGE (shape 5): line between startPosMin and startPosMax
        const edgeT = randPosX;
        const edgePos = vec3(
          mix(uniforms.startPosMin.x, uniforms.startPosMax.x, edgeT),
          mix(uniforms.startPosMin.y, uniforms.startPosMax.y, edgeT),
          mix(uniforms.startPosMin.z, uniforms.startPosMax.z, edgeT)
        );
        
        // POINT (shape 0): no offset
        const pointPos = vec3(0, 0, 0);
        
        // Select position based on shape type
        const shapeOffset = shapeType.lessThan(0.5).select(pointPos,        // 0: POINT
          shapeType.lessThan(1.5).select(boxPos,                             // 1: BOX
            shapeType.lessThan(2.5).select(spherePos,                        // 2: SPHERE
              shapeType.lessThan(3.5).select(conePos,                        // 3: CONE
                shapeType.lessThan(4.5).select(diskPos,                      // 4: DISK
                  edgePos                                                     // 5: EDGE
                )
              )
            )
          )
        );
        
        position.assign(uniforms.spawnPosition.add(shapeOffset));

        // Random fade rate (needed before velocity calc for attractToCenter)
        const randomFade = mix(uniforms.lifetimeMin, uniforms.lifetimeMax, randFade);
        fadeRate.assign(randomFade);

        // Velocity calculation
        const useAttractToCenter = uniforms.attractToCenter.greaterThan(0.5);
        
        // AttractToCenter: velocity = -shapeOffset * fadeRate / 60
        // This makes particles reach center exactly when they die
        const attractVelocity = shapeOffset.negate().mul(randomFade).div(60);
        
        // Normal velocity: random direction * speed
        const dirX = mix(uniforms.dirMin.x, uniforms.dirMax.x, randDirX);
        const dirY = mix(uniforms.dirMin.y, uniforms.dirMax.y, randDirY);
        const dirZ = mix(uniforms.dirMin.z, uniforms.dirMax.z, randDirZ);
        const dirVec = vec3(dirX, dirY, dirZ);
        const dirLength = dirVec.length();
        const dir = dirLength.greaterThan(0.001).select(dirVec.div(dirLength), vec3(0, 0, 0));
        const randomSpeed = mix(uniforms.speedMin, uniforms.speedMax, randSpeed);
        const normalVelocity = dir.mul(randomSpeed);
        
        // Select velocity mode
        velocity.assign(useAttractToCenter.select(attractVelocity, normalVelocity));

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
        
        // Friction with curve support
        // Calculate particle progress (0 at birth, 1 at death)
        const progress = float(1).sub(lifetime);
        
        // Apply easing function based on frictionEasingType
        // 0 = linear, 1 = easeIn, 2 = easeOut, 3 = easeInOut
        const easingType = uniforms.frictionEasingType;
        const easedProgress = easingType.lessThan(0.5).select(
          // Linear: t
          progress,
          easingType.lessThan(1.5).select(
            // EaseIn: t^2
            progress.mul(progress),
            easingType.lessThan(2.5).select(
              // EaseOut: 1 - (1-t)^2
              float(1).sub(float(1).sub(progress).mul(float(1).sub(progress))),
              // EaseInOut: t < 0.5 ? 2t^2 : 1 - (-2t + 2)^2 / 2
              progress.lessThan(0.5).select(
                float(2).mul(progress).mul(progress),
                float(1).sub(float(-2).mul(progress).add(2).pow(2).div(2))
              )
            )
          )
        );
        
        // Interpolate friction intensity between start and end
        // intensity: 1 = max friction (almost stopped), 0 = no friction (normal), negative = boost
        const currentIntensity = mix(uniforms.frictionIntensityStart, uniforms.frictionIntensityEnd, easedProgress);
        
        // Map intensity to speed scale (throttle, not destructive):
        // intensity  1 → scale 0.1 (move at 10% speed)
        // intensity  0 → scale 1.0 (move at full speed)
        // intensity -1 → scale 1.9 (move at 190% speed)
        // This doesn't destroy velocity - it just throttles how much is applied to position
        const speedScale = float(1).sub(currentIntensity.mul(0.9));
        
        // Curl noise turbulence
        const turbIntensity = uniforms.turbulenceIntensity;
        const turbFreq = uniforms.turbulenceFrequency;
        const turbTime = uniforms.turbulenceTime;
        
        // Only apply if turbulence intensity > 0
        If(turbIntensity.greaterThan(0.001), () => {
          // Sample position in noise space (scaled by frequency, offset by time)
          const noisePos = position.mul(turbFreq).add(vec3(turbTime, turbTime.mul(0.7), turbTime.mul(1.3)));
          
          // Compute curl of noise field using finite differences
          // curl(F) = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
          const eps = float(0.01); // Small offset for derivatives
          
          // Sample noise at offset positions for partial derivatives
          const nPosX = mx_noise_vec3(noisePos.add(vec3(eps, 0, 0)));
          const nNegX = mx_noise_vec3(noisePos.sub(vec3(eps, 0, 0)));
          const nPosY = mx_noise_vec3(noisePos.add(vec3(0, eps, 0)));
          const nNegY = mx_noise_vec3(noisePos.sub(vec3(0, eps, 0)));
          const nPosZ = mx_noise_vec3(noisePos.add(vec3(0, 0, eps)));
          const nNegZ = mx_noise_vec3(noisePos.sub(vec3(0, 0, eps)));
          
          // Compute partial derivatives
          const dFx_dy = nPosY.x.sub(nNegY.x).div(eps.mul(2));
          const dFx_dz = nPosZ.x.sub(nNegZ.x).div(eps.mul(2));
          const dFy_dx = nPosX.y.sub(nNegX.y).div(eps.mul(2));
          const dFy_dz = nPosZ.y.sub(nNegZ.y).div(eps.mul(2));
          const dFz_dx = nPosX.z.sub(nNegX.z).div(eps.mul(2));
          const dFz_dy = nPosY.z.sub(nNegY.z).div(eps.mul(2));
          
          // Curl = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
          const curlX = dFz_dy.sub(dFy_dz);
          const curlY = dFx_dz.sub(dFz_dx);
          const curlZ = dFy_dx.sub(dFx_dy);
          const curl = vec3(curlX, curlY, curlZ);
          
          // Add curl force to velocity (scaled by intensity and deltaTime)
          velocity.addAssign(curl.mul(turbIntensity).mul(uniforms.deltaTime));
        });
        
        // Attractors - apply force from each active attractor
        const attractorCount = uniforms.attractorCount;
        
        // Helper function to apply a single attractor's force
        const applyAttractor = (aPos, aStrength, aRadius, aType, aAxis) => {
          If(aStrength.abs().greaterThan(0.001), () => {
            // Vector from particle to attractor
            const toAttractor = aPos.sub(position);
            const dist = toAttractor.length();
            
            // Avoid division by zero
            const safeDist = dist.max(0.01);
            const direction = toAttractor.div(safeDist);
            
            // Calculate falloff (1 at center, 0 at radius edge)
            // If radius is 0, no falloff (infinite range with inverse square)
            const falloff = aRadius.greaterThan(0.001).select(
              float(1).sub(dist.div(aRadius)).max(0), // Linear falloff within radius
              float(1).div(safeDist.mul(safeDist).add(1)) // Inverse square falloff (softened)
            );
            
            // Type 0: Point attractor - pull toward position
            // Type 1: Vortex - swirl around axis
            const force = aType.lessThan(0.5).select(
              // Point attractor: force along direction to attractor
              direction.mul(aStrength).mul(falloff),
              // Vortex: force perpendicular to both (toAttractor) and (axis)
              // cross(axis, toAttractor) gives tangent direction
              (() => {
                const tangent = vec3(
                  aAxis.y.mul(toAttractor.z).sub(aAxis.z.mul(toAttractor.y)),
                  aAxis.z.mul(toAttractor.x).sub(aAxis.x.mul(toAttractor.z)),
                  aAxis.x.mul(toAttractor.y).sub(aAxis.y.mul(toAttractor.x))
                );
                const tangentLen = tangent.length().max(0.001);
                return tangent.div(tangentLen).mul(aStrength).mul(falloff);
              })()
            );
            
            velocity.addAssign(force.mul(uniforms.deltaTime));
          });
        };
        
        // Apply each attractor (unrolled for shader compatibility)
        If(attractorCount.greaterThan(0), () => {
          applyAttractor(
            uniforms.attractor0Pos, uniforms.attractor0Strength,
            uniforms.attractor0Radius, uniforms.attractor0Type, uniforms.attractor0Axis
          );
        });
        If(attractorCount.greaterThan(1), () => {
          applyAttractor(
            uniforms.attractor1Pos, uniforms.attractor1Strength,
            uniforms.attractor1Radius, uniforms.attractor1Type, uniforms.attractor1Axis
          );
        });
        If(attractorCount.greaterThan(2), () => {
          applyAttractor(
            uniforms.attractor2Pos, uniforms.attractor2Strength,
            uniforms.attractor2Radius, uniforms.attractor2Type, uniforms.attractor2Axis
          );
        });
        If(attractorCount.greaterThan(3), () => {
          applyAttractor(
            uniforms.attractor3Pos, uniforms.attractor3Strength,
            uniforms.attractor3Radius, uniforms.attractor3Type, uniforms.attractor3Axis
          );
        });
        
        // Apply velocity to position, scaled by friction (throttle, not destructive)
        position.addAssign(velocity.mul(dt60).mul(speedScale));
        
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
      intensifiedColor,           // vec3 color * intensity
      shapeMask,                  // float shape/alpha mask
      index: instanceIndex,       // particle index (for randomization)
    };
    
    // Apply custom opacity node if provided (multiplies with base opacity)
    let finalOpacity = opacityNode
      ? baseOpacity.mul(typeof opacityNode === 'function' ? opacityNode(particleData) : opacityNode)
      : baseOpacity;
    
    // Soft particles - fade when near scene geometry
    if (softParticles) {
      // Get scene depth from depth buffer at current screen position
      const sceneDepth = viewportDepthTexture(screenUV).x;
      
      // Get particle fragment depth (linearized)
      // positionView.z is negative (looking down -Z), so negate it
      const particleViewZ = positionView.z.negate();
      
      // Linearize scene depth (from NDC to view space)
      // depth = (2.0 * near * far) / (far + near - sceneDepth * (far - near))
      const near = cameraNear;
      const far = cameraFar;
      const sceneViewZ = near.mul(far).mul(2).div(
        far.add(near).sub(sceneDepth.mul(2).sub(1).mul(far.sub(near)))
      );
      
      // Calculate depth difference
      const depthDiff = sceneViewZ.sub(particleViewZ);
      
      // Fade factor: 0 when touching surface, 1 when at softDistance or further
      const softFade = clamp(depthDiff.div(uniforms.softDistance), 0, 1);
      
      // Apply soft fade to opacity
      finalOpacity = finalOpacity.mul(softFade);
    }
    
    if (geometry) {
      // InstancedMesh mode with custom geometry
      // Select material type based on lighting prop
      let mat;
      switch (lighting) {
        case Lighting.BASIC:
          mat = new THREE.MeshBasicNodeMaterial();
          break;
        case Lighting.PHYSICAL:
          mat = new THREE.MeshPhysicalNodeMaterial();
          break;
        case Lighting.STANDARD:
        default:
          mat = new THREE.MeshStandardNodeMaterial();
          break;
      }
      
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
      
      // Apply custom colorNode if provided, otherwise use default
      const defaultColor = vec4(intensifiedColor, finalOpacity);
      mat.colorNode = colorNode
        ? (typeof colorNode === 'function' ? colorNode(particleData, defaultColor) : colorNode)
        : defaultColor;
      
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
      
      // Apply custom cast shadow node if provided (controls shadow map output)
      if (castShadowNode) {
        mat.castShadowNode = typeof castShadowNode === 'function'
          ? castShadowNode(particleData)
          : castShadowNode;
      }
      
      return mat;
    } else {
      // Sprite mode (default) - uses Y rotation only for 2D sprites
      const mat = new THREE.SpriteNodeMaterial();
      
      // Apply custom colorNode if provided, otherwise use default
      const defaultColor = vec4(intensifiedColor, finalOpacity);
      mat.colorNode = colorNode
        ? (typeof colorNode === 'function' ? colorNode(particleData, defaultColor) : colorNode)
        : defaultColor;
      
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
      
      // Apply custom cast shadow node if provided (controls shadow map output)
      if (castShadowNode) {
        mat.castShadowNode = typeof castShadowNode === 'function'
          ? castShadowNode(particleData)
          : castShadowNode;
      }
      
      return mat;
    }
  }, [positions, velocities, lifetimes, particleSizes, particleRotations, particleColorStarts, particleColorEnds, uniforms, appearance, alphaMap, flipbook, blending, geometry, orientToDirection, lighting, backdropNode, opacityNode, colorNode, castShadowNode, softParticles]);

  // Create sprite or instanced mesh based on geometry prop
  const renderObject = useMemo(() => {
    if (geometry) {
      // InstancedMesh mode
      const mesh = new THREE.InstancedMesh(geometry, material, maxParticles);
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      return mesh;
    } else {
      // Sprite mode (default)
      const s = new THREE.Sprite(material);
      s.count = maxParticles;
      s.frustumCulled = false;
      return s;
    }
  }, [material, maxParticles, geometry, shadow]);

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
    
    // Update turbulence time (animated noise field)
    const turbSpeed = turbulence?.speed ?? 1;
    uniforms.turbulenceTime.value += delta * turbSpeed;
    
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