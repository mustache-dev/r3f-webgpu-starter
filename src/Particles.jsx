import { useMemo } from "react";
import { VFXParticles, Appearance, Blending } from "./VFXParticles";
import { TextureLoader, BoxGeometry } from "three/webgpu";
import { useGLTF } from "@react-three/drei";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const Particles = () => {
    const smokeTexture = new TextureLoader().load('./smoke.png');
    
    // Load sword model and merge geometries
    const { nodes } = useGLTF('/sword1-transformed.glb');
    const swordGeometry = useMemo(() => {
      const geo1 = nodes.Cube001.geometry
      
    
      return geo1
    }, [nodes]);
  return (
    <group>
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
