/**
 * Everything on the page that is a fact about the team rather than about the layout.
 *
 * Real names, photographs and renders replace the placeholders here; nothing in the
 * section code needs to change. Media fields (`photo`, `image`) are optional: while
 * they are absent the page draws a placeholder tile. Drop a file into public/ and set
 * the path to switch.
 *
 * Prose that appears once (hero, challenge, contact) lives in index.html so it is
 * readable without JavaScript; this file holds lists, numbers and flags.
 */

export const FLAGS = {
  /** Show the (placeholder) boat as a ghost render in the hero. */
  HERO_BOAT: false,
  /** Smooth wheel scrolling (Lenis). Touch scrolling is always native. */
  SMOOTH_SCROLL: true,
} as const

export interface Person {
  readonly name: string
  /** Two-digit index shown on the placeholder tile. */
  readonly index: string
  /** Short profile shown beneath the portrait. */
  readonly bio: string
  /** Paths under public/, e.g. ['/team/jane-01.jpg', '/team/jane-02.jpg']. */
  readonly photos?: readonly string[]
  readonly link?: string
}

export interface NewsItem {
  /** ISO date, shown as written. */
  readonly date: string
  readonly title: string
  readonly summary: string
  /** Every news item is a link. Replace placeholder fragments with article URLs. */
  readonly href: string
  /** Optional thumbnail under public/. Text-only stories remain fully supported. */
  readonly image?: string
  readonly imageAlt?: string
}

export interface PastBoat {
  readonly name: string
  readonly note?: string
  readonly image?: string
  readonly alt?: string
}

export const site = {
  name: 'Protosail',
  org: 'University College London',
  short: 'UCL · Microtransat',
  year: 2026,
  /** [placeholder] confirm with the team. */
  email: 'team@protosail.example',
  microtransat: 'https://www.microtransat.org/',
} as const

/** Lon/lat pair. */
export type LonLat = readonly [lon: number, lat: number]

export const challenge = {
  /** Start/finish lines from the rules. Eastern line: Europe side. Western line: America side. */
  route: {
    east: [
      [-16, 55],
      [-16, 51],
      [-11, 46],
      [-13.5, 44.5],
      [-13.5, 37],
      [-20.5, 35],
      [-22, 25],
    ] as readonly LonLat[],
    west: [
      [-47, 48],
      [-47, 45.5],
      [-65, 40],
      [-77, 30],
      [-59, 20],
      [-56, 10],
    ] as readonly LonLat[],
  },
} as const

export const boat = {
  /** Which views from src/config/views.ts become chapters, in order. */
  chapters: ['overview', 'wingsail', 'rudder', 'hull', 'solar', 'electronics'] as const,

  previous: [
    {
      name: 'Prototype 01',
      note: 'Canal testing',
      image: `${import.meta.env.BASE_URL}images/prototypes/prototype-0.webp`,
      alt: 'An early Protosail prototype being tested on a canal',
    },
    {
      name: 'Prototype 02',
      note: 'Lake testing',
      image: `${import.meta.env.BASE_URL}images/prototypes/prototype-1.webp`,
      alt: 'The Protosail team beside a prototype sailboat at a lake',
    },
    {
      name: 'Prototype 03',
      note: 'Previous team and boat',
      image: `${import.meta.env.BASE_URL}images/prototypes/prototype-2.jpeg`,
      alt: 'The Protosail team standing with a yellow and black prototype sailboat',
    },
  ] as readonly PastBoat[],
} as const

