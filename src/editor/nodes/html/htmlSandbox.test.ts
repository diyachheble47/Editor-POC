import { describe, test, expect } from 'vitest'
import { createEditor, $getRoot } from 'lexical'
import { HtmlNode } from './HtmlNode'
import { CSP, SANDBOX, buildSrcDoc, clampHeight, usesThree } from './htmlSandbox'

const vars = { '--c-text': '#fff' }

describe('three.js pages', () => {
  const page = '<html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script></head><body><script>new THREE.Scene()</script></body></html>'
  test('a page that uses THREE is recognised', () => {
    expect(usesThree(page)).toBe(true)
    expect(usesThree('<p>no 3d</p>')).toBe(false)
  })
  test('the library is inlined before the page script, the CDN tag is dropped, and the policy stays strict', () => {
    const doc = buildSrcDoc(page, vars, 'b1', 'window.THREE={Scene:function(){}};/*x</script>y*/')
    expect(doc).not.toContain('cdnjs.cloudflare.com')
    expect(doc).toContain('window.THREE=')
    expect(doc).not.toContain('x</script>y') // the library cannot close its own script tag
    expect(doc.indexOf('window.THREE=')).toBeLessThan(doc.indexOf('new THREE.Scene()'))
    expect(doc).toContain(`content="${CSP}"`)
  })
})

describe('buildSrcDoc', () => {
  test('the iframe is allowed scripts only, and the policy blocks the network', () => {
    expect(SANDBOX).toBe('allow-scripts') // never allow-same-origin: that would let the code reach the editor
    expect(CSP).toContain("default-src 'none'")
    expect(CSP).not.toMatch(/connect-src|https?:/)
    const doc = buildSrcDoc('<button>Hi</button>', vars, 'b1')
    expect(doc).toContain(`http-equiv="Content-Security-Policy" content="${CSP}"`)
    expect(doc).toContain('<button>Hi</button>')
    expect(doc).toContain('--c-text:#fff')
    expect(doc).toContain('"b1"') // its id, so messages can be matched to the block
  })

  test('a whole page keeps its own head and body, with the policy first inside <head>', () => {
    const doc = buildSrcDoc('<!doctype html><html><head><title>t</title></head><body><p>x</p></body></html>', vars, 'b1')
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<title>'))
    expect(doc.match(/<body/g)).toHaveLength(1)
    const noHead = buildSrcDoc('<html><body>y</body></html>', vars, 'b1')
    expect(noHead).toMatch(/<html><head>.*Content-Security-Policy.*<\/head><body>y<\/body>/s)
  })

  test('a block id cannot break out of the script it is written into', () => {
    const doc = buildSrcDoc('<p>x</p>', vars, '</script><script>alert(1)</script>')
    expect(doc).not.toContain('</script><script>alert(1)')
  })

  test('heights reported by the widget are kept within sensible bounds', () => {
    expect(clampHeight(5)).toBe(80)
    expect(clampHeight(300.2)).toBe(301)
    expect(clampHeight(99999)).toBe(900)
  })
})

describe('HtmlNode', () => {
  test('saves its code, title and a stable id, and gets an id if an old file has none', () => {
    const editor = createEditor({ nodes: [HtmlNode], onError: e => { throw e } })
    let json!: ReturnType<HtmlNode['exportJSON']>
    editor.update(() => {
      const node = new HtmlNode('<p>hi</p>', 'Demo')
      $getRoot().append(node)
      json = node.exportJSON()
    }, { discrete: true })
    expect(json).toMatchObject({ type: 'html', code: '<p>hi</p>', title: 'Demo' })
    expect(json.blockId).toBeTruthy()
    editor.update(() => {
      expect(HtmlNode.importJSON(json).exportJSON().blockId).toBe(json.blockId)
      expect(HtmlNode.importJSON({ ...json, blockId: '' }).exportJSON().blockId).toBeTruthy()
    }, { discrete: true })
  })
})
