export const HELIOS_SUN_CORONA_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const HELIOS_SUN_CORONA_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uInner;
  uniform vec3 uMid;
  uniform vec3 uOuter;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.15);
    float pulse = 0.9 + 0.1 * sin(uTime * 1.7);
    vec3 color = mix(uInner, uMid, smoothstep(0.12, 0.6, rim));
    color = mix(color, uOuter, smoothstep(0.58, 1.0, rim));
    float alpha = rim * 0.42 * pulse;
    gl_FragColor = vec4(color, alpha);
  }
`
