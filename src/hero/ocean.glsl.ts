/** Continuous shaded water, with analytic swell normals and procedural wind ripples. */
import { WAVE_COUNT } from './waves.js'

export const OCEAN_VERT = /* glsl */ `
  #define WAVE_COUNT ${WAVE_COUNT}
  uniform float uTime;
  uniform vec4 uWaves[WAVE_COUNT];
  uniform vec2 uWaveAQ[WAVE_COUNT];
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vDist;
  void main() {
    vec3 p = position;
    vec2 g = p.xz;
    vec3 tx = vec3(1.0, 0.0, 0.0);
    vec3 tz = vec3(0.0, 0.0, 1.0);
    float compression = 0.0;
    for (int i = 0; i < WAVE_COUNT; i++) {
      vec2 d = uWaves[i].xy;
      float k = uWaves[i].z, a = uWaveAQ[i].x, q = uWaveAQ[i].y;
      vec2 across = vec2(-d.y, d.x);
      float index = float(i);
      float bend = dot(across,g)*.14 + uTime*.12 + index*2.4;
      float group = dot(d,g)*.055 - uTime*.16 + index*1.7;
      vec2 da = a*.28*cos(group)*.055*d;
      a *= .72 + .28*sin(group);
      if (i >= 4) {
        float f = clamp((-g.y-8.0)/27.0,0.0,1.0);
        float fade = 1.0-f*f*(3.0-2.0*f);
        da = da*fade + vec2(0.0,a*6.0*f*(1.0-f)/27.0);
        a *= fade;
      }
      float phase = dot(d, g)*k - uWaves[i].w*uTime + index*2.399 + .7*sin(bend);
      vec2 dp = d*k + .098*cos(bend)*across;
      float s = sin(phase), c = cos(phase);
      p += vec3(q*a*d.x*c, a*s, q*a*d.y*c);
      vec2 horizontal = q*(da*c-a*s*dp);
      vec2 vertical = da*s+a*c*dp;
      tx += vec3(d.x*horizontal.x, vertical.x, d.y*horizontal.x);
      tz += vec3(d.x*horizontal.y, vertical.y, d.y*horizontal.y);
      compression -= dot(d,horizontal);
    }
    vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
    vNormal = normalize(cross(tz, tx));
    vCrest = compression;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

export const OCEAN_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBg;
  uniform float uOpacity;
  uniform sampler2D uDetail;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform vec2 uResolution;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vDist;
  void main() {
    vec2 uv = vWorld.xz * .065 + vec2(-.016,.012)*uTime;
    vec3 detail = texture2D(uDetail,uv).rgb;
    vec3 detail2 = texture2D(uDetail,uv*2.3+vec2(.011,0.0)*uTime).rgb;
    float fine = 1.0-smoothstep(8.0,45.0,vDist);
    vec2 ripple = (detail.rg-.5)*.10 + (detail2.rg-.5)*.035;
    vec3 normal = normalize(vNormal + vec3(ripple.x*fine,0.0,ripple.y*fine));
    vec3 view = normalize(cameraPosition-vWorld);
    vec3 light = normalize(vec3(0.65,0.65,-0.8));
    float fresnel = 0.04+0.72*pow(1.0-max(dot(normal,view),0.0),4.0);
    vec3 reflected = reflect(-view,normal);
    vec3 sky = mix(vec3(0.082,0.125,0.155),vec3(0.018,0.036,0.052),smoothstep(0.0,0.8,reflected.y));
    float diffuse = max(dot(normal,light),0.0);
    vec3 water = mix(vec3(0.004,0.011,0.017),vec3(0.016,0.044,0.054),diffuse);
    vec3 col = mix(water,sky,fresnel);
    float spec = pow(max(dot(normal,normalize(light+view)),0.0),32.0);
    col += vec3(0.34,0.45,0.47)*spec*0.11;
    // The cursor behaves like a low, cool inspection lamp. Its broad ambient
    // falloff keeps the edge soft; the normal response makes it belong to the sea.
    vec2 pointerDelta = gl_FragCoord.xy/uResolution-uPointer;
    pointerDelta.x *= uResolution.x/uResolution.y;
    float pointerDistance = length(pointerDelta);
    float pointerHalo = 1.0-smoothstep(.045,.44,pointerDistance);
    vec3 pointerDirection = normalize(vec3(-pointerDelta.x*1.7,.82,-pointerDelta.y*1.25));
    float pointerDiffuse = max(dot(normal,pointerDirection),0.0);
    float pointerSpec = pow(max(dot(normal,normalize(pointerDirection+view)),0.0),20.0);
    vec3 pointerLight = vec3(.22,.40,.44);
    col += pointerLight*pointerHalo*uPointerStrength*(.021+pointerDiffuse*.074+pointerSpec*.033);
    float foamNoise = detail.b*.65+detail2.b*.35;
    float foam = smoothstep(0.25,0.48,vCrest)*smoothstep(0.38,0.72,foamNoise);
    col = mix(col,vec3(0.21,0.28,0.29),foam*0.36);
    // A small foreground lift and deeper distance falloff separate the wave banks
    // without introducing another visual layer or flattening the mid-water detail.
    float foregroundLift = 1.0-smoothstep(7.0,36.0,vDist);
    col *= 1.0+foregroundLift*.04;
    float distanceShade = smoothstep(8.0,54.0,vDist);
    col *= 1.0-distanceShade*.42;
    col = mix(col,vec3(0.009,0.018,0.026),smoothstep(24.0,90.0,vDist));
    col = mix(col,uBg,smoothstep(70.0,115.0,vDist));
    gl_FragColor = vec4(mix(uBg,col,uOpacity),1.0);
    #include <colorspace_fragment>
  }
`
