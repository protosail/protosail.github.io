/**
 * The challenge as one authored moment: a real 3D globe turns around the Atlantic
 * while the competition record resolves into view. The globe pauses offscreen and
 * the complete section remains readable when motion is reduced or JavaScript fails.
 */

import * as THREE from 'three'
import { feature } from 'topojson-client'
import landTopology from 'world-atlas/land-110m.json'
import { challenge, type LonLat } from '../content.js'
import { qs } from '../lib/dom.js'
import { ScrollTrigger, coarsePointer, gsap, instant, reducedMotion } from '../lib/scroll.js'
import { CURSOR_CAMERA } from '../lib/cursor.js'

type Position = readonly [lon: number, lat: number]
type PolygonGeometry = { readonly type: 'Polygon'; readonly coordinates: readonly (readonly Position[])[] }
type MultiPolygonGeometry = {
  readonly type: 'MultiPolygon'
  readonly coordinates: readonly (readonly (readonly Position[])[])[]
}
type LandFeature = { readonly geometry: PolygonGeometry | MultiPolygonGeometry }
type LandFeatureCollection = { readonly features: readonly LandFeature[] }

const RAD = Math.PI / 180
const GLOBE_RADIUS = 1.65
const LINE_RADIUS = 1.76
const ROUTE_RADIUS = 1.79
const BASE_ROTATION_X = 18 * RAD
const BASE_ROTATION_Y = 35 * RAD
const ROUTE_START = [-13.5, 44.5] as const satisfies Position
const ROUTE_FINISH = [-65, 40] as const satisfies Position
const ROUTE_POINT_COUNT = 121

function lonLatToVector([lon, lat]: Position, radius = LINE_RADIUS): THREE.Vector3 {
  const phi = lat * RAD
  const theta = lon * RAD
  const cosPhi = Math.cos(phi)
  return new THREE.Vector3(
    radius * cosPhi * Math.sin(theta),
    radius * Math.sin(phi),
    radius * cosPhi * Math.cos(theta),
  )
}

function addSegment(positions: number[], start: Position, end: Position, radius = LINE_RADIUS): void {
  if (Math.abs(start[0] - end[0]) > 180) return
  positions.push(...lonLatToVector(start, radius).toArray(), ...lonLatToVector(end, radius).toArray())
}

function buildGraticule(): THREE.LineSegments {
  const positions: number[] = []
  for (let lat = -80; lat <= 80; lat += 10) {
    for (let lon = -180; lon < 180; lon += 2) addSegment(positions, [lon, lat], [lon + 2, lat])
  }
  for (let lon = -180; lon < 180; lon += 10) {
    for (let lat = -84; lat < 84; lat += 2) addSegment(positions, [lon, lat], [lon, lat + 2])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x87949d, transparent: true, opacity: 0.085, linewidth: 0.65 }),
  )
}

function buildCoastlines(): THREE.LineSegments {
  const topology = landTopology as unknown as { readonly objects: { readonly land: unknown } }
  const land = feature(topology, topology.objects.land) as LandFeatureCollection
  const positions: number[] = []

  for (const landFeature of land.features) {
    const geometry = landFeature?.geometry
    if (!geometry) continue
    const polygons = geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.coordinates
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let index = 1; index < ring.length; index += 1) {
          addSegment(positions, ring[index - 1]!, ring[index]!)
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xd6dde2, transparent: true, opacity: 0.64 }),
  )
}

function buildCourseLine(points: readonly LonLat[], color: number, opacity: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => lonLatToVector(point, ROUTE_RADIUS)))
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
}