export const team = {
  members: [
    {
      name: 'Team member 01',
      index: '01',
      bio: 'Coordinates the technical programme and keeps every subsystem moving toward the same mission. They lead design reviews, manage the path from prototype to sea trial, and turn decisions across mechanics, electronics, and software into a coherent, crossing-ready vessel.',
    },
    {
      name: 'Team member 02',
      index: '02',
      bio: 'Develops the hull, keel, and stability model to balance speed with survival in open water. Their work connects hydrodynamic simulation, structural choices, and physical testing so the boat can recover from difficult conditions without wasting its limited onboard energy.',
    },
    {
      name: 'Team member 03',
      index: '03',
      bio: 'Builds the decision-making and control software that interprets wind, position, and vessel state. They develop navigation logic, tune steering behaviour, and test how the boat chooses a safe course when conditions change far beyond the reach of immediate human intervention.',
    },
    {
      name: 'Team member 04',
      index: '04',
      bio: 'Integrates the onboard computers and sensors that give the vessel awareness of itself and its surroundings. Their focus is reliable operation over months at sea: graceful fault recovery, robust data handling, and useful performance within a tightly controlled power budget.',
    },
    {
      name: 'Team member 05',
      index: '05',
      bio: 'Designs the wingsail and actuation hardware that convert changing wind into controlled motion. They translate aerodynamic loads into a simple mechanical system, reducing moving parts while ensuring the rig can tolerate repeated cycles, impact, corrosion, and difficult weather.',
    },
    {
      name: 'Team member 06',
      index: '06',
      bio: 'Owns solar generation, energy storage, and the communication architecture that connects the vessel to shore. They model consumption across changing conditions and design the safeguards that keep essential sensing, computing, and telemetry available through long periods of poor sunlight.',
    },
  ] as readonly Person[],
  supervisors: [
    {
      name: 'Supervisor 01',
      index: '07',
      bio: 'Guides the research programme, technical validation, and the team’s connection to UCL’s wider engineering community. They challenge assumptions at key design reviews, help frame rigorous experiments, and ensure the project produces knowledge that remains useful beyond a single competition cycle.',
    },
    {
      name: 'Supervisor 02',
      index: '08',
      bio: 'Supports design reviews, testing strategy, and practical engineering decisions as the vessel moves from prototype to sea trials. Their experience helps the team identify failure modes early, plan meaningful verification, and resolve the real-world details that determine whether a design survives offshore.',
    },
  ] as readonly Person[],
  alumni: [
    {
      name: 'Alumnus 01',
      index: '09',
      bio: 'Contributed design knowledge, test evidence, and lessons from an earlier Protosail development cycle. Their documented experiments and hard-won practical insight give the current team a stronger starting point, preventing repeated mistakes and preserving continuity as each new cohort takes over.',
    },
    {
      name: 'Alumnus 02',
      index: '10',
      bio: 'Helped establish the technical foundation that the current team is refining for the next Atlantic attempt. Their work on early architecture and prototypes shaped today’s priorities, while their handover keeps valuable context attached to the decisions, data, and hardware they produced.',
    },
    {
      name: 'Alumnus 03',
      index: '11',
      bio: 'Strengthened the project through patient iteration, documenting what worked in early trials and what still needed to change. Their contribution gives the current team a clearer route from prototype lessons to a more reliable vessel for the next Atlantic attempt.',
    },
  ] as readonly Person[],
} as const

export const news: readonly NewsItem[] = [
  {
    date: '2026-09',
    title: 'Placeholder: first announcement',
    summary: 'One line on what happened and why it matters.',
    href: '#news',
    image: `${import.meta.env.BASE_URL}images/prototypes/prototype-2.jpeg`,
    imageAlt: 'The Protosail team with a previous autonomous sailboat',
  },
  {
    date: '2026-08',
    title: 'Placeholder: build update',
    summary: 'One line on what happened and why it matters.',
    href: '#news',
    image: `${import.meta.env.BASE_URL}images/prototypes/prototype-0.webp`,
    imageAlt: 'An early Protosail prototype during canal testing',
  },
  {
    date: '2026-07',
    title: 'Placeholder: team news',
    summary: 'One line on what happened and why it matters.',
    href: '#news',
  },
  {
    date: '2026-06',
    title: 'Placeholder: design update',
    summary: 'One line on what happened and why it matters.',
    href: '#news',
  },
  {
    date: '2026-05',
    title: 'Placeholder: testing update',
    summary: 'One line on what happened and why it matters.',
    href: '#news',
  },
]
