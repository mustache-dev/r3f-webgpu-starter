import { useMemo } from "react";
import { VFXParticles, Appearance, Blending } from "./VFXParticles";
import { TextureLoader, BoxGeometry, SphereGeometry, RepeatWrapping, LinearFilter  } from "three/webgpu";
import { useGLTF } from "@react-three/drei";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { 
  viewportSharedTexture,
  screenUV,
  time,
  normalView,
  positionViewDirection,
  dot,
  abs,
  pow,
  float,
  vec2,
  vec3,
  mix,
  normalGeometry,
  clamp,
  positionWorld,
  sin,
  PI,
  normalize,
  max,
  smoothstep,
} from "three/tsl";

export const Particles = () => {
    const smokeTexture = new TextureLoader().load('./smoke.png');
    const noiseTexture = new TextureLoader().load('./noise.png');
    const { nodes: cherryBlossomPetalNodes } = useGLTF('/cherry_blossom_petal-transformed.glb')
    const cherryBlossomPetalGeometry = useMemo(() => {
      const geo1 = cherryBlossomPetalNodes.Object_4.geometry
      return geo1
    }, [cherryBlossomPetalNodes]);
    noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;
    noiseTexture.minFilter = noiseTexture.magFilter = LinearFilter;
    
    // Load sword model and merge geometries
    const { nodes } = useGLTF('/sword1-transformed.glb');


    const swordGeometry = useMemo(() => {
      const geo1 = nodes.Cube001.geometry
      return geo1
    }, [nodes]);

    // Ring-based chromatic aberration distortion backdrop
    // Now accepts { progress, lifetime } to animate over particle life
    const _distortionBackdrop = ({ progress }) => {
      const vUv = screenUV;
      
      // Parameters
      const fresnelPower = float(2.0);
      const ringCount = float(5.0);
      const distortionStrength = float(0.08);
      
      // Animate effect intensity based on progress (0 at spawn → 1 at death)
      // Use smoothstep for smooth ramp-up: no effect at 0, full effect after 0.3
      const effectIntensity = progress.smoothstep(float(0), float(0.3));
      
      // Fresnel effect
      const fresnelDot = max(dot(normalize(positionViewDirection), normalize(normalView)), float(0));
      const fresnel = pow(float(1).sub(fresnelDot), fresnelPower);
      
      // Multiple rings using sin - ring count increases with progress
      const animatedRingCount = ringCount.mul(effectIntensity);
      const ringsRaw = sin(fresnel.mul(animatedRingCount).mul(PI));
      const rings = abs(ringsRaw).mul(effectIntensity); // Also fade in ring intensity
      
      // Distortion based on fresnel direction
      const distortDir = normalize(vUv.sub(vec2(0.5, 0.5)));
      const distortion = distortDir.mul(rings).mul(distortionStrength);
      
      // Chromatic aberration - sample R, G, B at different offsets
      const distortedUvR = vUv.add(distortion.mul(1.2));
      const distortedUvG = vUv.add(distortion);
      const distortedUvB = vUv.add(distortion.mul(0.8));
      
      const r = viewportSharedTexture(distortedUvR).r;
      const g = viewportSharedTexture(distortedUvG).g;
      const b = viewportSharedTexture(distortedUvB).b;
      
      return vec3(r, g, b);
    };

    const stylizedSphereBackdrop = useMemo(() => {
      // Fresnel: 0 at center, 1 at edges (inverted from before)

      const normalTarget = vec3(0, 1, 0);
      const n = normalGeometry
      const nDot = dot(n, normalTarget);
      const nDotClamped = clamp(nDot, 0, 1);

      const color1 = vec3(0., 0., 0.05);
      const color2 = vec3(0.01, 0.01, 0.1);
      const color = mix(color1, color2, nDotClamped);
      const fresnelBase = abs(dot(normalView, positionViewDirection));
      const fresnel = pow(float(1).sub(fresnelBase), float(4.0)); // Inverted & squared for edge glow
      
      // Purple-blue gradient colors
      const purple = vec3(0.6, 0.1, 0.9);   // Vibrant purple
      const blue = vec3(0.1, 0.4, 1.0);     // Bright blue
      
      // Smooth scroll using sine wave (no hard edges)
      // sin goes -1 to 1, remap to 0-1 with * 0.5 + 0.5
      const scrollSpeed = float(0.8);
      const frequency = float(1.0); // How many waves across the surface
      const wave = sin(positionWorld.y.mul(frequency).sub(time.mul(scrollSpeed)).mul(PI));
      const scrollOffset = wave.mul(0.5).add(0.5); // Remap -1,1 to 0,1
      
      // Mix purple to blue based on scroll position
      const purpleBlueGlow = mix(purple, blue, scrollOffset);
      
      // Multiply by fresnel to only show at edges
      const finalColor = mix(color, purpleBlueGlow.mul(4.), fresnel); // Boost intensity
      
      return finalColor;
    }, []);
  return (
    <group>
          <VFXParticles
        autoStart={true}
        maxParticles={100}
        position={[-9, 0, 0]}
        geometry={cherryBlossomPetalGeometry}
        size={[0.2, 0.3]}
        delay={0.1}
        // Darker bordeaux to lighter white
      colorStart={["#4A0E0E", "#ff0000", "#ffffff"]}
        fadeSize={1}
        fadeOpacity={[1, 0]}
        gravity={[-.2, .2, 0]}
        lifetime={4}
        directionMin={[0, 0, 0]}
        directionMax={[-.5, 0,0]}
        startPositionMin={[-.3, -.3, -.3]}
        startPositionMax={[.3, .3, .3]}
        speed={0.01}
        friction={1}
        castShadow={true}
        rotation={[[0, Math.PI * 2], [0, Math.PI * 2], [0, Math.PI * 2]]}
        intensity={1}
        rotationSpeed={[1, 3]}
        // orientToDirection={true}
        // intensity={10}
        // opacityNode={({progress}) => smoothstep(0, 0.9, progress.oneMinus())}
        // backdropNode={_distortionBackdrop}
      />
                <VFXParticles
        autoStart={true}
        maxParticles={1000}
        position={[-9, 0, 0]}
        geometry={new SphereGeometry(1, 32, 32)}
        size={0.5}
        delay={0.3}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={[0.3, 1]}
        fadeOpacity={[1, 1]}
        gravity={[0, -.1, 0]}
        lifetime={2}
        directionMin={[-1, 0, -1]}
        directionMax={[1, 0, 1]}
        startPositionMin={[0, 0, 0]}
        startPositionMax={[0,0,0]}
        speed={0.005}
        friction={1}
        castShadow={true}
        // orientToDirection={true}
        // intensity={10}
        opacityNode={({progress}) => smoothstep(0, 0.9, progress.oneMinus())}
        backdropNode={_distortionBackdrop}
      />
            <VFXParticles
        autoStart={true}
        maxParticles={100}
        position={[-3, 0, 0]}
        geometry={new SphereGeometry(1, 32, 32)}
        size={0.5}
        delay={0.3}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={[0, 1]}
        fadeOpacity={[1, 1]}
        gravity={[0, 0, 0]}
        lifetime={2}
        directionMin={[-1, -1, -1]}
        directionMax={[1, 1, 1]}
        startPositionMin={[0, 0, 0]}
        startPositionMax={[0,0,0]}
        speed={0.3}
        friction={.8}
        castShadow={true}
        // orientToDirection={true}
        // intensity={10}
        opacityNode={({progress}) => smoothstep(0, 0.1, progress.oneMinus())}
        backdropNode={_distortionBackdrop}
      />
          <VFXParticles
        autoStart={true}
        maxParticles={1090}
        position={[-6, 0, 0]}
        geometry={new SphereGeometry(1, 32, 32)}
        size={0.5}
        delay={0.3}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={1}
        fadeOpacity={[1, 1]}
        gravity={[0, 0, 0]}
        lifetime={[2, 4]}
        directionMin={[-1, -1, -1]}
        directionMax={[1, 1, 1]}
        startPositionMin={[0, 0, 0]}
        startPositionMax={[0,0,0]}
        speed={0.3}
        friction={.8}
        castShadow={true}
        // orientToDirection={true}
        // intensity={10}
        backdropNode={stylizedSphereBackdrop}
      />
      <VFXParticles
        autoStart={true}
        maxParticles={3000}
        position={[0, -1, 0]}
        size={[0.3, 0.8]}
        colorStart={["#ff6600", "#ffcc00", '#ff0000']}
        colorEnd={["#ff0000", "#330000"]}
        fadeSize={[1, 0.2]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0.002, 0]}
        lifetime={[0.4, 0.8]}
        directionMin={[-0.3, 0.5, -0.3]}
        directionMax={[0.3, 1, 0.3]}
        speed={[0.01, 0.05]}
        friction={0.97}
        appearance={Appearance.GRADIENT}
        // blending={Blending.ADDITIVE}
        intensity={10}
      />
            <VFXParticles
        autoStart={true}
        maxParticles={3000}
        position={[3, -1, 0]}
        size={[2, 2]}
        delay={3.}
        colorStart={["#ffffff"]}
        fadeSize={[0.2, 1.]}
        fadeOpacity={[1, 0]}
        gravity={[0, 1, 0]}
        lifetime={[1.5, 1.5]}
        directionMin={[-0.3, 0.5, -0.3]}
        directionMax={[0.3, 1, 0.3]}
        speed={[0., 0.]}
        friction={0.7}
        appearance={Appearance.GRADIENT}
        // blending={Blending.ADDITIVE}
        intensity={10}
        alphaMap={smokeTexture}
        flipbook={{ rows: 8, columns: 8 }}
      />

    <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[6, -1, 0]}
        size={[0.05, 0.001]}
        delay={0.5}
        colorStart={["#ff6600", "#ffcc00", '#ff0000']}
        colorEnd={["#ff0000", "#330000"]}
        fadeSize={[1, 0.2]}
        fadeOpacity={[1, 0]}
        gravity={[0, -1, 0]}
        lifetime={[0.4, 0.8]}
        directionMin={[-1, -1, -1]}
        directionMax={[1, 1, 1]}
        speed={[0.1, 0.2]}
        friction={0.85}
        appearance={Appearance.CIRCULAR}
        // blending={Blending.ADDITIVE}
        intensity={10}
        emitCount={500}
      />
      
    <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[9, -1, 0]}
        size={[0.1, 0.2]}
        // delay={0.5}
        colorStart={["#00aaff", "#66ccff", "#0066ff"]}
        colorEnd={["#0033aa", "#001144"]}
        fadeSize={[1, .2]}
        fadeOpacity={[1, 0.]}
        gravity={[0, -3, 0]}
        lifetime={[0.4, 0.8]}
        directionMin={[-0.5, 0.5, -0.5]}
        directionMax={[0.5, 1, 0.5]}
        speed={[0.01, 0.1]}
        // friction={1.}
    
        appearance={Appearance.CIRCULAR}
        // blending={Blending.ADDITIVE}
        intensity={10}
        // emitCount={500}
      />


      <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[12, -1, 0]}
        geometry={new BoxGeometry(1, 1, 1)}
        size={[0.1, 0.2]}
        colorStart={["#ff00ff", "#aa00ff", "#ff66ff"]}
        colorEnd={["#440044", "#220022"]}
        fadeSize={1}          // Single value = no randomness
        fadeOpacity={1}       // Single value = no randomness
        gravity={[0, -2, 0]}
        lifetime={[1, 2]}
        directionMin={[-0.5, 0.5, -0.5]}
        directionMax={[0.5, 1, 0.5]}
        speed={[0.05, 0.1]}
        friction={0.98}
        castShadow={true}
        // Full 3D rotation: [[minX, maxX], [minY, maxY], [minZ, maxZ]]
        rotation={[[0, Math.PI * 2], [0, Math.PI * 2], [0, Math.PI * 2]]}
      /> 



      {/* Sword geometry particles - orient to velocity */}
      <VFXParticles
        autoStart={true}
        maxParticles={10000}
        position={[15, 0, 0]}
        geometry={swordGeometry}
        size={0.5}
        delay={0.}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={1}
        fadeOpacity={[0, 1]}
        gravity={[0, -1, 0]}
        lifetime={[2, 4]}
        directionMin={[0, 0, -.1]}
        directionMax={[0, 0, -1]}
        startPositionMin={[-1, -1, -1]}
        startPositionMax={[1, 1, 1]}
        speed={0.6}
        friction={0.98}
        castShadow={true}
        orientToDirection={true}
        intensity={10}
      />

    </group>
  );
};

useGLTF.preload('/sword1-transformed.glb');
