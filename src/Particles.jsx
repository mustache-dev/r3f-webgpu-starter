import { VFXParticles, Appearance, Blending } from "./VFXParticles";
import { TextureLoader } from "three/webgpu";

export const Particles = () => {

    const smokeTexture = new TextureLoader().load('./smoke.png');
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

    </group>
  );
};
