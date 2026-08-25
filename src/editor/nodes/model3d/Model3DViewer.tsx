import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEditorUI } from '../../context/EditorUIContext'
import { $getModel3DNodeByKey } from './Model3DNode'
import type { Model3DAnimationConfig, Model3DDisplayConfig } from './Model3DNode'
import type { NodeKey } from 'lexical'

interface Props {
  nodeKey: NodeKey
  modelUrl: string
  fileName: string
  scale: number
  animation: Model3DAnimationConfig
  display: Model3DDisplayConfig
}

type LoadState = 'empty' | 'loading' | 'ready' | 'error'

export function Model3DViewer({ nodeKey, modelUrl, fileName, scale, animation, display }: Props) {
  const [editor] = useLexicalComposerContext()
  const { update } = useEditorUI()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [loadState, setLoadState] = useState<LoadState>(modelUrl ? 'loading' : 'empty')
  const [errorMsg, setErrorMsg] = useState('')
  const [isActive, setIsActive] = useState(false)
  const rafRef = useRef<number>(0)
  const blockRef = useRef<HTMLDivElement>(null)

  // Three.js objects live only in refs — never serialized
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Object3D | null>(null)

  const dispose = useCallback(() => {
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
    const el = canvasRef.current
    if (el && el.firstChild) el.removeChild(el.firstChild)
    rendererRef.current = null
    sceneRef.current = null
    cameraRef.current = null
    controlsRef.current = null
    modelRef.current = null
  }, [])

  useEffect(() => {
    if (!modelUrl || !canvasRef.current) return

    setLoadState('loading')
    setErrorMsg('')

    const container = canvasRef.current
    const w = container.clientWidth || 400
    const h = display.height

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
    scene.background = new THREE.Color(0x111111)
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
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene
        modelRef.current = model

        // Auto-fit
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const fitScale = (2 / maxDim) * scale
        model.scale.setScalar(fitScale)

        const center = box.getCenter(new THREE.Vector3())
        model.position.sub(center.multiplyScalar(fitScale))

        scene.add(model)

        // Fit camera
        camera.position.set(0, size.y * fitScale * 0.5, maxDim * fitScale * 2)
        controls.target.set(0, 0, 0)
        controls.update()

        setLoadState('ready')

        // Animate
        const tick = () => {
          rafRef.current = requestAnimationFrame(tick)
          controls.update()
          renderer.render(scene, camera)
        }
        tick()
      },
      undefined,
      (err) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load model')
        setLoadState('error')
      },
    )

    // Responsive resize
    const ro = new ResizeObserver(() => {
      const nw = container.clientWidth
      if (nw === 0) return
      renderer.setSize(nw, h)
      camera.aspect = nw / h
      camera.updateProjectionMatrix()
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      dracoLoader.dispose()
      dispose()
    }
  }, [modelUrl, scale, animation.autoRotate, animation.rotationSpeed, display.height]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const reader = new FileReader()
      reader.onload = () => {
        editor.update(() => {
          const node = $getModel3DNodeByKey(nodeKey)
          node?.setModel(reader.result as string, file.name)
        })
      }
      reader.readAsDataURL(file)
    }
    tmpInput.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      editor.update(() => {
        const node = $getModel3DNodeByKey(nodeKey)
        node?.setModel(reader.result as string, file.name)
      })
    }
    reader.readAsDataURL(file)
  }

  function openProperties() {
    update({
      activeModel3d: { nodeKey, modelUrl, fileName, scale, animation, display },
      rightTab: 'stem',
    })
  }

  const heightStyle = { height: display.height }
  const fullwidth = display.mode === 'fullwidth'

  return (
    <div
      ref={blockRef}
      className={`model3d-block${fullwidth ? ' model3d-fullwidth' : ''}`}
      contentEditable={false}
    >
      {/* Header bar */}
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

      {/* Viewport */}
      {loadState === 'empty' && (
        <div className="model3d-empty" style={heightStyle}>
          <p className="model3d-empty-text">Upload a .glb / .gltf file to display a 3D model.</p>
          <button type="button" className="model3d-upload-label" onClick={triggerUpload}>
            Choose file
          </button>
        </div>
      )}

      {loadState === 'loading' && (
        <div className="model3d-state" style={heightStyle}>
          <span className="model3d-spinner" aria-label="Loading model" />
          <span className="model3d-state-text">Loading model…</span>
        </div>
      )}

      {loadState === 'error' && (
        <div className="model3d-state model3d-error" style={heightStyle}>
          <span className="model3d-state-icon" aria-hidden="true">⚠</span>
          <span className="model3d-state-text">{errorMsg || 'Could not load model'}</span>
          <button type="button" className="model3d-upload-label model3d-upload-label--small" onClick={triggerUpload}>
            Replace
          </button>
        </div>
      )}

      {/* Canvas container — always mounted so the ref is stable; hidden when not ready */}
      <div style={{ position: 'relative', display: loadState === 'ready' ? 'block' : 'none' }}>
        <div
          ref={canvasRef}
          className="model3d-canvas"
          style={heightStyle}
        />
        {!isActive && (
          <div
            className="model3d-activate-overlay"
            style={heightStyle}
            onClick={() => setIsActive(true)}
          >
            <span className="model3d-activate-hint">Click to interact</span>
          </div>
        )}
      </div>

      {loadState === 'ready' && (
        <div className="model3d-footer">
          <span className="model3d-hint">Drag to orbit · Scroll to zoom · Right-drag to pan</span>
        </div>
      )}
    </div>
  )
}
