/**
 * The vocabulary of the model.
 *
 * These ids are written into the GLB as node names by scripts/process-model.mjs, which
 * hard-fails if any of them can't be resolved. Nothing downstream ever refers to a
 * Fusion name or a `BodyN` — if the boat gets re-exported, that script is the only
 * place that needs to learn the new names.
 */

export const PART_IDS = [
  'hull',
  'hallSensor',
  'wing',
  'wingFrame',
  'counterweightUpper',
  'counterweightLower',
  'tailVane',
  'rudder',
  'hatchMain',
  'hatchAft',
  'housingFwd',
  'housingAft',
  'solarBow',
  'solarMain',
  'solarAft',
  'solarCell1',
  'solarCell2',
  'solarCell3',
  'solarCell4',
  'solarCell5',
  'solarCell6',
  'solarCell7',
  'solarCell8',
] as const

export type PartId = (typeof PART_IDS)[number]

export const SOLAR_CELLS: PartId[] = [
  'solarCell1',
  'solarCell2',
  'solarCell3',
  'solarCell4',
  'solarCell5',
  'solarCell6',
  'solarCell7',
  'solarCell8',
]

/** Rides the mast pivot. `tailVane` is deliberately absent: it hangs off its own pivot. */
export const WING_ASSEMBLY: PartId[] = [
  'wing',
  'wingFrame',
  'counterweightUpper',
  'counterweightLower',
]

/**
 * Everything that has to become see-through before you can look into the hull.
 *
 * Only the hull earns a fresnel shell. Deck furniture is flat, so at the angles this
 * view is seen from it sits nearly edge-on and a shell would read as a bright slab
 * rather than a hint of a surface — those parts simply go away instead, which also
 * makes the point that they're what you'd have to take off to get at the bays.
 */
export const XRAY_GHOSTED: PartId[] = ['hull']
export const XRAY_FADED: PartId[] = [
  'hatchMain',
  'hatchAft',
  'solarMain',
  'solarAft',
  'solarBow',
  'hallSensor',
  ...SOLAR_CELLS,
]

/**
 * The two placeholder bays. Real internal geometry lands here later: export it from
 * Fusion inside the same envelope, add ids in process-model.mjs and list them below —
 * the x-ray, the labels and the Electronics view all read from this one array.
 */
export const ELECTRONICS: PartId[] = ['housingFwd', 'housingAft']

/** Measured from the source model, in metres. Used for framing and dimension leaders. */
export const HULL_EXTENT = {
  bow: -0.9436,
  stern: 1.0564,
  keel: -0.9798,
  deck: 0.1137,
  masthead: 1.4499,
  halfBeam: 0.1603,
} as const

export const LOA = HULL_EXTENT.stern - HULL_EXTENT.bow // 2.000 m
export const BEAM = HULL_EXTENT.halfBeam * 2 // 0.321 m
export const DRAFT = -HULL_EXTENT.keel // 0.980 m, keel tip below the waterline at y = 0
export const RIG_HEIGHT = HULL_EXTENT.masthead - HULL_EXTENT.deck // 1.336 m, deck to masthead
