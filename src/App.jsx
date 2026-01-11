import * as THREE from "three/webgpu";
import { Canvas, extend } from "@react-three/fiber";
import SceneLight from "./SceneLight";
import { Suspense } from "react";
import { KeyboardControls, Loader, OrbitControls } from "@react-three/drei";
import { WebGPUPostProcessing } from "./WebGPUPostprocessing";
import { WobblySphere } from "./WobblySphere";

const keyboardMap = [
  { name: "up", keys: ["KeyW", "ArrowUp"] },
  { name: "down", keys: ["KeyS", "ArrowDown"] },
  { name: "left", keys: ["KeyA", "ArrowLeft"] },
  { name: "right", keys: ["KeyD", "ArrowRight"] },
];

export default function App() {
  return (
    <>
      <KeyboardControls map={keyboardMap}>
        <Canvas
          shadows
          gl={async (props) => {
            extend(THREE);
            const renderer = new THREE.WebGPURenderer(props);

            await renderer.init();
            return renderer;
          }}
          camera={{ position: [0, 5, 15], fov: 50 }}
        >
          <Suspense fallback={null}>
            <SceneLight />
            <WebGPUPostProcessing />
            <WobblySphere/>
            <OrbitControls/>
          </Suspense>
        </Canvas>
      </KeyboardControls>

      <Loader />
    </>
  );
}
