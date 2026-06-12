import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Html } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette, Glitch } from '@react-three/postprocessing';
import { GlitchMode } from 'postprocessing';
import { useStore, NetHost } from './store';
import * as THREE from 'three';
import audio from './AudioEngine';
import { symphony } from './SymphonyEngine';

const vertexShaderSource = `
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShaderSource = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uSelected;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    float scanline = sin(vUv.y * 120.0 - uTime * 6.0);

    float verticalGrid = sin(vUv.x * 20.0);

    float dots = smoothstep(0.8, 0.95, scanline) * smoothstep(0.4, 0.6, verticalGrid);

    float energyStream = smoothstep(0.92, 0.99, sin(vUv.x * 8.0 + uTime * 2.0));

    float noise = smoothstep(0.2, 0.8, sin(vUv.y * 350.0 + uTime * 20.0)) * 0.12;

    float borderX = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
    float borderY = smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
    float borderGlow = (1.0 - (borderX * borderY)) * 0.6;

    float baseGlow = exp(-vUv.y * 5.0) * 0.55;

    float alpha = dots * 0.8 + energyStream * 0.45 + noise + borderGlow + baseGlow;
    if (uSelected > 0.5) {
      alpha += 0.3;
    }

    vec3 finalGlow = uColor * (0.85 + dots * 0.4 + energyStream * 0.3 + uSelected * 0.45);

    gl_FragColor = vec4(finalGlow, clamp(alpha, 0.06, 0.96));
  }
`;

const particleVertexShader = `
  uniform float uTime;
  uniform float uHeight;
  varying float vAlpha;
  void main() {
    vec3 pos = position;
    pos.y = mod(pos.y + uTime * 8.0, uHeight);

    vAlpha = 1.0 - (pos.y / uHeight);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 3.5 * (260.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    gl_FragColor = vec4(uColor, vAlpha * 0.75);
  }
`;

const voxelVertexShader = `
  attribute float aPhase;
  attribute float aIntensity;
  uniform float uTime;
  varying float vGlow;
  varying float vY;
  void main() {
    float pulse = 0.5 + 0.5 * sin(uTime * 1.4 + aPhase);
    vec3 pos = position;
    pos.y *= (0.25 + pulse * 1.75) * aIntensity;
    vGlow = pulse * aIntensity;
    vY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  }
`;

const voxelFragmentShader = `
  uniform vec3 uColorDim;
  uniform vec3 uColorHot;
  varying float vGlow;
  varying float vY;
  void main() {
    vec3 col = mix(uColorDim, uColorHot, vGlow * 0.7 + vY * 0.5);
    float alpha = 0.10 + vGlow * 0.45 + vY * 0.25;
    gl_FragColor = vec4(col, alpha);
  }
`;

const VoxelSea: React.FC = () => {
  const performanceMode = useStore((state) => state.settings.performanceMode);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const count = performanceMode ? 3000 : 9000;

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);

    const phases = new Float32Array(count);
    const intensities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phases[i] = Math.random() * Math.PI * 2;
      intensities[i] = 0.4 + Math.random() * 1.2;
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(intensities, 1));

    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uColorDim: { value: new THREE.Color('#013a4a') },
        uColorHot: { value: new THREE.Color('#00f0ff') },
      },
    };
  }, [count]);

  useEffect(() => {
    if (!meshRef.current) return;
    const tempObject = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 45 + Math.pow(Math.random(), 0.6) * 290;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const size = 0.9 + Math.random() * 1.9;
      const height = 0.6 + Math.random() * 3.2;
      tempObject.position.set(x, -0.45, z);
      tempObject.scale.set(size, height, size);
      tempObject.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [count]);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined as any, count]} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={voxelVertexShader}
        fragmentShader={voxelFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
};

const rainVertexShader = `
  uniform float uTime;
  attribute float aSpeed;
  varying float vAlpha;
  void main() {
    vec3 pos = position;
    pos.y = mod(pos.y - uTime * aSpeed, 160.0);
    vAlpha = smoothstep(160.0, 120.0, pos.y) * smoothstep(0.0, 15.0, pos.y);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 2.0 * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const rainFragmentShader = `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    if (abs(c.x) > 0.12) discard;
    gl_FragColor = vec4(0.0, 0.94, 1.0, vAlpha * 0.5);
  }
