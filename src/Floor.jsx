import { useMemo } from "react";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { 
    cameraPosition, 
    positionWorld,
    positionLocal,
    fract, 
    vec3, 
    float,
    step,
    max,
    abs,
} from "three/tsl";

export const Floor = () => {

    const mat = useMemo(() => {
        const m = new MeshStandardNodeMaterial({ 
            transparent: true,
            roughness: 0.8,
            metalness: 0.2,
        });
        
        const gridSize = float(1.0);
        const lineWidth = float(0.03);

        const gridPos = positionWorld.xz.div(gridSize);
        const gridFract = fract(gridPos);
        
        const lineX = step(gridFract.x, lineWidth).add(step(float(1).sub(gridFract.x), lineWidth));
        const lineZ = step(gridFract.y, lineWidth).add(step(float(1).sub(gridFract.y), lineWidth));
        const grid = max(lineX, lineZ);

        const gridColor = vec3(0.1, 0.2, 0.5).add(vec3(0.3, 0.6, 0.8).mul(grid));
        
        m.colorNode = gridColor;
 
        const zDist = abs(positionWorld.z.sub(cameraPosition.z));
        const dropAmount = zDist.mul(zDist).mul(0.008);
        
        m.positionNode = positionLocal.add(vec3(0, 0, dropAmount.negate()));
       
        return m;
    }, []);
    
    return (
        <mesh receiveShadow material={mat} position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[100, 100, 200, 200]} />
        </mesh>
    );
};