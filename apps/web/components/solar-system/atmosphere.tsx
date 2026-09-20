import { useMemo } from "react";
import * as THREE from "three";

const VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float fresnel = pow(1.0 - abs(dot(n, v)), uPower);
  gl_FragColor = vec4(uColor, fresnel * uIntensity);
}
`;

export function Atmosphere({
  radius,
  color,
  scale = 1.075,
  power = 2.35,
  intensity = 0.78,
}: {
  radius: number;
  color: string;
  scale?: number;
  power?: number;
  intensity?: number;
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    }),
    [color, power, intensity],
  );

  return (
    <mesh scale={scale}>
      <sphereGeometry args={[radius, 40, 40]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
