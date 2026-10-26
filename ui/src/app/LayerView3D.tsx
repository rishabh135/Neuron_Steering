import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LayerView3DProps } from "@lab/kit"
import { LAYER_KINDS, N_LAYERS, INTERMEDIATE } from "@lab/model"
import { neuronsFor } from "@lab/presets"
import { useLab } from "@lab/store"

const GRID = 96 // 96 x 96 = 9,216 positions: an index grid, n = 96*row + col

const css = (name: string) => getComputedStyle(document.querySelector(".lab-root") ?? document.documentElement).getPropertyValue(name).trim() || "#888"

export default function LayerView3D({ selected, onSelect }: LayerView3DProps) {
  const lab = useLab()
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ reset(): void; setSelected(s: LayerView3DProps["selected"]): void } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const ns = useMemo(() => neuronsFor(lab.controls.preset, lab.controls.component), [lab.controls.preset, lab.controls.component])
  const nsRef = useRef(ns)
  nsRef.current = ns
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" })
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "WebGL is unavailable")
      return
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(dpr)
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = "block"
    renderer.domElement.setAttribute("aria-hidden", "true")
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
    const home = new THREE.Vector3(6, 7, 34)
    const aim = new THREE.Vector3(0, -3.5, 0)
    camera.position.copy(home)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.copy(aim)
    scene.add(new THREE.AmbientLight(0xffffff, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(10, 20, 15)
    scene.add(sun)

    const geo = new THREE.BoxGeometry(0.8, 1.0, 1.0)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55 })
    const layers = new THREE.InstancedMesh(geo, mat, N_LAYERS)
    const m4 = new THREE.Matrix4()
    const color = new THREE.Color()
    const spacing = 1.15
    const x0 = -((N_LAYERS - 1) * spacing) / 2
    const recipeLayers = () => new Set(nsRef.current.map((n) => n.layer))
    let sel: LayerView3DProps["selected"] = selected
    const paintLayers = () => {
      const hits = recipeLayers()
      for (let i = 0; i < N_LAYERS; i++) {
        const isSel = sel?.layer === i
        const full = LAYER_KINDS[i] === "full_attention"
        m4.compose(new THREE.Vector3(x0 + i * spacing, isSel ? 0.3 : 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, (full ? 1.5 : 1) * (isSel ? 1.25 : 1), 1))
        layers.setMatrixAt(i, m4)
        layers.setColorAt(i, color.set(hits.has(i) ? css("--recipe") : css("--muted-foreground")).multiplyScalar(hits.has(i) ? 1 : 0.55))
      }
      layers.instanceMatrix.needsUpdate = true
      if (layers.instanceColor) layers.instanceColor.needsUpdate = true
    }
    scene.add(layers)

    // 9,216 neurons of the selected layer as one instanced mesh: uniform colour, only the chosen neuron differs.
    const dot = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: css("--border"), roughness: 0.8 }), INTERMEDIATE)
    for (let n = 0; n < INTERMEDIATE; n++) {
      m4.makeTranslation(((n % GRID) - GRID / 2) * 0.13, -(Math.floor(n / GRID) - GRID / 2) * 0.13 - 8, 0)
      dot.setMatrixAt(n, m4)
    }
    dot.visible = false
    scene.add(dot)
    const chosen = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: css("--recipe"), emissive: css("--recipe"), emissiveIntensity: 0.4 }))
    chosen.visible = false
    scene.add(chosen)
    const syncNeuron = () => {
      const show = sel !== null && sel.neuron !== null
      dot.visible = show
      chosen.visible = show
      if (show) chosen.position.set(((sel!.neuron! % GRID) - GRID / 2) * 0.13, -(Math.floor(sel!.neuron! / GRID) - GRID / 2) * 0.13 - 8, 0.2)
    }
    paintLayers()
    syncNeuron()

    let dirty = true
    let visible = true
    let raf = 0
    const size = () => {
      const w = el.clientWidth
      const h = Math.max(300, Math.min(480, Math.round(w * 0.55)))
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      dirty = true
    }
    const ro = new ResizeObserver(size)
    ro.observe(el)
    size()
    controls.addEventListener("change", () => (dirty = true))
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) dirty = true }, { threshold: 0.01 })
    io.observe(el)
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden) return
      const moved = controls.update()
      if (dirty || moved) { renderer.render(scene, camera); dirty = false }
    }
    loop()

    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down = { x: 0, y: 0 }
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return // a drag, not a click
      const r = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObject(layers)[0]
      if (hit?.instanceId !== undefined) onSelectRef.current({ layer: hit.instanceId, neuron: null })
    }
    renderer.domElement.addEventListener("pointerdown", onDown)
    renderer.domElement.addEventListener("pointerup", onUp)

    api.current = {
      reset() { camera.position.copy(home); controls.target.copy(aim); controls.update(); dirty = true },
      setSelected(s) { sel = s; paintLayers(); syncNeuron(); dirty = true },
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointerup", onUp)
      controls.dispose()
      geo.dispose(); mat.dispose(); layers.dispose(); dot.geometry.dispose(); (dot.material as THREE.Material).dispose(); dot.dispose()
      chosen.geometry.dispose(); (chosen.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      api.current = null
    }
  // the scene is built once; selection and recipe changes are pushed in below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.resolvedTheme])

  useEffect(() => { api.current?.setSelected(selected) }, [selected, ns])

  const move = (d: number) => onSelect({ layer: Math.min(N_LAYERS - 1, Math.max(0, (selected?.layer ?? 0) + d)), neuron: null })
  if (failed) return <p role="alert" className="rounded-md border border-border p-4 text-label">WebGL is not available ({failed}). The 2D map shows the same information.</p>
  return (
    <div className="flex flex-col gap-3">
      <div ref={host} tabIndex={0} role="application" aria-roledescription="3D layer view"
        aria-label={`Layer view. Layer ${selected?.layer ?? "none"} selected. Left and right arrows change layer; use the 2D map or the neuron buttons for the full list.`}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); move(1) } else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1) } else if (e.key === "Home") { e.preventDefault(); onSelect({ layer: 0, neuron: null }) } else if (e.key === "End") { e.preventDefault(); onSelect({ layer: N_LAYERS - 1, neuron: null }) } else if (e.key === "Escape") onSelect(null) }}
        className="w-full overflow-hidden rounded-md border border-border bg-background" />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => api.current?.reset()}><RotateCcw size={16} aria-hidden />Reset camera</Button>
        <p className="text-label text-muted-foreground">Drag to orbit, scroll or pinch to zoom, click a slab, or use ← → when the view has focus. Violet slabs hold recipe neurons; taller slabs are full-attention layers.</p>
      </div>
      <p className="text-meta text-muted-foreground">Illustration of structure only: placement carries no meaning, and the 9,216 neuron cubes of a selected layer sit on an index grid (n = 96·row + column), all the same colour except the chosen one. No activation is shown.</p>
    </div>
  )
}
