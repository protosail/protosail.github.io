/**
 * Reinterprets the Fusion materials as things that exist in the world.
 *
 * The export carries nine materials, all with metalness left unset (so glTF defaults
 * them to fully metallic), all double-sided, all at the same roughness. That is a CAD
 * colour scheme, not a description of a boat, so every primitive gets a new material
 * here, chosen by (part id, source material name).
 *
 * Keying on the source *name* is not incidental: four of the nine materials — `Clear`,
 * `Glossy - Black`, `Steel - Polished` and `Black` — are byte-identical apart from that
 * name, so it's the only thing separating the housings from the tail spar. The asset
 * pipeline dedups with keepUniqueNames for exactly this reason.
 *
 * Every primitive also gets its *own* material instance, which is what lets a view dim
 * the parts it isn't talking about without touching the parts it is.
 */

import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshPhysicalMaterial,
  type MeshPhysicalMaterialParameters,
  ShaderMaterial,
  Vector2,
} from 'three'
import {
  PART_IDS,
  XRAY_GHOSTED,
  XRAY_FADED,
  ELECTRONICS,
  type PartId,
} from '../config/parts.js'
import type { LoadedModel } from './model.js'

export const ACCENT = 0xe3f941

type Spec = MeshPhysicalMaterialParameters

/** Default reading of each Fusion material. */
const BY_SOURCE: Record<string, Spec> = {
  // Deck, hatches, rudder stock, tail vane. A warm off-white gel coat, not paper —
  // and kept well off pure white, because a big flat deck under a hard key clips first.
  White: {
    color: 0xd6d3ca,
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
  },
  // Hull topsides. Glossy brand yellow — this is the colour doing most of the work.
  'Blue - Wall Paint - Glossy': {
    color: ACCENT,
    envMapIntensity: 0.25,
    specularIntensity: 0.25,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
  },
  // The wing. Satin rather than glossy, so it reads as a different construction to
  // the hull instead of a second piece of the same moulding.
  'Blue - Wall Paint - Glossy.001': {
    color: ACCENT,
    envMapIntensity: 0.25,
    specularIntensity: 0.2,
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.3,
  },
  // Wing frame, counterweights, panel cell fields.
  'Glossy - Black': {
    color: 0x14171c,
    roughness: 0.38,
    metalness: 0.25,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
  },
  // The tail spar. The one genuinely metal thing on the boat.
  'Steel - Polished': { color: 0xb6bcc5, roughness: 0.24, metalness: 1 },
  // The two electronics bays.
  Clear: {
    color: 0xe4e6dc,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    emissive: 0xa4aa8d,
    emissiveIntensity: 0,
  },
  // Panel frames and backsheets.
  'Cool White': { color: 0xd2d7de, roughness: 0.46, metalness: 0.06, clearcoat: 0.3 },
  // The underside cell surfaces (hidden — see model.ts).
  Black: { color: 0x090d17, roughness: 0.28, metalness: 0.1 },
  // A 0.5 mm leftover face between the rudder stock and the blade. Reading it as a
  // bearing seal is more honest than leaving a pink disc on the boat.
  Pink: { color: 0x101216, roughness: 0.55, metalness: 0.2 },
}

/** Monocrystalline cell laminate: nearly black, but blue and mirror-like at a glance. */
const CELL: Spec = {
  color: 0x0a1024,
  roughness: 0.22,
  metalness: 0.15,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  emissive: 0x0d2a4d,
  emissiveIntensity: 0,
}

/**
 * Overrides, most specific first. `parts` empty means "any part".
 * This is where a re-exported model with tidier materials would need the least work.
 */
const OVERRIDES: { parts: PartId[]; source?: string; spec: Spec }[] = [
  // The active cell area of all three arrays comes through as `Glossy - Black`.
  { parts: ['solarMain', 'solarAft', 'solarBow'], source: 'Glossy - Black', spec: CELL },
]

function specFor(part: PartId, source: string): Spec {
  for (const rule of OVERRIDES) {
    if (rule.parts.length && !rule.parts.includes(part)) continue
    if (rule.source && rule.source !== source) continue
    return rule.spec
  }
  return BY_SOURCE[source] ?? { color: 0x8892a0, roughness: 0.5, metalness: 0.1 }
}

