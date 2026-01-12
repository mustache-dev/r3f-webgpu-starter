import { useFrame } from "@react-three/fiber"
import { useKeyboardControls, PerspectiveCamera, useTexture } from "@react-three/drei"
import { useRef } from "react"
import { damp } from "three/src/math/MathUtils.js"
import { Vector3, ClampToEdgeWrapping, LinearFilter, TextureLoader } from "three/webgpu"
import { Model } from "./Witch-test"
import { Appearance, VFXParticles, Blending } from "./VFXParticles"

function Player() {
  const meshRef = useRef()
  const modelRef = useRef()
  const modelAnimRef = useRef()
  const cameraRef = useRef()
  const targetRotation = useRef(0)
  const currentAnimation = useRef('idle-sword')
  const attackPressed = useRef(false)
  
  const walkSpeed = 1.2
  const runSpeed = 2
  const smokeRef = useRef()
  const lastSmokeTime = useRef(0)
  const SMOKE_THROTTLE_MS = 1000

  const smokeTexture = new TextureLoader().load('./smoke.png')

  // Subscribe to keyboard controls
  const [, getKeys] = useKeyboardControls()

  const velocity = useRef(new Vector3(0, 0, 0))
  

  useFrame(({camera}, delta) => {
    if (!meshRef.current) return

    const { forward, backward, left, right, run, attack } = getKeys()

    // Handle attack input (edge detection - only trigger on press, not hold)
    if (attack && !attackPressed.current) {
      attackPressed.current = true
      modelAnimRef.current?.attack()
    } else if (!attack) {
      attackPressed.current = false
    }

    // Calculate movement direction
    const moveX = (right ? 1 : 0) - (left ? 1 : 0)
    const moveZ = (backward ? 1 : 0) - (forward ? 1 : 0)
    const speed = run ? runSpeed : walkSpeed

    velocity.current.set(moveX, 0, moveZ).normalize().multiplyScalar(speed * delta)
    
    const isMoving = moveX !== 0 || moveZ !== 0
    
    // Update position
    meshRef.current.position.add(velocity.current)
    meshRef.current.position.y = -1.2
    
    // Throttled smoke spawn
    const now = performance.now()
    if (now - lastSmokeTime.current >= SMOKE_THROTTLE_MS) {
      lastSmokeTime.current = now
      smokeRef.current?.spawn(meshRef.current.position.x, meshRef.current.position.y + 2.5, meshRef.current.position.z + 2, 5)
    }

    // Calculate rotation based on movement direction (top-down view)
    if (isMoving && modelRef.current) {
      // Calculate target angle from movement direction
      targetRotation.current = Math.atan2(-moveX, -moveZ)
      
      // Smoothly interpolate rotation
      const currentRotation = modelRef.current.rotation.y
      const diff = targetRotation.current - currentRotation
      
      // Handle angle wrapping
      let shortestDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI
      if (shortestDiff < -Math.PI) shortestDiff += Math.PI * 2
      
      modelRef.current.rotation.y = damp(currentRotation, currentRotation + shortestDiff, 10, delta)
    }

    // Update animation based on movement state (no re-renders)
    const newAnimation = isMoving ? (run ? 'run' : 'walk') : 'idle'
    if (newAnimation !== currentAnimation.current) {
      currentAnimation.current = newAnimation
      modelAnimRef.current?.setAnimation(newAnimation)
    }

    camera.position.x = damp(camera.position.x, meshRef.current.position.x, 4, delta)
    camera.position.z = damp(camera.position.z, meshRef.current.position.z + 5, 4, delta)
  })

  return (<>
    <PerspectiveCamera makeDefault position={[0, 3, 10]} fov={45} rotation={[-Math.PI / 6, 0, 0]} ref={cameraRef}/>

    <group ref={meshRef}>
      <group ref={modelRef}>
        <Model ref={modelAnimRef} />
      </group>
    </group>
  </>)
}

export default Player

