/* T3: a small kit on top of three.js (r128) for model-written 3D lessons.
 * The page describes WHAT is in the scene (parts, positions, names, layers); the kit does the rest:
 * lighting, drag-to-rotate, zoom buttons, click / hover picking, layer toggles, an info card, resizing,
 * pausing while off-screen. It is loaded in the frame together with THREE, so a page just calls T3.*.
 * Units are arbitrary; the camera fits the scene on its own. +y is up, +z faces the viewer. */
(function () {
  var T = THREE

  function mat(color, o) {
    o = o || {}
    var op = o.opacity != null ? o.opacity : 1
    return new T.MeshStandardMaterial({
      color: color, roughness: o.rough != null ? o.rough : 0.55, metalness: o.metal || 0,
      transparent: op < 1, opacity: op, emissive: o.glow || 0x000000, side: o.double ? T.DoubleSide : T.FrontSide,
      wireframe: !!o.wire, depthWrite: op >= 1,
    })
  }

  function place(m, o) {
    o = o || {}
    if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2])
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2])
    if (o.scale) typeof o.scale === 'number' ? m.scale.setScalar(o.scale) : m.scale.set(o.scale[0], o.scale[1], o.scale[2])
    m.userData = { name: o.name || '', info: o.info || '', layer: o.layer || '', shell: !!o.shell }
    if (o.layer && !o.name) m.userData.layer = o.layer
    return m
  }

  /** Any three.js geometry as a named, clickable part. o: name, info, layer, pos, rot, scale, opacity, shell, rough, metal, glow, double, wire. */
  function part(parent, geo, color, o) {
    var m = place(new T.Mesh(geo, mat(color, o)), o)
    m.userData.baseGlow = m.material.emissive.getHex()
    parent.add(m)
    return m
  }

  /** A rounded bar between two points (a limb, a bone, a pipe, a rod). r = radius at a, o.r2 = radius at b, o.knobs = end balls size. */
  function limb(parent, a, b, r, color, o) {
    o = o || {}
    var A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2])
    var dir = B.clone().sub(A), len = dir.length() || 0.001
    var r2 = o.r2 != null ? o.r2 : r
    var g = new T.Group()
    var m = part(g, new T.CylinderGeometry(r2, r, len, 20, 1), color, { name: o.name, info: o.info, layer: o.layer, opacity: o.opacity, rough: o.rough, shell: o.shell })
    m.position.copy(A.clone().add(B).multiplyScalar(0.5))
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize())
    var k = o.knobs || (o.joints ? 1 : 0)
    if (k) {
      var p1 = part(g, new T.SphereGeometry(r * k, 18, 14), color, { name: o.name, info: o.info, layer: o.layer, opacity: o.opacity, rough: o.rough, shell: o.shell }); p1.position.copy(A)
      var p2 = part(g, new T.SphereGeometry(r2 * k, 18, 14), color, { name: o.name, info: o.info, layer: o.layer, opacity: o.opacity, rough: o.rough, shell: o.shell }); p2.position.copy(B)
    }
    g.userData = { layer: o.layer || '' }
    parent.add(g)
    return g
  }

  /** A smooth tube along a path of [x,y,z] points (vessels, intestines, nerves, DNA strands, springs, rails). */
  function tube(parent, pts, r, color, o) {
    o = o || {}
    var curve = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]) }), !!o.closed)
    return part(parent, new T.TubeGeometry(curve, o.segments || Math.max(24, pts.length * 12), r, 12, !!o.closed), color, o)
  }

  /** An ellipsoid with optional lumpy surface: organs, rocks, fruit, cells. radii = [rx, ry, rz]; o.noise 0..0.3 */
  function blob(parent, radii, color, o) {
    o = o || {}
    var g = new T.SphereGeometry(1, 40, 28), p = g.attributes.position, n = o.noise || 0, s = o.seed || 1
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      var d = 1 + n * (Math.sin(x * 4.1 * s + y * 2.3) * Math.cos(z * 3.7 + y * 3.1 * s) + 0.5 * Math.sin((x + z) * 7.3))
      p.setXYZ(i, x * radii[0] * d, y * radii[1] * d, z * radii[2] * d)
    }
    g.computeVertexNormals()
    var oo = Object.assign({}, o); delete oo.scale
    return part(parent, g, color, oo)
  }

  /** A shape of revolution from a profile of [radius, height] points (vases, bottles, bones' shafts, cells, vases, towers). */
  function lathe(parent, profile, color, o) {
    o = Object.assign({ double: true }, o || {})
    return part(parent, new T.LatheGeometry(profile.map(function (p) { return new T.Vector2(p[0], p[1]) }), 48), color, o)
  }

  function group(parent, o) {
    var g = new T.Group()
    o = o || {}
    if (o.pos) g.position.set(o.pos[0], o.pos[1], o.pos[2])
    if (o.rot) g.rotation.set(o.rot[0], o.rot[1], o.rot[2])
    g.userData = { layer: o.layer || '' }
    parent.add(g)
    return g
  }

  function btn(label, title, on) {
    var b = document.createElement('button')
    b.type = 'button'; b.textContent = label; b.title = title || label
    b.style.cssText = 'font:600 12px system-ui,sans-serif;padding:5px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);cursor:pointer;color:#fff;background:' + (on ? 'rgba(110,98,200,.9)' : 'rgba(255,255,255,.1)')
    return b
  }

  function stage(el, opts) {
    opts = opts || {}
    el = typeof el === 'string' ? document.querySelector(el) : el
    var H = opts.height || 420
    el.style.cssText += ';position:relative;width:100%;height:' + H + 'px;overflow:hidden;border-radius:12px;touch-action:none;cursor:grab;' +
      'background:' + (opts.background || 'radial-gradient(ellipse at 50% 35%,#2a3350,#10141f)')
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'
    el.appendChild(renderer.domElement)
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(36, 1, 0.1, 500)
    scene.add(new T.HemisphereLight(0xffffff, 0x2b3350, 0.95))
    var key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(3, 6, 5); scene.add(key)
    var fill = new T.DirectionalLight(0x8aa4ff, 0.35); fill.position.set(-5, 2, -3); scene.add(fill)
    var pivot = new T.Group(), root = new T.Group()
    pivot.add(root); scene.add(pivot)

    var S = { scene: scene, camera: camera, renderer: renderer, root: root, el: el, selected: null, listeners: [] }
    var yaw = opts.yaw != null ? opts.yaw : 0.5, pitch = opts.pitch != null ? opts.pitch : 0.08
    var dist = 10, baseDist = 10, spin = opts.autoRotate !== false, dirty = true, visible = true, fitted = false
    var layers = {}

    function fit() {
      var box = new T.Box3().setFromObject(root)
      if (box.isEmpty()) return
      var c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3())
      root.position.sub(c)
      // A flat, wide scene (orbits, a city, a circuit board) is tipped toward the viewer so it isn't seen edge-on.
      if (opts.pitch == null && sz.y < Math.max(sz.x, sz.z) * 0.45) { pitch = 0.6; opts.pitch = 0.6 }
      var t = Math.tan((camera.fov * Math.PI) / 360)
      // Fit the height and the width (the toolbar and info card take some room), then step back by the depth.
      var w = Math.max(sz.x, sz.z) * (pitch > 0.4 ? 0.8 : 1)
      baseDist = dist = Math.max((sz.y / 2) / t * 1.15, (w / 2) / (t * camera.aspect) * 1.1) + (pitch > 0.4 ? 0 : sz.z / 2)
      fitted = true; dirty = true
    }
    function size() {
      var w = el.clientWidth || 600
      renderer.setSize(w, H, false); camera.aspect = w / H; camera.updateProjectionMatrix(); dirty = true
    }
    function frame() {
      requestAnimationFrame(frame)
      if (!visible || document.hidden) return
      if (!fitted) fit()
      if (spin) { yaw += 0.006; dirty = true }
      if (!dirty) return
      dirty = false
      pivot.rotation.set(pitch, yaw, 0)
      camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
    }

    // ---- picking
    var ray = new T.Raycaster(), ndc = new T.Vector2()
    function chainVisible(o) { for (; o; o = o.parent) if (!o.visible) return false; return true }
    function pickAt(ev) {
      var r = renderer.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      var hits = ray.intersectObject(root, true).filter(function (h) { return h.object.userData.name && chainVisible(h.object) })
      var solid = hits.filter(function (h) { return !h.object.userData.shell })
      return (solid[0] || hits[0] || {}).object || null
    }
    function paint(m, on) { if (m && m.material && m.material.emissive) m.material.emissive.setHex(on ? 0x2a3f8f : (m.userData.baseGlow || 0)) }
    function sameName(m, f) { root.traverse(function (o) { if (o.isMesh && o.userData.name === m.userData.name) f(o) }) }
    var hovered = null
    function hover(m) {
      if (m === hovered) return
      if (hovered && hovered !== S.selected) sameName(hovered, function (o) { paint(o, false) })
      hovered = m
      if (m && m !== S.selected) sameName(m, function (o) { paint(o, true) })
      el.style.cursor = m ? 'pointer' : 'grab'; dirty = true
    }
    S.select = function (m) {
      if (S.selected) sameName(S.selected, function (o) { paint(o, false) })
      S.selected = m || null
      if (m) sameName(m, function (o) { paint(o, true) })
      S.listeners.forEach(function (f) { f(m ? m.userData : null, m) })
      dirty = true
    }
    S.onSelect = function (f) { S.listeners.push(f) }

    // ---- pointer: drag rotates, click selects
    var down = null
    el.addEventListener('pointerdown', function (e) {
      if (e.target !== renderer.domElement) return
      down = { x: e.clientX, y: e.clientY, moved: 0 }; spin = false
      try { el.setPointerCapture(e.pointerId) } catch (x) {}
      el.style.cursor = 'grabbing'
    })
    el.addEventListener('pointermove', function (e) {
      if (down) {
        var dx = e.clientX - down.x, dy = e.clientY - down.y
        down.moved += Math.abs(dx) + Math.abs(dy); down.x = e.clientX; down.y = e.clientY
        yaw += dx * 0.008; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.006)); dirty = true
      } else if (e.target === renderer.domElement) hover(pickAt(e))
    })
    function up(e) {
      if (!down) return
      var wasClick = down.moved < 5; down = null; el.style.cursor = 'grab'
      if (wasClick) { var m = pickAt(e); S.select(m && m === S.selected ? null : m) }
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointerleave', function () { hover(null) })
    el.addEventListener('wheel', function (e) { if (e.ctrlKey) { e.preventDefault(); S.zoom(1 + e.deltaY * 0.01) } }, { passive: false })

    S.zoom = function (k) { dist = Math.max(baseDist * 0.35, Math.min(baseDist * 2.2, dist * k)); dirty = true }
    S.reset = function () { yaw = opts.yaw != null ? opts.yaw : 0.5; pitch = opts.pitch != null ? opts.pitch : 0.08; dist = baseDist; dirty = true }
    S.setLayer = function (name, on) {
      layers[name] = on
      root.traverse(function (o) { if (o.userData && o.userData.layer === name) o.visible = on })
      if (S.selected && !chainVisible(S.selected)) S.select(null)
      dirty = true
    }
    S.layerOn = function (name) { return layers[name] !== false }

    /** Toolbar (layer toggles, zoom, reset, spin) and an info card that shows the clicked part. */
    S.ui = function (cfg) {
      cfg = cfg || {}
      var bar = document.createElement('div')
      bar.style.cssText = 'position:absolute;left:10px;right:10px;top:10px;display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;pointer-events:none'
      var left = document.createElement('div'), right = document.createElement('div')
      ;[left, right].forEach(function (d) { d.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto' })
      ;(cfg.layers || []).forEach(function (l) {
        var on = l.on !== false, b = btn(l.label, 'Show or hide ' + l.label, on)
        S.setLayer(l.id, on)
        b.setAttribute('aria-pressed', String(on))
        b.onclick = function () { on = !on; S.setLayer(l.id, on); b.setAttribute('aria-pressed', String(on)); b.style.background = on ? 'rgba(110,98,200,.9)' : 'rgba(255,255,255,.1)' }
        left.appendChild(b)
      })
      var plus = btn('+', 'Zoom in'), minus = btn('−', 'Zoom out'), rst = btn('Reset', 'Reset view'), sp = btn('Spin', 'Auto-rotate', spin)
      plus.onclick = function () { S.zoom(0.85) }; minus.onclick = function () { S.zoom(1.18) }
      rst.onclick = function () { S.reset() }
      sp.onclick = function () { spin = !spin; sp.style.background = spin ? 'rgba(110,98,200,.9)' : 'rgba(255,255,255,.1)'; dirty = true }
      ;[plus, minus, rst, sp].forEach(function (b) { right.appendChild(b) })
      bar.appendChild(left); bar.appendChild(right); el.appendChild(bar)

      var card = document.createElement('div')
      card.style.cssText = 'position:absolute;left:10px;right:10px;bottom:10px;padding:10px 14px;border-radius:10px;background:rgba(10,14,24,.78);color:#fff;font:13px/1.45 system-ui,sans-serif;pointer-events:none;backdrop-filter:blur(6px)'
      var hint = cfg.hint || 'Drag to rotate. Click a part to learn about it.'
      card.textContent = hint
      S.onSelect(function (d) {
        card.textContent = ''
        if (!d) { card.textContent = hint; return }
        var t = document.createElement('strong'); t.textContent = d.name; t.style.cssText = 'font-size:14px;display:block'
        var p = document.createElement('span'); p.textContent = d.info || ''; p.style.opacity = '.85'
        card.appendChild(t); card.appendChild(p)
      })
      el.appendChild(card)
      return S
    }

    new ResizeObserver(size).observe(el); size()
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; dirty = true }).observe(el)
    addEventListener('pagehide', function () { try { renderer.dispose(); renderer.forceContextLoss() } catch (x) {} })
    frame()
    return S
  }

  window.T3 = { stage: stage, part: part, limb: limb, tube: tube, blob: blob, lathe: lathe, group: group, mat: mat }
})()