function buildAtlanticArc(): {
  guide: THREE.Line
  guideMaterial: THREE.LineDashedMaterial
  trace: THREE.Line
  traceMaterial: THREE.LineBasicMaterial
  wake: THREE.Line
  wakeMaterial: THREE.LineBasicMaterial
  marker: THREE.Mesh
  beacon: THREE.Sprite
  points: readonly THREE.Vector3[]
} {
  const start = lonLatToVector(ROUTE_START, 1).normalize()
  const end = lonLatToVector(ROUTE_FINISH, 1).normalize()
  const angle = Math.acos(THREE.MathUtils.clamp(start.dot(end), -1, 1))
  const sinAngle = Math.sin(angle)
  const points: THREE.Vector3[] = []
  for (let index = 0; index < ROUTE_POINT_COUNT; index += 1) {
    const progress = index / (ROUTE_POINT_COUNT - 1)
    const fromWeight = Math.sin((1 - progress) * angle) / sinAngle
    const toWeight = Math.sin(progress * angle) / sinAngle
    points.push(start.clone().multiplyScalar(fromWeight).addScaledVector(end, toWeight).multiplyScalar(ROUTE_RADIUS))
  }

  const guideGeometry = new THREE.BufferGeometry().setFromPoints(points)
  const guideMaterial = new THREE.LineDashedMaterial({
    color: 0xf0efeb,
    dashSize: 0.038,
    gapSize: 0.04,
    transparent: true,
    opacity: 0.22,
  })
  const guide = new THREE.Line(guideGeometry, guideMaterial)
  guide.computeLineDistances()

  const tracePoints = points.map((point) => point.clone().setLength(ROUTE_RADIUS + 0.012))
  const traceGeometry = new THREE.BufferGeometry().setFromPoints(tracePoints)
  const traceMaterial = new THREE.LineBasicMaterial({
    color: 0xe3f941,
    transparent: true,
    opacity: 0.88,
  })
  const trace = new THREE.Line(traceGeometry, traceMaterial)
  trace.geometry.setDrawRange(0, ROUTE_POINT_COUNT)

  const wakeMaterial = new THREE.LineBasicMaterial({
    color: 0xfff4ec,
    transparent: true,
    opacity: 0.98,
  })
  const wake = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tracePoints), wakeMaterial)
  wake.geometry.setDrawRange(0, 0)

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4ec }),
  )
  marker.position.copy(tracePoints.at(-1)!)

  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = 64
  glowCanvas.height = 64
  const glowContext = glowCanvas.getContext('2d')
  if (!glowContext) throw new Error('Unable to create route glow')
  const glow = glowContext.createRadialGradient(32, 32, 2, 32, 32, 31)
  glow.addColorStop(0, 'rgba(255, 244, 236, 1)')
  glow.addColorStop(0.14, 'rgba(227, 249, 65, 0.96)')
  glow.addColorStop(0.46, 'rgba(227, 249, 65, 0.34)')
  glow.addColorStop(1, 'rgba(227, 249, 65, 0)')
  glowContext.fillStyle = glow
  glowContext.fillRect(0, 0, 64, 64)
  const beacon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  beacon.scale.setScalar(0.22)
  beacon.position.copy(tracePoints.at(-1)!)

  return { guide, guideMaterial, trace, traceMaterial, wake, wakeMaterial, marker, beacon, points: tracePoints }
}

function buildEndpoint(point: Position): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xe3f941 }),
  )
  marker.position.copy(lonLatToVector(point, ROUTE_RADIUS + 0.018))
  return marker
}