`;

const DigitalRain: React.FC = () => {
  const performanceMode = useStore((state) => state.settings.performanceMode);
  const count = performanceMode ? 500 : 1400;
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 480;
      pos[i * 3 + 1] = Math.random() * 160;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 480;
      spd[i] = 8 + Math.random() * 26;
    }
    return { positions: pos, speeds: spd };
  }, [count]);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSpeed" count={count} array={speeds} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={rainVertexShader}
        fragmentShader={rainFragmentShader}
        uniforms={{ uTime: { value: 0 } }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const sentinelVertexShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vWorldY;
  void main() {
    vec3 pos = position;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    float band = floor(worldPos.y * 1.6);
    float n = fract(sin(band * 91.17 + floor(uTime * 7.0) * 13.7) * 43758.5453);
    float tear = step(0.94, n);
    pos.x += (n - 0.5) * tear * 1.4;

    vNormal = normalMatrix * normal;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = -mvPosition.xyz;
    vWorldY = worldPos.y;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const sentinelFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vWorldY;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPos))), 1.8);
    float scan = smoothstep(0.55, 1.0, sin(vWorldY * 6.0 - uTime * 3.0));
    float pulse = 0.85 + 0.15 * sin(uTime * 1.2);

    vec3 col = uColor * (0.5 + fres * 1.8 + scan * 0.5) * pulse;
    float alpha = 0.16 + fres * 0.65 + scan * 0.18;
    gl_FragColor = vec4(col, clamp(alpha, 0.05, 0.92));
  }
`;

const SentinelConstruct: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const auraRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#ff1a3c') },
  }), []);

  const auraCount = 220;
  const auraPositions = useMemo(() => {
    const pos = new Float32Array(auraCount * 3);
    for (let i = 0; i < auraCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 8;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = Math.random() * 32;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }
    return pos;
  }, []);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    uniforms.uTime.value = elapsed;
    if (auraRef.current) {
      auraRef.current.uniforms.uTime.value = elapsed;
    }
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(elapsed * 0.1) * 0.35;
      groupRef.current.position.y = Math.sin(elapsed * 0.6) * 0.4;
    }
  });

  const mat = (
    <shaderMaterial
      ref={matRef}
      vertexShader={sentinelVertexShader}
      fragmentShader={sentinelFragmentShader}
      uniforms={uniforms}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      side={THREE.DoubleSide}
    />
  );

  return (
    <group position={[0, 0, -95]}>
      <group ref={groupRef}>
        <mesh position={[0, 24.2, 0]}>
          <sphereGeometry args={[1.8, 24, 24]} />
          {mat}
        </mesh>
        <mesh position={[0, 22.2, 0]}>
          <cylinderGeometry args={[0.8, 1.1, 1.6, 12]} />
          {mat}
        </mesh>
        <mesh position={[0, 18.4, 0]}>
          <cylinderGeometry args={[3.4, 2.4, 6.4, 16]} />
          {mat}
        </mesh>
        <mesh position={[0, 13.4, 0]}>
          <cylinderGeometry args={[2.4, 2.7, 3.8, 16]} />
          {mat}
        </mesh>
        <mesh position={[-3.6, 20.7, 0]}>
          <sphereGeometry args={[1.5, 16, 16]} />
          {mat}
        </mesh>
        <mesh position={[3.6, 20.7, 0]}>
          <sphereGeometry args={[1.5, 16, 16]} />
          {mat}
        </mesh>
        <mesh position={[-4.3, 15.2, 0]} rotation={[0, 0, 0.12]}>
          <cylinderGeometry args={[0.75, 0.6, 10.0, 10]} />
          {mat}
        </mesh>
        <mesh position={[4.3, 15.2, 0]} rotation={[0, 0, -0.12]}>
          <cylinderGeometry args={[0.75, 0.6, 10.0, 10]} />
          {mat}
        </mesh>
        <mesh position={[0, 11.0, 0]}>
          <cylinderGeometry args={[2.6, 2.2, 1.8, 16]} />
          {mat}
        </mesh>
        <mesh position={[-1.5, 5.4, 0]}>
          <cylinderGeometry args={[1.1, 0.85, 10.8, 12]} />
          {mat}
        </mesh>
        <mesh position={[1.5, 5.4, 0]}>
          <cylinderGeometry args={[1.1, 0.85, 10.8, 12]} />
          {mat}
        </mesh>

        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={auraCount} array={auraPositions} itemSize={3} />
          </bufferGeometry>
          <shaderMaterial
            ref={auraRef}
            vertexShader={`
              uniform float uTime;
              varying float vAlpha;
              void main() {
                vec3 pos = position;
                pos.y = mod(pos.y + uTime * 2.2, 32.0);
                vAlpha = 1.0 - pos.y / 32.0;
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = 3.0 * (220.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
              }
            `}
            fragmentShader={`
              varying float vAlpha;
              void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                gl_FragColor = vec4(1.0, 0.1, 0.24, vAlpha * 0.7);
              }
            `}
            uniforms={{ uTime: { value: 0 } }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[5.5, 7.5, 48]} />
        <meshBasicMaterial color="#ff1a3c" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 16, 6]} intensity={2.2} distance={70} color="#ff2244" />

      <Html distanceFactor={60} position={[0, 30, 0]}>
        <div className="text-[#ff3355] text-[10px] font-mono bg-black/90 px-2 py-0.5 border border-[#ff3355]/60 rounded select-none pointer-events-none tracking-widest font-bold whitespace-nowrap shadow-[0_0_12px_#ff0044]">
          SENTINEL
        </div>
      </Html>
    </group>
  );
};

