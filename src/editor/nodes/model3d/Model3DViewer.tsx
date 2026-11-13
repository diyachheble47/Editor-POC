import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEditorUI } from '../../context/EditorUIContext'
import { $getModel3DNodeByKey } from './Model3DNode'
import type { Model3DAnimationConfig, Model3DDisplayConfig, Model3DCamera } from './Model3DNode'
import type { NodeKey } from 'lexical'
import { saveAsset, getAsset, isAssetUrl, assetIdFromUrl, assetUrlFor } from '../../assetStore'

interface Props {
  nodeKey: NodeKey
  modelId: string
  modelUrl: string
  fileName: string
  scale: number
  animation: Model3DAnimationConfig
  display: Model3DDisplayConfig
}

// 'unloaded' = has a modelUrl but hasn't been built into an actual Three.js
// scene yet, either because it's never scrolled into view, or because it
// was built once and then torn down again after scrolling out of view.
type LoadState = 'empty' | 'unloaded' | 'loading' | 'ready' | 'error'

export function Model3DViewer({ nodeKey, modelId, modelUrl, fileName, scale, animation, display }: Props) {
  const [editor] = useLexicalComposerContext()
  const { update } = useEditorUI()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [loadState, setLoadState] = useState<LoadState>(modelUrl ? 'unloaded' : 'empty')
  const [errorMsg, setErrorMsg] = useState('')
  const [isReadingFile, setIsReadingFile] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const rafRef = useRef<number>(0)
  const blockRef = useRef<HTMLDivElement>(null)

  // Three.js objects live only in refs — never serialized
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Object3D | null>(null)

  // Takes the container explicitly rather than reading `canvasRef.current`
  // internally: by the time React calls an effect's cleanup function
  // (including React StrictMode's dev-only simulated-unmount cleanup, which
  // runs even though the real DOM node is never actually removed), React
  // has already reset `canvasRef.current` to null to accurately mimic a
  // real unmount — so reading the ref here always sees null and silently
  // skips removing the old canvas. The container is still passed in
  // because the caller captured it as a plain variable at build time
  // (`const container = canvasRef.current`), which keeps pointing at the
  // real DOM node regardless of what the ref itself gets reset to.
  const disposeThreeJS = useCallback((container: HTMLDivElement | null) => {
    cancelAnimationFrame(rafRef.current)
    controlsRef.current?.dispose()
    if (modelRef.current) {
      modelRef.current.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh
          mesh.geometry?.dispose()
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose())
          } else {
            mesh.material?.dispose()
          }
        }
      })
    }
    rendererRef.current?.dispose()
    // Removes every child, not just the first — a defensive measure in
    // case more than one canvas ever ends up appended here for any reason.
    if (container) {
      while (container.firstChild) container.removeChild(container.firstChild)
    }
    rendererRef.current = null
    sceneRef.current = null
    cameraRef.current = null
    controlsRef.current = null
    modelRef.current = null
  }, [])

  // Lazy load-on-enter / unload-on-exit: the model's asset blob always
  // lives in IndexedDB (via assetStore.ts); the actual Three.js scene,
  // textures and GPU buffers are only built while this block is genuinely
  // on-screen, and fully torn down the moment it scrolls out of view —
  // not just paused. A document with many 3D blocks only ever holds the
  // currently-visible ones in memory/GPU, regardless of how many exist in
  // total. (An earlier version of this only paused the render loop while
  // off-screen but kept everything resident in memory forever once loaded
  // once — a lighter optimization, not this one.)
  useEffect(() => {
    if (!modelUrl || !canvasRef.current) return

    const container = canvasRef.current
    let isBuilt = false
    // Set by build() each time it runs; called by teardown() to cancel
    // whatever that specific build cycle still has outstanding (in-flight
    // load, observers, raf loops) before disposing the Three.js objects.
    let cancelBuild: (() => void) | null = null

    function teardown() {
      if (!isBuilt) return
      isBuilt = false
      cancelBuild?.()
      cancelBuild = null
      disposeThreeJS(container)
      setLoadState('unloaded')
    }

    function build() {
      if (isBuilt) return
      isBuilt = true
      setLoadState('loading')
      setErrorMsg('')

      const w = container.clientWidth || 400
      const h = display.height
      // Tracks the CSS-pixel width the renderer/camera were last sized
      // for, so later corrections (ResizeObserver, the one-time self-heal
      // below) can tell whether the container's real size actually
      // differs from it — renderer.domElement's own width is in device
      // pixels (CSS width × devicePixelRatio), not directly comparable to
      // clientWidth.
      let currentWidth = w
      let resizeCheckRaf = 0

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(w, h)
      renderer.shadowMap.enabled = true
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.4
      renderer.outputColorSpace = THREE.SRGBColorSpace
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer

      const scene = new THREE.Scene()
      // Always transparent so the model sits directly on the page — no box around it
      scene.background = null
      sceneRef.current = scene

      // Neutral environment map so PBR metallic materials reflect light correctly
      const pmrem = new THREE.PMREMGenerator(renderer)
      pmrem.compileEquirectangularShader()
      const neutralEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      scene.environment = neutralEnv
      pmrem.dispose()

      const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000)
      camera.position.set(0, 1, 3)
      cameraRef.current = camera

      // Lighting — multiple angles so metallic parts catch highlights
      scene.add(new THREE.AmbientLight(0xffffff, 1.5))
      const key = new THREE.DirectionalLight(0xffffff, 2.0)
      key.position.set(5, 10, 7)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.8)
      fill.position.set(-5, 2, -4)
      scene.add(fill)
      const rim = new THREE.DirectionalLight(0xffffff, 0.5)
      rim.position.set(0, -5, -8)
      scene.add(rim)

      // Orbit controls
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.07
      controls.autoRotate = animation.autoRotate
      controls.autoRotateSpeed = animation.rotationSpeed
      controlsRef.current = controls

      // Load model — with Draco support for compressed GLBs
      const dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('/draco/')
      const loader = new GLTFLoader()
      loader.setDRACOLoader(dracoLoader)

      let cancelled = false
      let objectUrlToRevoke: string | null = null

      // Persist the user's orbit/zoom/pan framing so it survives this block
      // tearing down and rebuilding (on scroll-out/scroll-in, or a later
      // reopen of the document) instead of resetting to the auto-fit camera
      // every time. Debounced — OrbitControls fires 'change' on every frame
      // of a drag/zoom/pan gesture, and writing to the Lexical node that
      // often would be both wasteful and visibly laggy — and flushed
      // immediately on teardown so a gesture that's still "settling" right as
      // the block scrolls out of view isn't lost.
      let pendingCamera: Model3DCamera | null = null
      let saveTimer: ReturnType<typeof setTimeout> | null = null
      function flushCameraSave() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
        if (!pendingCamera) return
        const cam = pendingCamera
        pendingCamera = null
        editor.update(() => {
          $getModel3DNodeByKey(nodeKey)?.setCamera(cam)
        })
      }
      function scheduleCameraSave() {
        pendingCamera = {
          pos: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
        }
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(flushCameraSave, 500)
      }

      // `modelUrl` is either a real URL (legacy documents: a `data:` URI
      // saved before this storage change) or an `idb-asset:<id>` reference
      // — resolve the latter to a Blob from IndexedDB and hand the loader
      // a short-lived object URL instead. The blob itself is only ever
      // read here, at build time — it's never kept resident beyond this
      // short-lived object URL.
      async function resolveLoadUrl(): Promise<string> {
        if (!isAssetUrl(modelUrl)) return modelUrl
        const blob = await getAsset(assetIdFromUrl(modelUrl))
        if (!blob) throw new Error('Model file not found in local storage — it may have been cleared.')
        const url = URL.createObjectURL(blob)
        objectUrlToRevoke = url
        return url
      }

      function onLoaded(gltf: { scene: THREE.Object3D }) {
        if (cancelled) return
        const model = gltf.scene
        modelRef.current = model

        // Sharpen textures — GLTFLoader leaves anisotropy at 1, which blurs
        // surfaces viewed at an angle
        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
        model.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            materials.forEach(mat => {
              for (const texKey of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
                const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[texKey]
                if (tex) tex.anisotropy = maxAnisotropy
              }
            })
          }
        })

        // Auto-fit
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const fitScale = (2 / maxDim) * scale
        model.scale.setScalar(fitScale)

        const center = box.getCenter(new THREE.Vector3())
        model.position.sub(center.multiplyScalar(fitScale))

        scene.add(model)

        // Restore the user's last framing for this block if there is one,
        // otherwise fall back to the auto-fit default.
        let savedCamera: Model3DCamera | undefined
        editor.read(() => {
          savedCamera = $getModel3DNodeByKey(nodeKey)?.getCamera()
        })
        if (savedCamera) {
          camera.position.set(...savedCamera.pos)
          controls.target.set(...savedCamera.target)
        } else {
          camera.position.set(0, size.y * fitScale * 0.5, maxDim * fitScale * 2)
          controls.target.set(0, 0, 0)
        }
        controls.update()
        // Listen only from here on — applying the framing above via
        // controls.update() also fires 'change', and saving straight back
        // the value just applied would be a pointless no-op write.
        controls.addEventListener('change', scheduleCameraSave)

        setLoadState('ready')

        // `setLoadState('ready')` only *schedules* the React re-render.
        // Reading layout synchronously right here could still see a stale
        // size from before this build's first real layout pass, so this
        // correction is deferred one frame (by which point the browser has
        // painted the committed change).
        resizeCheckRaf = requestAnimationFrame(() => {
          const nw = container.clientWidth
          if (nw > 0 && nw !== currentWidth) {
            currentWidth = nw
            renderer.setSize(nw, h)
            camera.aspect = nw / h
            camera.updateProjectionMatrix()
          }
        })

        // Animate. No visibility check needed here any more — by
        // construction, `build()` only ever runs while this block is
        // visible, and `teardown()` (which cancels this raf loop via
        // disposeThreeJS) runs the moment it stops being visible.
        const tick = () => {
          rafRef.current = requestAnimationFrame(tick)
          controls.update()
          renderer.render(scene, camera)
        }
        tick()
      }

      function onLoadError(err: unknown) {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load model')
        setLoadState('error')
      }

      resolveLoadUrl()
        .then((url) => {
          if (cancelled) return
          loader.load(url, onLoaded, undefined, onLoadError)
        })
        .catch(onLoadError)

      // Responsive resize
      const ro = new ResizeObserver(() => {
        const nw = container.clientWidth
        if (nw === 0 || nw === currentWidth) return
        currentWidth = nw
        renderer.setSize(nw, h)
        camera.aspect = nw / h
        camera.updateProjectionMatrix()
      })
      ro.observe(container)

      // Double-click a point on the model to dolly the camera in toward it,
      // like a "focus here" zoom (Sketchfab/CAD-viewer style) rather than the
      // generic scroll-to-zoom OrbitControls already provides.
      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      let dollyRaf = 0
      function onDblClick(e: MouseEvent) {
        const model = modelRef.current
        if (!model) return
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hits = raycaster.intersectObject(model, true)
        if (hits.length === 0) return

        const point = hits[0].point
        const fromCamera = camera.position.clone().sub(point)
        const fromTarget = controls.target.clone().sub(point)
        const startCamPos = camera.position.clone()
        const startTarget = controls.target.clone()
        // Halve the distance each double-click, but never closer than this —
        // otherwise clicking repeatedly can dolly the camera inside the mesh.
        const minDist = 0.15
        const newCamPos = fromCamera.length() * 0.5 > minDist
          ? point.clone().add(fromCamera.multiplyScalar(0.5))
          : point.clone().add(fromCamera.normalize().multiplyScalar(minDist))
        const newTarget = point.clone().add(fromTarget.multiplyScalar(0.5))

        cancelAnimationFrame(dollyRaf)
        const duration = 350
        const start = performance.now()
        const ease = (t: number) => 1 - Math.pow(1 - t, 3)
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const k = ease(t)
          camera.position.lerpVectors(startCamPos, newCamPos, k)
          controls.target.lerpVectors(startTarget, newTarget, k)
          controls.update()
          if (t < 1) dollyRaf = requestAnimationFrame(step)
        }
        dollyRaf = requestAnimationFrame(step)
      }
      renderer.domElement.addEventListener('dblclick', onDblClick)

      cancelBuild = () => {
        cancelled = true
        flushCameraSave()
        controls.removeEventListener('change', scheduleCameraSave)
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke)
        ro.disconnect()
        if (resizeCheckRaf) cancelAnimationFrame(resizeCheckRaf)
        cancelAnimationFrame(dollyRaf)
        renderer.domElement.removeEventListener('dblclick', onDblClick)
        dracoLoader.dispose()
      }
    }

    // rootMargin starts loading a little before the block is fully in view
    // (and tears down a beat after it fully leaves) rather than popping
    // in/out exactly at the viewport edge.
    const visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) build()
        else teardown()
      }
    }, { rootMargin: '200px 0px' })
    visibilityObserver.observe(container)

    return () => {
      visibilityObserver.disconnect()
      teardown()
    }
  }, [modelUrl, scale, animation.autoRotate, animation.rotationSpeed, display.height, disposeThreeJS])

  // Deactivate canvas when user clicks outside it
  useEffect(() => {
    if (!isActive) return
    function onPointerDown(e: PointerEvent) {
      if (!blockRef.current?.contains(e.target as Node)) {
        setIsActive(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isActive])

  function triggerUpload(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    // Create input outside contentEditable so Chrome treats the click as a trusted gesture
    const tmpInput = document.createElement('input')
    tmpInput.type = 'file'
    tmpInput.accept = '.glb,.gltf'
    tmpInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;'
    document.body.appendChild(tmpInput)
    tmpInput.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0]
      document.body.removeChild(tmpInput)
      if (!file) return
      loadFile(file)
    }
    tmpInput.click()
  }

  function loadFile(file: File) {
    setIsReadingFile(true)
    // Stored in IndexedDB keyed by the node's own stable modelId, not as a
    // base64 data: URI inside the Lexical document JSON — a multi-MB model
    // re-serialized into that JSON on every autosave tick is what used to
    // risk blowing the localStorage quota (silently, per-origin ~5-10MB).
    // Using modelId as the key also means replacing a model on the same
    // block naturally overwrites its old blob instead of leaking it.
    saveAsset(modelId, file)
      .then(() => {
        setIsReadingFile(false)
        editor.update(() => {
          const node = $getModel3DNodeByKey(nodeKey)
          node?.setModel(assetUrlFor(modelId), file.name)
        })
      })
      .catch((err: unknown) => {
        setIsReadingFile(false)
        setErrorMsg(err instanceof Error ? err.message : 'Could not save model')
        setLoadState('error')
      })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    loadFile(file)
  }

  function openProperties() {
    update({
      activeModel3d: { nodeKey, modelUrl, fileName, scale, animation, display },
    })
  }

  const heightStyle = { height: display.height }
  const fullwidth = display.mode === 'fullwidth'
  // Once a model is loaded and the user isn't actively interacting with it, drop
  // the card chrome (border/background/header/footer) so the model floats directly
  // on the page and can sit inline with surrounding text.
  const borderless = loadState === 'ready' && !isActive

  return (
    <div
      ref={blockRef}
      className={`model3d-block${fullwidth ? ' model3d-fullwidth' : ''}${borderless ? ' model3d-borderless' : ''}`}
      contentEditable={false}
    >
      {/* Header bar */}
      {!borderless && (
        <div className="model3d-bar">
          <span className="model3d-icon" aria-hidden="true">🧊</span>
          <span className="model3d-name">{fileName || '3D Model'}</span>
          <button
            type="button"
            className="model3d-props-btn"
            title="Open properties"
            onClick={openProperties}
          >
            ⚙
          </button>
        </div>
      )}

      {/* Canvas container — always mounted, for every loadState including
          'empty', so `canvasRef.current` is already set by the time the
          main effect re-runs right after an upload sets `modelUrl` for the
          first time. Conditionally mounting this (as an earlier version
          did) created a chicken-and-egg bug: the effect that depends on
          `modelUrl` also bailed out whenever `canvasRef.current` was null,
          which it always was at that exact transition if this container
          only rendered once `loadState` had already left 'empty' — a
          state nothing was ever going to change without that effect
          running first. */}
      <div style={{ position: 'relative' }}>
        <div
          ref={canvasRef}
          className="model3d-canvas"
          style={heightStyle}
        />

        {loadState === 'empty' && !isReadingFile && (
          <div className="model3d-empty model3d-state--overlay" style={heightStyle}>
            <p className="model3d-empty-text">Upload a .glb / .gltf file to display a 3D model.</p>
            <button type="button" className="model3d-upload-label" onClick={triggerUpload}>
              Choose file
            </button>
          </div>
        )}

        {loadState === 'empty' && isReadingFile && (
          <div className="model3d-state model3d-state--overlay" style={heightStyle}>
            <span className="model3d-spinner" aria-label="Reading file" />
            <span className="model3d-state-text">Reading file…</span>
          </div>
        )}

        {loadState === 'unloaded' && (
          <div className="model3d-state model3d-state--overlay" style={heightStyle}>
            <span className="model3d-state-text">Model will load when scrolled into view</span>
          </div>
        )}

        {loadState === 'loading' && (
          <div className="model3d-state model3d-state--overlay" style={heightStyle}>
            <span className="model3d-spinner" aria-label="Loading model" />
            <span className="model3d-state-text">Loading model…</span>
          </div>
        )}

        {loadState === 'error' && (
          <div className="model3d-state model3d-error model3d-state--overlay" style={heightStyle}>
            <span className="model3d-state-icon" aria-hidden="true">⚠</span>
            <span className="model3d-state-text">{errorMsg || 'Could not load model'}</span>
            <button type="button" className="model3d-upload-label model3d-upload-label--small" onClick={triggerUpload}>
              Replace
            </button>
          </div>
        )}

        {loadState === 'ready' && borderless && (
          <button
            type="button"
            className="model3d-props-btn model3d-props-btn--floating"
            title="Open properties"
            onClick={openProperties}
          >
            ⚙
          </button>
        )}
        {loadState === 'ready' && !isActive && (
          <div
            className="model3d-activate-overlay"
            style={heightStyle}
            onClick={() => setIsActive(true)}
          >
            <span className="model3d-activate-hint">Click to interact</span>
          </div>
        )}
      </div>

      {!borderless && loadState === 'ready' && (
        <div className="model3d-footer">
          <span className="model3d-hint">Drag to orbit · Scroll to zoom · Right-drag to pan</span>
        </div>
      )}
    </div>
  )
}