function initGlobe(): void {
  const figure = qs<HTMLElement>('[data-globe]')
  const section = qs<HTMLElement>('#challenge')
  const canvas = qs<HTMLCanvasElement>('[data-globe-canvas]')
  const startLabel = qs<HTMLElement>('[data-globe-start-label]', figure)
  const finishLabel = qs<HTMLElement>('[data-globe-finish-label]', figure)
  const reduceMotion = instant
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-2.25, 2.25, 2.25, -2.25, 0.1, 20)
  camera.position.set(0, 0, 7)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))

  const world = new THREE.Group()
  world.rotation.set(BASE_ROTATION_X, BASE_ROTATION_Y, 0)
  scene.add(world)

  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 72, 48),
    new THREE.MeshStandardMaterial({
      color: 0x0a1722,
      emissive: 0x03080d,
      emissiveIntensity: 0.7,
      metalness: 0.08,
      roughness: 0.78,
    }),
  )
  world.add(ocean, buildGraticule(), buildCoastlines())
  world.add(buildCourseLine(challenge.route.east, 0xe3f941, 1))
  world.add(buildCourseLine(challenge.route.west, 0xe3f941, 1))
  const atlanticArc = buildAtlanticArc()
  world.add(
    atlanticArc.guide,
    atlanticArc.trace,
    atlanticArc.wake,
    atlanticArc.beacon,
    atlanticArc.marker,
    buildEndpoint(ROUTE_START),
    buildEndpoint(ROUTE_FINISH),
  )

  scene.add(new THREE.HemisphereLight(0xaebfca, 0x020407, 1.65))
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.25)
  keyLight.position.set(-2.5, 3.4, 5)
  scene.add(keyLight)
  const edgeLight = new THREE.DirectionalLight(0xe3f941, 1.35)
  edgeLight.position.set(4, -1, -2)
  scene.add(edgeLight)

  let active = !document.hidden
  let inView = false
  let frame = 0
  let routeElapsed = 0
  let previousFrameTime = 0
  let lastPaint = performance.now()
  const pointer = new THREE.Vector2()
  const pointerTarget = new THREE.Vector2()
  let pointerStrength = 0
  let pointerStrengthTarget = 0

  const updateLabel = (label: HTMLElement, point: Position): void => {
    const anchor = lonLatToVector(point, ROUTE_RADIUS + 0.045).applyMatrix4(world.matrixWorld)
    const visible = anchor.z > 0.06
    const projected = anchor.clone().project(camera)
    label.style.left = `${(projected.x * 0.5 + 0.5) * figure.clientWidth}px`
    label.style.top = `${(-projected.y * 0.5 + 0.5) * figure.clientHeight}px`
    label.style.opacity = visible ? '1' : '0'
  }

  const paint = (time = 0): void => {
    const dt = Math.min(Math.max(0, time - lastPaint) / 1000, 0.1)
    lastPaint = time
    const pointerFollow = 1 - Math.exp(-dt / CURSOR_CAMERA.settle)
    pointer.lerp(pointerTarget, pointerFollow)
    pointerStrength += (pointerStrengthTarget - pointerStrength) * pointerFollow
    if (!reduceMotion) {
      world.rotation.y = BASE_ROTATION_Y + Math.sin(time * 0.00024) * 0.23
      world.rotation.x = BASE_ROTATION_X + Math.sin(time * 0.00016) * 0.04
      world.rotation.z = Math.sin(time * 0.00011) * 0.012
      atlanticArc.guideMaterial.dashOffset = time * -0.000045

      const cycle = routeElapsed / 7600
      const travel = Math.min(1, cycle / 0.78)
      const pointIndex = Math.min(ROUTE_POINT_COUNT - 1, Math.floor(travel * (ROUTE_POINT_COUNT - 1)))
      const wakeStart = Math.max(0, pointIndex - 16)
      const fade = cycle > 0.9 ? 1 - (cycle - 0.9) / 0.1 : 1
      atlanticArc.trace.geometry.setDrawRange(0, Math.max(2, pointIndex + 1))
      atlanticArc.wake.geometry.setDrawRange(wakeStart, Math.max(2, pointIndex - wakeStart + 1))
      atlanticArc.traceMaterial.opacity = 0.88 * fade
      atlanticArc.wakeMaterial.opacity = 0.98 * fade
      atlanticArc.marker.position.copy(atlanticArc.points[pointIndex]!)
      atlanticArc.beacon.position.copy(atlanticArc.points[pointIndex]!)
      const pulse = 1 + Math.sin(time * 0.011) * 0.22
      atlanticArc.marker.scale.setScalar(pulse)
      atlanticArc.beacon.scale.setScalar(0.22 + Math.sin(time * 0.006) * 0.035)
      atlanticArc.marker.visible = fade > 0
      atlanticArc.beacon.visible = fade > 0
    } else {
      atlanticArc.trace.geometry.setDrawRange(0, ROUTE_POINT_COUNT)
      atlanticArc.wake.geometry.setDrawRange(0, 0)
      atlanticArc.marker.position.copy(atlanticArc.points.at(-1)!)
      atlanticArc.beacon.visible = false
    }
    keyLight.position.set(
      -2.5 + pointer.x * 2.2 * pointerStrength,
      3.4 + pointer.y * 1.6 * pointerStrength,
      5,
    )
    // Match the boat's camera parallax and project labels through the live view.
    camera.position.set(7 * pointer.x * CURSOR_CAMERA.x * pointerStrength,
      7 * pointer.y * CURSOR_CAMERA.y * pointerStrength, 7)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    world.updateMatrixWorld(true)
    updateLabel(startLabel, ROUTE_START)
    updateLabel(finishLabel, ROUTE_FINISH)
    renderer.render(scene, camera)
  }

  const tick = (time: number): void => {
    frame = 0
    if (previousFrameTime) routeElapsed = (routeElapsed + Math.min(time - previousFrameTime, 50)) % 7600
    previousFrameTime = time
    paint(time)
    if (active && inView && !reducedMotion) frame = window.requestAnimationFrame(tick)
  }

  const start = (): void => {
    if (!frame && active && inView && !reducedMotion) {
      previousFrameTime = 0
      frame = window.requestAnimationFrame(tick)
    }
  }

  const resize = (): void => {
    const width = Math.max(1, figure.clientWidth)
    const height = Math.max(1, figure.clientHeight)
    const aspect = width / height
    const viewHeight = 4.22
    camera.left = (-viewHeight * aspect) / 2
    camera.right = (viewHeight * aspect) / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    paint(performance.now())
    start()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(figure)
  const visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      const nextInView = Boolean(entry?.isIntersecting)
      if (nextInView && !inView) routeElapsed = 0
      inView = nextInView
      start()
    },
    { rootMargin: '15% 0px' },
  )
  visibilityObserver.observe(figure)

  const onVisibilityChange = (): void => {
    active = !document.hidden
    start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    const rect = section.getBoundingClientRect()
    pointerTarget.set(
      Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2)),
      Math.max(-1, Math.min(1, (0.5 - (event.clientY - rect.top) / rect.height) * 2)),
    )
    pointerStrengthTarget = 1
    const figureRect = figure.getBoundingClientRect()
    figure.style.setProperty('--globe-light-x', `${event.clientX - figureRect.left}px`)
    figure.style.setProperty('--globe-light-y', `${event.clientY - figureRect.top}px`)
    figure.style.setProperty('--globe-light-strength', '1')
    start()
  }
  const onPointerLeave = (): void => {
    pointerTarget.set(0, 0)
    pointerStrengthTarget = 0
    figure.style.setProperty('--globe-light-strength', '0')
  }
  if (!coarsePointer && !reducedMotion) {
    section.addEventListener('pointermove', onPointerMove, { passive: true })
    section.addEventListener('pointerleave', onPointerLeave)
  }

  window.addEventListener(
    'pagehide',
    () => {
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      section.removeEventListener('pointermove', onPointerMove)
      section.removeEventListener('pointerleave', onPointerLeave)
      renderer.dispose()
      ocean.geometry.dispose()
    },
    { once: true },
  )

  resize()
}

