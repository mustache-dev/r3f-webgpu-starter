import { Suspense } from "react";
import { Environment } from "@react-three/drei";

export default function SceneLight() {
  return (
    <>
      {/* <color attach="background" args={["#666971"]} /> */}
      <directionalLight
      castShadow
      
      position={[1000, 100, 100]}
      intensity={10}
      color={"#ffe7bd"}
      // shadow-normalBias={0.04}
      shadow-bias={-0.001}
      shadow-mapSize={[4096, 4096]}
      // layers={1}
      
    />

      {/* <Suspense fallback={null}> */}
        <Environment preset="sunset" background backgroundBlurriness={1} />
      {/* </Suspense> */}
    </>
  );
}