const TargetReticle: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const ring3 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    if (ring1.current) ring1.current.rotation.z = elapsed * 1.8;
    if (ring2.current) ring2.current.rotation.z = -elapsed * 1.2;
    if (ring3.current) {
      const s = 1.0 + Math.sin(elapsed * 5.0) * 0.08;
      ring3.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={position}>
      <mesh ref={ring1}>
        <ringGeometry args={[5.2, 5.5, 4, 1, 0, Math.PI * 1.5]} />
        <meshBasicMaterial color="#ccff00" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2}>
        <ringGeometry args={[6.4, 6.6, 32, 1, 0, Math.PI * 0.8]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring3}>
        <ringGeometry args={[4.2, 4.35, 32]} />
        <meshBasicMaterial color="#ff0044" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const GroundGlow: React.FC = () => {
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color('#00424f') },
  }), []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, 0]}>
      <circleGeometry args={[85, 48]} />
      <shaderMaterial
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float d = length(vUv - vec2(0.5)) * 2.0;
            float alpha = smoothstep(1.0, 0.0, d) * 0.5;
            gl_FragColor = vec4(uColor, alpha);
          }
        `}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

const WifiRing: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ringRef.current) {
      const elapsed = state.clock.getElapsedTime() + delay;
      const progress = (elapsed % 2.5) / 2.5; // 2.5 second loop
      ringRef.current.scale.set(progress * 12.0, progress * 12.0, 1.0);
      if (ringRef.current.material) {
        (ringRef.current.material as THREE.Material).opacity = (1.0 - progress) * 0.8;
      }
    }
  });
  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 25, 0]}>
      <ringGeometry args={[0.05, 0.3, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

const BluetoothOrbit: React.FC<{ color: string; rotationSpeed: [number, number, number]; radius: number }> = ({ color, rotationSpeed, radius }) => {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ringRef.current) {
      const elapsed = state.clock.getElapsedTime();
      ringRef.current.rotation.x = elapsed * rotationSpeed[0];
      ringRef.current.rotation.y = elapsed * rotationSpeed[1];
      ringRef.current.rotation.z = elapsed * rotationSpeed[2];
    }
  });
  return (
    <mesh ref={ringRef}>
      <ringGeometry args={[radius - 0.04, radius + 0.04, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

const NetrunnerAvatar: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.position.y = 2.5 + Math.sin(elapsed * 2.0) * 0.45;
      groupRef.current.rotation.y = elapsed * 0.4;
    }
    if (coreRef.current) {
      const s = 1.0 + Math.sin(elapsed * 4.0) * 0.1;
      coreRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={[0, 0, 10]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <ringGeometry args={[1.5, 2.5, 32]} />
        <meshBasicMaterial color="#00ff00" transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <ringGeometry args={[0.1, 0.4, 16]} />
        <meshBasicMaterial color="#00ffaa" transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <group ref={groupRef}>
        <mesh ref={coreRef}>
          <octahedronGeometry args={[1.2, 0]} />
          <meshBasicMaterial color="#00ff00" wireframe transparent opacity={0.75} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.8, 12, 12]} />
          <meshBasicMaterial color="#00ffaa" wireframe transparent opacity={0.2} depthWrite={false} />
        </mesh>

        <Html distanceFactor={22} position={[0, 2.4, 0]}>
          <div className="text-[#00ff00] text-[9px] font-mono bg-black/95 px-2 py-0.5 border border-[#00ff00] rounded select-none pointer-events-none tracking-widest font-bold whitespace-nowrap shadow-[0_0_10px_#00ff00]">
            NETRUNNER_AVATAR
          </div>
        </Html>
      </group>
    </group>
  );
};

const ConnectionCable: React.FC<{ start: [number, number, number]; end: [number, number, number]; color: string }> = ({ start, end, color }) => {
  const curve = useMemo(() => {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);

    const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    midPoint.y += Math.max(12, startVec.distanceTo(endVec) * 0.25);

    return new THREE.CatmullRomCurve3([startVec, midPoint, endVec]);
  }, [start, end]);

  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (matRef.current) {
      const elapsed = state.clock.getElapsedTime();
      matRef.current.opacity = 0.35 + Math.sin(elapsed * 6.0) * 0.2;
    }
  });

  return (
    <mesh>
      <tubeGeometry args={[curve, 45, 0.22, 6, false]} />
      <meshBasicMaterial ref={matRef} color={color} transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
};

const HighwayParticle: React.FC<{ curve: THREE.CatmullRomCurve3; color: string; speedMultiplier: number; delay: number }> = ({ curve, color, speedMultiplier, delay }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef((Math.random() + delay) % 1.0);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      progressRef.current += delta * 0.22 * speedMultiplier;
      if (progressRef.current > 1.0) {
        progressRef.current = 0.0;
      }
      const pos = curve.getPointAt(progressRef.current);
      meshRef.current.position.copy(pos);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.22, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
    </mesh>
  );
};

const DataHighway: React.FC<{ start: [number, number, number]; end: [number, number, number]; color: string }> = ({ start, end, color }) => {
  const curve = useMemo(() => {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);

    const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    midPoint.y = Math.max(1.5, midPoint.y * 0.1);

    return new THREE.CatmullRomCurve3([startVec, midPoint, endVec]);
  }, [start, end]);

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={50}
            array={new Float32Array(curve.getPoints(49).flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} />
      </line>

      <HighwayParticle curve={curve} color={color} speedMultiplier={1.0} delay={0.0} />
      <HighwayParticle curve={curve} color={color} speedMultiplier={1.4} delay={0.5} />
    </group>
  );
};

const CameraRig: React.FC = () => {
  const { camera, gl } = useThree();
  const cameraMode = useStore((state) => state.cameraMode);
  const focusTarget = useStore((state) => state.focusTarget);
  const keys = useRef<Record<string, boolean>>({});

  const rotation = useRef({ yaw: 0, pitch: -0.2 });
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const orbitAngle = useRef(0);
  const prevMode = useRef(cameraMode);

  const focusAnim = useRef<{ to: THREE.Vector3; look: THREE.Vector3; t: number } | null>(null);

  useEffect(() => {
    if (focusTarget) {
      const look = new THREE.Vector3(...focusTarget.coords);
      const dir = new THREE.Vector3().subVectors(camera.position, look);
      dir.y = 0;
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(26);
      const to = look.clone().add(dir);
      to.y = Math.max(12, look.y + 8);
      focusAnim.current = { to, look, t: 0 };
    }
  }, [focusTarget, camera]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDragging.current = true;
        previousMousePosition.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      const sensitivity = 0.003;
      rotation.current.yaw -= deltaX * sensitivity;
      rotation.current.pitch -= deltaY * sensitivity;

      const limit = Math.PI / 2 - 0.05;
      rotation.current.pitch = Math.max(-limit, Math.min(limit, rotation.current.pitch));

      previousMousePosition.current = { x: e.clientX, y: e.clientY };

      focusAnim.current = null;
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const canvas = gl.domElement;
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    rotation.current.yaw = Math.atan2(direction.x, direction.z);
    rotation.current.pitch = Math.asin(direction.y);

    camera.position.set(0, 30, 80);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [camera, gl]);

  useFrame((_state, delta) => {
    if (prevMode.current !== cameraMode) {
      if (cameraMode === 'fly') {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        rotation.current.yaw = Math.atan2(direction.x, direction.z) + Math.PI;
        rotation.current.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
      }
      prevMode.current = cameraMode;
    }

    if (cameraMode === 'orbit') {
      orbitAngle.current += delta * 0.08;
      const radius = 110;
      const target = new THREE.Vector3(
        Math.cos(orbitAngle.current) * radius,
        42 + Math.sin(orbitAngle.current * 0.7) * 14,
        Math.sin(orbitAngle.current) * radius
      );
      camera.position.lerp(target, Math.min(1, delta * 1.5));
      camera.lookAt(0, 18, 0);
      return;
    }

    if (cameraMode === 'tactical') {
      const target = new THREE.Vector3(0, 215, 0.1);
      camera.position.lerp(target, Math.min(1, delta * 2.0));
      camera.lookAt(0, 0, 0);
      return;
    }

    if (focusAnim.current) {
      const anim = focusAnim.current;
      anim.t += delta / 1.4; // 1.4s flight
      const k = anim.t >= 1 ? 1 : 1 - Math.pow(1 - anim.t, 3);
      camera.position.lerp(anim.to, k * 0.18 + 0.04);
      camera.lookAt(anim.look);
      if (anim.t >= 1) {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        rotation.current.yaw = Math.atan2(direction.x, direction.z) + Math.PI;
        rotation.current.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        focusAnim.current = null;
      }
      return;
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.y = rotation.current.yaw;
    camera.rotation.x = rotation.current.pitch;

    const sprint = keys.current['ShiftRight'] ? 2.4 : 1.0;
    const speed = 45.0 * sprint * delta;

    const forward = new THREE.Vector3(
      Math.sin(rotation.current.yaw),
      0,
      Math.cos(rotation.current.yaw)
    ).normalize();

    const right = new THREE.Vector3(
      Math.cos(rotation.current.yaw),
      0,
      -Math.sin(rotation.current.yaw)
    ).normalize();

    const move = new THREE.Vector3();
    if (keys.current['KeyW']) move.addScaledVector(forward, -1);
    if (keys.current['KeyS']) move.addScaledVector(forward, 1);
    if (keys.current['KeyA']) move.addScaledVector(right, -1);
    if (keys.current['KeyD']) move.addScaledVector(right, 1);

    if (keys.current['Space']) move.y += 1.0;
    if (keys.current['ShiftLeft']) move.y -= 1.0;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
    }

    camera.position.y = Math.max(1.5, camera.position.y);
  });

  return null;
};

const Effects: React.FC = () => {
  const bloom = useStore((state) => state.settings.bloom);
  const performanceMode = useStore((state) => state.settings.performanceMode);
  const alertFlash = useStore((state) => state.alertFlash);
  const [glitchActive, setGlitchActive] = useState(false);

  const aberrationOffset = useMemo(() => new THREE.Vector2(0.0011, 0.0007), []);
  const glitchDelay = useMemo(() => new THREE.Vector2(0, 0), []);
  const glitchDuration = useMemo(() => new THREE.Vector2(0.15, 0.35), []);
  const glitchStrength = useMemo(() => new THREE.Vector2(0.2, 0.5), []);

  useEffect(() => {
    if (alertFlash > 0) {
      setGlitchActive(true);
      const timer = setTimeout(() => setGlitchActive(false), 750);
      return () => clearTimeout(timer);
    }
  }, [alertFlash]);

  if (!bloom) return null;

  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={1.15} luminanceThreshold={0.16} luminanceSmoothing={0.85} mipmapBlur radius={0.72} />
      {!performanceMode ? <ChromaticAberration offset={aberrationOffset} radialModulation={false} modulationOffset={0.0} /> : <></>}
      <Noise opacity={0.055} />
      <Vignette eskil={false} offset={0.16} darkness={0.82} />
      {glitchActive ? (
        <Glitch
          delay={glitchDelay}
          duration={glitchDuration}
          strength={glitchStrength}
          mode={GlitchMode.CONSTANT_MILD}
          active
          ratio={0.6}
        />
      ) : <></>}
    </EffectComposer>
  );
};

interface TowerProps {
  host: NetHost;
}

const Tower: React.FC<TowerProps> = ({ host }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const selectHost = useStore((state) => state.selectHost);
  const isSelected = useStore((state) => state.selectedHostIp === host.ip);
  const breachedIps = useStore((state) => state.breachedIps);
  const isBreached = breachedIps.includes(host.ip);

  useFrame((state) => {
    const cameraPos = state.camera.position;
    const distance = cameraPos.distanceTo(new THREE.Vector3(host.coords[0], 0, host.coords[2]));
    symphony.updateHostDistance(host.ip, distance);
  });

  const [flickerOpacity, setFlickerOpacity] = React.useState(1.0);

  const basePosition: [number, number, number] = [host.coords[0], 0, host.coords[2]];

  const baseWidth = 5.0;
  const height = Math.min(100, 25 + host.packet_count * 1.5);

  const particleCount = 30;

  const initialPositions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * baseWidth;
      pos[i * 3 + 1] = Math.random() * height;
      pos[i * 3 + 2] = (Math.random() - 0.5) * baseWidth;
    }
    return pos;
  }, [height]);

  const getTowerColor = () => {
    if (host.is_quarantined) return '#ff0044';
    if (isBreached) return '#ccff00';
    if (host.anomaly_score > 3.0) return '#ffaa00';
    if (host.device_type === "self") return '#00ff00';
    if (host.device_type === "wifi_beacon") return '#ff1122';
    if (host.device_type === "bluetooth") return '#b026ff';
    if (host.device_type === "probe_request") return '#00ffaa';
    return '#00f0ff';
  };

  const color = getTowerColor();

  const handleContextMenu = (e: any) => {
    e.stopPropagation();
    selectHost(host.ip);
    const event = e.nativeEvent as MouseEvent;
    window.dispatchEvent(new CustomEvent('show-context-menu', {
      detail: { ip: host.ip, x: event.clientX, y: event.clientY }
    }));
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    selectHost(host.ip);
    audio.playClick();
    window.dispatchEvent(new CustomEvent('open-breach-modal', {
      detail: { ip: host.ip }
    }));
  };

  const handleSingleClick = (e: any) => {
    e.stopPropagation();
    selectHost(host.ip);
    audio.playClick();
  };

  if (host.device_type === "wifi_beacon") {
    return (
      <group position={basePosition} onContextMenu={handleContextMenu}>
        <mesh onClick={handleSingleClick} onDoubleClick={handleDoubleClick}>
          <cylinderGeometry args={[0.04, 0.45, 26, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
        </mesh>

        <mesh onClick={handleSingleClick} onDoubleClick={handleDoubleClick}>
          <cylinderGeometry args={[0.08, 0.6, 26.2, 8]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.25} depthWrite={false} />
        </mesh>

        <WifiRing color={color} delay={0} />
        <WifiRing color={color} delay={0.8} />
        <WifiRing color={color} delay={1.6} />

        <mesh position={[0, 13, 0]}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
      </group>
    );
  }

  if (host.device_type === "bluetooth") {
    const orbRadius = 2.2;
    return (
      <group position={[host.coords[0], orbRadius + 1.0, host.coords[2]]} onContextMenu={handleContextMenu}>
        <mesh onClick={handleSingleClick} onDoubleClick={handleDoubleClick}>
          <sphereGeometry args={[orbRadius, 24, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.2}
            roughness={0.05}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>

        <BluetoothOrbit color={color} rotationSpeed={[0.6, 0.8, 0.1]} radius={orbRadius * 1.35} />
        <BluetoothOrbit color={color} rotationSpeed={[0.2, -0.7, 0.5]} radius={orbRadius * 1.55} />

        <Html distanceFactor={28} position={[0, orbRadius + 1.2, 0]}>
          <div className="bg-black/95 text-[#b026ff] border border-[#b026ff] px-2 py-0.5 text-[10px] font-mono whitespace-nowrap rounded font-bold shadow-[0_0_10px_#b026ff] pointer-events-none">
            {host.hostname || "BLUETOOTH_DEV"}
          </div>
        </Html>
      </group>
    );
  }

  if (host.device_type === "probe_request") {
    if (host.signal_strength === null) return null;
    return (
      <group position={basePosition} onContextMenu={handleContextMenu}>
        <mesh
          ref={meshRef}
          position={[0, 15, 0]}
          onClick={handleSingleClick}
          onDoubleClick={handleDoubleClick}
        >
          <cylinderGeometry args={[1.5, 2.5, 30, 6]} />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={flickerOpacity * 0.75}
            depthWrite={false}
          />
        </mesh>

        <mesh position={[0, 10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.5, 2.7, 8]} />
          <meshBasicMaterial color={color} transparent opacity={flickerOpacity * 0.9} depthWrite={false} />
        </mesh>
        <mesh position={[0, 20, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.8, 2.0, 8]} />
          <meshBasicMaterial color={color} transparent opacity={flickerOpacity * 0.9} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  const uniforms = useMemo(() => ({
    uTime: { value: 0.0 },
    uColor: { value: new THREE.Color(color) },
    uSelected: { value: isSelected ? 1.0 : 0.0 }
  }), [color, isSelected]);

  const particleUniforms = useMemo(() => ({
    uTime: { value: 0.0 },
    uHeight: { value: height },
    uColor: { value: new THREE.Color(color) }
  }), [height, color]);

  useEffect(() => {
    uniforms.uColor.value.set(color);
    uniforms.uSelected.value = isSelected ? 1.0 : 0.0;

    particleUniforms.uColor.value.set(color);
    particleUniforms.uHeight.value = height;
  }, [color, isSelected, height, uniforms, particleUniforms]);

  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = elapsed;
    }
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.ShaderMaterial;
      if (mat.uniforms && mat.uniforms.uTime) {
        mat.uniforms.uTime.value = elapsed;
      }
    }

    if (host.device_type === "probe_request") {
      const strength = host.signal_strength ?? 0.5;
      const f = strength * (0.35 + Math.sin(elapsed * 22) * 0.25 + Math.random() * 0.2);
      setFlickerOpacity(Math.max(0.08, Math.min(1.0, f)));
    }
  });

  const renderHuman = host.packet_count > 5 || host.anomaly_score > 1.0;

  return (
    <group position={basePosition} onContextMenu={handleContextMenu}>
      <mesh
        position={[0, height / 2, 0]}
        onClick={handleSingleClick}
        onDoubleClick={handleDoubleClick}
      >
        <boxGeometry args={[baseWidth * 1.05, height * 1.01, baseWidth * 1.05]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={isSelected ? 0.45 : 0.15}
          depthWrite={false}
        />
      </mesh>

      <mesh
        ref={meshRef}
        position={[0, height / 2, 0]}
        onClick={handleSingleClick}
        onDoubleClick={handleDoubleClick}
      >
        <boxGeometry args={[baseWidth, height, baseWidth]} />
        <shaderMaterial
          ref={shaderRef}
          vertexShader={vertexShaderSource}
          fragmentShader={fragmentShaderSource}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <points ref={pointsRef} position={[0, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particleCount}
            array={initialPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={particleVertexShader}
          fragmentShader={particleFragmentShader}
          uniforms={particleUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <mesh position={[0, height, 0]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshBasicMaterial color="#ff0044" />
      </mesh>

      <mesh position={[0, height / 2, 0]}>
        <sphereGeometry args={[height * 0.65, 8, 8]} />
        <meshBasicMaterial
          color="#00f0ff"
          wireframe
          transparent
          opacity={host.ice_integrity / 550.0}
          depthWrite={false}
        />
      </mesh>

      {renderHuman && (
        <group position={[baseWidth * 0.9, 0, baseWidth * 0.9]}>
          <mesh position={[0, 1.8, 0]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial color="#00ffaa" transparent opacity={0.6} wireframe depthWrite={false} />
          </mesh>
          <mesh position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.1, 0.22, 1.4, 6]} />
            <meshBasicMaterial color="#00ffaa" transparent opacity={0.45} wireframe depthWrite={false} />
          </mesh>
          <mesh position={[-0.15, 0.4, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.9, 4]} />
            <meshBasicMaterial color="#00ffaa" transparent opacity={0.4} wireframe depthWrite={false} />
          </mesh>
          <mesh position={[0.15, 0.4, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.9, 4]} />
            <meshBasicMaterial color="#00ffaa" transparent opacity={0.4} wireframe depthWrite={false} />
          </mesh>

          <Html distanceFactor={22} position={[0, 2.2, 0]}>
            <div className="text-[#00ffaa] text-[8px] font-mono bg-black/90 px-1 border border-[#00ffaa]/50 rounded select-none pointer-events-none tracking-widest whitespace-nowrap">
              HUMAN_ présence
            </div>
          </Html>
        </group>
      )}

      {host.device_type === "self" && (
        <Html distanceFactor={28} position={[0, height + 2.0, 0]}>
          <div className="bg-black/95 text-[#00ff00] border border-[#00ff00] px-2 py-0.5 text-[10px] font-mono whitespace-nowrap rounded font-bold shadow-[0_0_10px_#00ff00] pointer-events-none tracking-widest animate-pulse">
            LOCAL_HOST
          </div>
        </Html>
      )}
    </group>
  );
};

const DecoyTower: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const useDecoy = useStore((state) => state.decoyActive);
  const deceptionLogs = useStore((state) => state.deceptionLogs);
  const hosts = useStore((state) => state.hosts);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = elapsed * 0.4;
      meshRef.current.position.y = 8 + Math.sin(elapsed * 2.0) * 1.0;
    }
    const cameraPos = state.camera.position;
    const distance = cameraPos.distanceTo(new THREE.Vector3(15, 0, 15));
    symphony.updateHostDistance("decoy", distance);
  });

  if (!useDecoy) return null;

  const lastLog = deceptionLogs[deceptionLogs.length - 1];
  let intruderHost: NetHost | undefined = undefined;
  if (lastLog) {
    const ipMatch = lastLog.details.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    if (ipMatch) {
      const intruderIp = ipMatch[0];
      intruderHost = hosts.find(h => h.ip === intruderIp);
    }
  }

  return (
    <group position={[15, 0, 15]}>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[2.5]} />
        <meshBasicMaterial color="#ff00b7" wireframe transparent opacity={0.8} depthWrite={false} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 3.7, 32]} />
        <meshBasicMaterial color="#ff00b7" transparent opacity={0.25} depthWrite={false} />
      </mesh>

      <Html distanceFactor={35} position={[0, 6, 0]}>
        <div className="bg-black/95 text-[#ff00b7] border border-[#ff00b7] px-2 py-0.5 text-[10px] font-mono whitespace-nowrap rounded font-bold shadow-[0_0_10px_#ff00b7] animate-pulse pointer-events-none">
          COGNITIVE_DECOY (TCP:5555)
        </div>
      </Html>

      {intruderHost && (
        <ConnectionCable start={[0, 5, 0]} end={[intruderHost.coords[0] - 15, intruderHost.coords[1], intruderHost.coords[2] - 15]} color="#ff0044" />
      )}
    </group>
  );
};

export const Netspace: React.FC = () => {
  const hosts = useStore((state) => state.hosts);
  const selectedHostIp = useStore((state) => state.selectedHostIp);
  const voxelSea = useStore((state) => state.settings.voxelSea);
  const performanceMode = useStore((state) => state.settings.performanceMode);

  const decorativeStructures = useMemo(() => {
    const temp = [];
    const count = performanceMode ? 60 : 130;
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 320;
      const z = (Math.random() - 0.5) * 320;

      if (Math.abs(x) < 35 && Math.abs(z) < 35) continue;

      const height = Math.random() * 100 + 35;
      const width = Math.random() * 4.5 + 2.0;
      temp.push({
        position: [x, height / 2 - 0.5, z] as [number, number, number],
        scale: [width, height, width] as [number, number, number],
      });
    }
    return temp;
  }, [performanceMode]);

  const instancedRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (instancedRef.current) {
      const tempObject = new THREE.Object3D();
      decorativeStructures.forEach((struct, i) => {
        tempObject.position.set(...struct.position);
        tempObject.scale.set(...struct.scale);
        tempObject.updateMatrix();
        instancedRef.current!.setMatrixAt(i, tempObject.matrix);
      });
      instancedRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [decorativeStructures]);

  const dataBridges = useMemo(() => {
    const bridges = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const radius = 135;
      bridges.push({
        position: [Math.cos(angle) * radius, 120, Math.sin(angle) * radius] as [number, number, number],
        radius: 10.0,
      });
    }
    return bridges;
  }, []);

  const selectedHost = selectedHostIp ? hosts.find(h => h.ip === selectedHostIp) : null;
  const selectedCoords = useMemo(() => {
    if (!selectedHost) return null;
    const x = selectedHost.coords[0];
    const z = selectedHost.coords[2];

    if (selectedHost.device_type === 'wifi_beacon') {
      return [x, 13, z] as [number, number, number];
    } else if (selectedHost.device_type === 'bluetooth') {
      return [x, 3.2, z] as [number, number, number];
    } else if (selectedHost.device_type === 'probe_request') {
      return [x, 15, z] as [number, number, number];
    } else {
      const h = Math.min(100, 25 + selectedHost.packet_count * 1.5);
      return [x, h / 2, z] as [number, number, number];
    }
  }, [selectedHost]);

  const selfHost = useMemo(() => hosts.find(h => h.device_type === 'self'), [hosts]);
  const selfCoords = useMemo(() => {
    if (selfHost) {
      return selfHost.coords;
    }
    return [0, 0, 10] as [number, number, number];
  }, [selfHost]);

  return (
    <div className="w-full h-full absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 30, 80], fov: 65 }} dpr={performanceMode ? 1 : [1, 2]}>
        <color attach="background" args={['#010103']} />

        <fogExp2 attach="fog" args={['#010103', 0.0085]} />

        <ambientLight intensity={0.25} />
        <pointLight position={[30, 80, 30]} intensity={2.0} color="#00f0ff" />

        <Stars radius={150} depth={60} count={performanceMode ? 600 : 1200} factor={5} saturation={0.3} fade speed={1.5} />

        <gridHelper args={[500, 100, '#00f0ff', '#010810']} position={[0, -0.5, 0]} />

        <GroundGlow />

        {voxelSea && <VoxelSea />}

        <DigitalRain />

        <instancedMesh ref={instancedRef} args={[null as any, null as any, decorativeStructures.length]}>
          <boxGeometry />
          <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.04} depthWrite={false} />
        </instancedMesh>

        {dataBridges.map((bridge, idx) => (
          <mesh key={idx} position={bridge.position}>
            <cylinderGeometry args={[bridge.radius, bridge.radius * 1.1, 300, 12]} />
            <meshBasicMaterial
              color={idx % 2 === 0 ? '#00f0ff' : '#00ffaa'}
              transparent
              opacity={0.03}
              wireframe
              depthWrite={false}
            />
          </mesh>
        ))}

        <SentinelConstruct />

        <NetrunnerAvatar />

        {selectedCoords && (
          <ConnectionCable start={[0, 2.5, 10]} end={selectedCoords} color="#00ff00" />
        )}

        {selectedCoords && <TargetReticle position={selectedCoords} />}

        {hosts
          .filter(host => host.device_type !== 'self')
          .map(host => {
            const hostCoords = host.coords;
            return (
              <DataHighway
                key={`highway-${host.ip}`}
                start={hostCoords}
                end={selfCoords}
                color={host.is_quarantined ? '#ff0044' : '#00f0ff'}
              />
            );
          })}

        {hosts.map((host) => (
          <Tower key={host.ip} host={host} />
        ))}

        <DecoyTower />

        <CameraRig />

        <Effects />
      </Canvas>
    </div>
  );
};

export default Netspace;