function initScore(): void {
  const score = qs<HTMLElement>('[data-challenge-score]')
  const attemptCount = qs<HTMLElement>('[data-attempt-count]')
  const successCount = qs<HTMLElement>('[data-success-count]')
  if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  ScrollTrigger.create({
    trigger: score,
    start: 'top 82%',
    once: true,
    onEnter: () => {
      const counter = { value: 0 }
      attemptCount.textContent = '0'
      const labels = score.querySelectorAll<HTMLElement>('.challenge__metric-label')
      const attemptLabel = labels[0]
      const successLabel = labels[1]
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      timeline.fromTo(
        attemptCount,
        { yPercent: 34, opacity: 0.18, filter: 'blur(10px)' },
        { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 0.8, clearProps: 'transform,filter' },
      )
      timeline.to(
        counter,
        {
          value: 38,
          duration: 1.15,
          ease: 'power2.out',
          onUpdate: () => {
            attemptCount.textContent = String(Math.round(counter.value))
          },
        },
        0,
      )
      if (attemptLabel) {
        timeline.fromTo(
          attemptLabel,
          { clipPath: 'inset(0 100% 0 0)', opacity: 0.2 },
          { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.72, clearProps: 'clip-path' },
          0.08,
        )
      }
      timeline.fromTo(
        successCount,
        { yPercent: 34, opacity: 0.18, filter: 'blur(10px)' },
        { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 0.8, clearProps: 'transform,filter' },
        1.15,
      )
      if (successLabel) {
        timeline.fromTo(
          successLabel,
          { clipPath: 'inset(0 100% 0 0)', opacity: 0.2 },
          { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.72, clearProps: 'clip-path' },
          1.24,
        )
      }
    },
  })
}

export function initChallenge(): void {
  initGlobe()
  initScore()
}
