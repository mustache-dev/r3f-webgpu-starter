import { useLoader } from "@react-three/fiber";
import { useMemo } from "react"
import { normalGeometry, positionLocal, sin, texture, time, mul } from "three/tsl";
import { MeshStandardNodeMaterial, RepeatWrapping, TextureLoader, LinearFilter } from "three/webgpu"

export const WobblySphere = () => {

    const noise = useLoader(TextureLoader, './noise.png');
    noise.wrapS = noise.wrapT = RepeatWrapping;
    noise.minFilter = noise.magFilter = LinearFilter;

    const material = useMemo(() => {
        const mat = new MeshStandardNodeMaterial({color: "#ff0000"});
        const n = mul(texture(noise, normalGeometry.add(time.mul(0.1))).r.sub(0.5).mul(2), 0.1);
        mat.positionNode = positionLocal.add(n.mul(normalGeometry).mul(2))
        return mat;
    }, []);
    return (
        <mesh material={material}>
            <sphereGeometry args={[1, 32, 32]} />
        </mesh>
    )
}