import type { AiShape } from '../../storage/api'

// Excalidraw loads these elements as-is; only the fields it can't default are set here.
const LINE_HEIGHT = 25
const CHAR_WIDTH = 11

function element(type: string, x: number, y: number, w: number, h: number) {
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  }
}

function textElement(text: string, cx: number, cy: number, w: number, h: number) {
  const width = text.length * CHAR_WIDTH
  return {
    ...element('text', cx + (w - width) / 2, cy + (h - LINE_HEIGHT) / 2, width, LINE_HEIGHT),
    text,
    originalText: text,
    fontSize: 20,
    fontFamily: 1,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: null,
    lineHeight: 1.25,
    baseline: 18,
    autoResize: true,
  }
}

const SHAPE_TYPE: Record<Exclude<AiShape['kind'], 'arrow' | 'text'>, string> = {
  rect: 'rectangle',
  ellipse: 'ellipse',
  diamond: 'diamond',
}

export function drawingElements(shapes: AiShape[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const s of shapes) {
    if (s.kind === 'text') {
      out.push(textElement(s.text ?? '', s.x, s.y, s.w, s.h))
      continue
    }
    if (s.kind === 'arrow') {
      out.push({
        ...element('arrow', s.x, s.y, s.w, s.h),
        points: [[0, 0], [s.w, s.h]],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: 'arrow',
      })
    } else {
      out.push(element(SHAPE_TYPE[s.kind], s.x, s.y, s.w, s.h))
    }
    if (s.text) out.push(textElement(s.text, s.x, s.y, s.w, s.h))
  }
  return out
}
