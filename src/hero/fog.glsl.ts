/** Low drifting sea mist, sampled from the ocean's seamless noise lookup. */
export const FOG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const FOG_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform sampler2D uDetail;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying vec2 vUv;
  void main() {
    vec2 p = vec2(vUv.x * min(uAspect, 2.0), vUv.y);
    vec2 drift = vec2(uTime * .014, uTime * .0018);
    float broad = texture2D(uDetail, p * vec2(.24, .38) - drift).b;
    float wisps = texture2D(uDetail, p * vec2(.48, .75) + drift * .65 + .37).b;
    float fine = texture2D(uDetail, p * vec2(.86, 1.1) - drift * .4 + .71).b;
    float density = smoothstep(.34, .62, broad * .55 + wisps * .3 + fine * .15);
    // Soft banks over the horizon and foreground, leaving the headline clear.
    float horizon = exp(-pow((vUv.y - .49 + (broad-.5)*.2) / .19, 2.0));
    float foreground = exp(-pow((vUv.y - .20 + (wisps-.5)*.12) / .16, 2.0)) * .65;
    float edge = smoothstep(0.0, .12, vUv.y) * (1.0-smoothstep(.72, .94, vUv.y));
    float alpha = (.08 + density * .64) * (horizon + foreground) * edge;
    vec2 pointerDelta = vec2((vUv.x-uPointer.x)*uAspect,vUv.y-uPointer.y);
    float pointerHalo = (1.0-smoothstep(.045,.46,length(pointerDelta)))*uPointerStrength;
    vec3 fogColor = mix(vec3(.18,.25,.28),vec3(.34,.45,.47),pointerHalo*.15);
    gl_FragColor = vec4(fogColor,min(alpha+pointerHalo*density*.009,.56));
    #include <colorspace_fragment>
  }
`