// ---------------------------------------------------------------------------
// Fresnel shell used for the x-ray dissolve
// ---------------------------------------------------------------------------

const GHOST_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const GHOST_FRAG = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBody;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform vec2 uResolution;
  void main() {
    float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
    float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 3.2);
    float body = uBody + rim * 0.86;
    vec2 pointerDelta = gl_FragCoord.xy/uResolution-uPointer;
    pointerDelta.x *= uResolution.x/uResolution.y;
    float pointerHalo = (1.0-smoothstep(.04,.42,length(pointerDelta)))*uPointerStrength;
    vec3 glow = uColor*(0.16+rim*.95) + vec3(.2,.38,.43)*pointerHalo*(.052+rim*.104);
    gl_FragColor = vec4(glow,body*uOpacity*(1.0+pointerHalo*.052));
    // uColor is a THREE.Color and so arrives linear; convert on the way out.
    #include <colorspace_fragment>
  }
`

export interface GhostOptions {
  /** Off = draw through everything (the hero keel shows under the sea). Default on. */
  depthTest?: boolean
  /** A little more surface fill keeps the hero silhouette readable against waves. */
  body?: number
}

/** The fresnel shell: additive and double-sided, shared by the x-ray and the hero. */
export function createGhostMaterial(
  color: number,
  opacity: number,
  options: GhostOptions = {},
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
      uBody: { value: options.body ?? 0.04 },
      uPointer: { value: new Vector2(-10,-10) },
      uPointerStrength: { value: 0 },
      uResolution: { value: new Vector2(1,1) },
    },
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: options.depthTest ?? true,
    blending: AdditiveBlending,
    // Both shells of the hull, so it reads as a volume rather than a near surface.
    side: DoubleSide,
  })
}

// ---------------------------------------------------------------------------

interface Slot {
  mesh: Mesh
  part: PartId
  material: MeshPhysicalMaterial
  baseColor: Color
  baseOpacity: number
  baseClearcoat: number
  baseRoughness: number
  /** Some parts ship hidden (see model.ts); fading must never bring them back. */
  baseVisible: boolean
  /** Fades out and is replaced by a fresnel shell during x-ray. */
  isShell: boolean
  /** Small enough that a shell would be noise; just fades away during x-ray. */
  isFaded: boolean
  /** Lifts and glows during x-ray. */
  isBay: boolean
  /** Solar cell laminate; picks up a little glow when the arrays are the subject. */
  isCell: boolean
  /** 0 = full attention, 1 = pushed into the background. */
  dim: number
  dimTarget: number
}

export interface MaterialSystem {
  /** 0 = solid boat, 1 = hull dissolved to a shell. */
  setXray(on: boolean): void
  /** Parts to keep at full strength; everything else recedes. Empty/null = all equal. */
  setHighlight(ids: readonly PartId[] | null | undefined): void
  update(dt: number): void
  dispose(): void
}

// A backgrounded part loses albedo, environment, gloss and sharpness together. Albedo
// alone does almost nothing: on a white gel coat under a hard key it's the specular
// that's bright, and no amount of darkening the base colour touches that. Roughening
// the surface is what actually puts a part into the background.
const DIM_COLOR = 0.78
const DIM_ENV = 0.62
const DIM_COAT = 0.85
const DIM_ROUGH = 0.6 // fraction of the way to fully matte

export function createMaterials(model: LoadedModel): MaterialSystem {
  const slots: Slot[] = []
  const shellSet = new Set<PartId>(XRAY_GHOSTED)
  const fadedSet = new Set<PartId>(XRAY_FADED)
  const baySet = new Set<PartId>(ELECTRONICS)

  // A restrained warm grey keeps the X-ray legible without a neon shell.
  const ghostMaterial = createGhostMaterial(0xb8bba5, 0)
  const ghosts: Mesh[] = []

  for (const part of PART_IDS) {
    for (const mesh of model.meshesOf(part)) {
      const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? ''
      const spec = specFor(part, source)

      const material = new MeshPhysicalMaterial({
        // The export marks everything double-sided; winding is consistent across all 28
        // primitives, so single-sided is both correct and half the fragment work.
        side: FrontSide,
        envMapIntensity: 1,
        ...spec,
      })
      material.name = `${part}/${source}`

      const old = mesh.material
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else old?.dispose()
      mesh.material = material

      const isBay = baySet.has(part)
      if (isBay) {
        mesh.renderOrder = 5
        mesh.castShadow = false
      }

      slots.push({
        mesh,
        part,
        material,
        baseColor: material.color.clone(),
        baseOpacity: material.opacity,
        baseClearcoat: material.clearcoat,
        baseRoughness: material.roughness,
        baseVisible: mesh.visible && model.parts[part].visible,
        isShell: shellSet.has(part),
        isFaded: fadedSet.has(part),
        isBay,
        isCell: spec === CELL,
        dim: 0,
        dimTarget: 0,
      })

      if (shellSet.has(part)) {
        // Shares the geometry, so the second copy costs a draw call and nothing else.
        const ghost = new Mesh(mesh.geometry, ghostMaterial)
        ghost.matrixAutoUpdate = false
        ghost.matrix.copy(mesh.matrixWorld)
        ghost.matrixWorld.copy(mesh.matrixWorld)
        ghost.frustumCulled = false
        ghost.renderOrder = 10
        ghost.visible = false
        model.root.add(ghost)
        ghosts.push(ghost)
      }
    }
  }

  let xray = 0
  let xrayTarget = 0
  let cellGlow = 0
  let cellGlowTarget = 0
  const tint = new Color()

  function applyDim(slot: Slot) {
    const k = slot.dim
    tint.copy(slot.baseColor).multiplyScalar(1 - DIM_COLOR * k)
    slot.material.color.copy(tint)
    slot.material.envMapIntensity = 1 - DIM_ENV * k
    slot.material.clearcoat = slot.baseClearcoat * (1 - DIM_COAT * k)
    slot.material.roughness = slot.baseRoughness + (0.92 - slot.baseRoughness) * DIM_ROUGH * k
  }

  return {
    setXray(on) {
      xrayTarget = on ? 1 : 0
    },

    setHighlight(ids) {
      const focus = ids && ids.length ? new Set(ids) : null
      for (const slot of slots) {
        slot.dimTarget = !focus || focus.has(slot.part) ? 0 : 1
      }
      cellGlowTarget = focus && slots.some((s) => s.isCell && focus.has(s.part)) ? 1 : 0
    },

    update(dt) {
      // ~180 ms to settle; fast enough to feel like a response, slow enough to read.
      const k = 1 - Math.exp(-dt / 0.18)

      for (const slot of slots) {
        if (slot.dim === slot.dimTarget) continue
        slot.dim =
          Math.abs(slot.dim - slot.dimTarget) > 0.0005
            ? slot.dim + (slot.dimTarget - slot.dim) * k
            : slot.dimTarget
        applyDim(slot)
      }

      xray =
        Math.abs(xray - xrayTarget) > 0.0005
          ? xray + (xrayTarget - xray) * (1 - Math.exp(-dt / 0.22))
          : xrayTarget
      cellGlow += (cellGlowTarget - cellGlow) * k

      const solid = 1 - xray
      for (const slot of slots) {
        if (slot.isShell || slot.isFaded) {
          const opacity = slot.baseOpacity * solid
          slot.material.transparent = xray > 0.002
          slot.material.depthWrite = xray < 0.5
          slot.material.opacity = opacity
          slot.mesh.visible = slot.baseVisible && opacity > 0.02
          slot.mesh.castShadow = xray < 0.5
        } else if (slot.isBay) {
          slot.material.opacity = slot.baseOpacity + (0.62 - slot.baseOpacity) * xray
          slot.material.emissiveIntensity = 0.45 * xray
        } else if (slot.isCell) {
          slot.material.emissiveIntensity = cellGlow * 0.3
        }
      }

      ghostMaterial.uniforms.uOpacity.value = xray
      const ghostVisible = xray > 0.01
      for (const ghost of ghosts) ghost.visible = ghostVisible
    },

    dispose() {
      for (const slot of slots) slot.material.dispose()
      for (const ghost of ghosts) ghost.removeFromParent()
      ghostMaterial.dispose()
    },
  }
}
