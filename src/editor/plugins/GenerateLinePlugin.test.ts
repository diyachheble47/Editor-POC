import { describe, expect, it } from 'vitest'
import { composeAgentPrompt, fileRequest, ghostFor, parse, setLooseAgent } from './GenerateLinePlugin'

describe('/generate line parsing', () => {
  it('finds nothing in free text or a half-typed type', () => {
    expect(parse('').choice).toBeNull()
    expect(parse('qu').choice).toBeNull()
    expect(parse('something else').choice).toBeNull()
  })

  it('knows a bare type has no topic yet', () => {
    expect(parse('quiz')).toMatchObject({ choice: { label: 'Quiz' }, topic: null })
    expect(parse('quiz ')).toMatchObject({ choice: { label: 'Quiz' }, topic: null })
  })

  it('reads the topic after "for"', () => {
    expect(parse('quiz for ')).toMatchObject({ choice: { label: 'Quiz' }, topic: '' })
    expect(parse('Circuit for series and parallel')).toMatchObject({ choice: { label: 'Circuit' }, topic: 'series and parallel' })
  })

  it('takes the longest type name', () => {
    expect(parse('chemical equation for combustion').choice?.label).toBe('Chemical equation')
  })
})

describe('/generate grey suggestions', () => {
  it('suggests " for" after a bare type', () => {
    expect(ghostFor('quiz', 0)).toMatchObject({ text: ' for', full: 'quiz for ' })
  })

  it('suggests variants and cycles through them', () => {
    expect(ghostFor('circuit for ', 0)).toMatchObject({ text: 'series', full: 'circuit for series', count: 3 })
    expect(ghostFor('circuit for ', 1)?.text).toBe('parallel')
    expect(ghostFor('circuit for pa', 0)).toMatchObject({ text: 'rallel', full: 'circuit for parallel' })
  })

  it('shows no hint when a type has no variants, and nothing once typing a topic', () => {
    expect(ghostFor('drawing for ', 0)).toBeNull()
    expect(ghostFor('drawing for the heart', 0)).toBeNull()
  })
})

describe('/agent line', () => {
  it('knows the three whole-document kinds', () => {
    expect(parse('lesson plan for photosynthesis', 'agent')).toMatchObject({ choice: { label: 'Lesson plan', kind: 'lesson_plan' }, topic: 'photosynthesis' })
    expect(parse('workbook', 'agent')).toMatchObject({ choice: { kind: 'workbook' }, topic: null })
    expect(parse('lesson builder for ', 'agent')).toMatchObject({ choice: { kind: 'lesson' }, topic: '' })
  })

  it('does not take block names for documents, or the other way round', () => {
    expect(parse('quiz for x', 'agent').choice).toBeNull()
    expect(parse('workbook for x', 'generate').choice).toBeNull()
  })

  it('suggests " for" after a bare document kind, and no hint after it', () => {
    expect(ghostFor('workbook', 0, 'agent')).toMatchObject({ text: ' for', full: 'workbook for ' })
    expect(ghostFor('lesson plan for ', 0, 'agent')).toBeNull()
  })
})

describe('/agent ... from a file', () => {
  it('offers "for" and "from a file" after an agent type, and Up/Down switches between them', () => {
    expect(ghostFor('workbook', 0, 'agent')).toMatchObject({ text: ' for', count: 2 })
    expect(ghostFor('workbook', 1, 'agent')).toMatchObject({ text: ' from a file', full: 'workbook from a file', count: 2 })
    expect(ghostFor('workbook ', 1, 'agent')).toMatchObject({ text: 'from a file' })
  })

  it('completes a half-typed "from a file", and offers only what the typing leads to', () => {
    expect(ghostFor('workbook fr', 0, 'agent')).toMatchObject({ text: 'om a file', count: 1 })
    expect(ghostFor('workbook from a', 0, 'agent')).toMatchObject({ text: ' file' })
    expect(ghostFor('workbook fo', 0, 'agent')).toMatchObject({ text: 'r ', full: 'workbook for ' })
    expect(ghostFor('workbook from a file', 0, 'agent')).toBeNull()
  })

  it('does not offer a file for /generate, which makes one block', () => {
    expect(ghostFor('quiz', 1, 'generate')).toMatchObject({ text: ' for', count: 1 })
  })

  it('reads what follows "from"', () => {
    expect(fileRequest('workbook from a file')).toMatchObject({ choice: { kind: 'workbook' }, from: 'a file' })
    expect(fileRequest('lesson plan from Notes.pdf, only chapter 2')).toMatchObject({ choice: { kind: 'lesson_plan' }, from: 'Notes.pdf, only chapter 2' })
    expect(fileRequest('workbook from')).toMatchObject({ from: '' })
    expect(fileRequest('workbook for fractions')).toBeNull()
    expect(fileRequest('workbook')).toBeNull()
  })
})

describe('/agent fill-in sentence', () => {
  it('needs only the topic', () => {
    expect(composeAgentPrompt('workbook', ['Photosynthesis', '', ''], '')).toBe('Photosynthesis')
  })
  it('adds the class, and the length for a lesson plan', () => {
    expect(composeAgentPrompt('workbook', ['Photosynthesis', 'Class 8'], '')).toBe('Photosynthesis for Class 8 students')
    expect(composeAgentPrompt('lesson_plan', ['Fractions', 'Class 5', '45 minutes'], '')).toBe('Fractions for Class 5 students, 45 minutes long')
  })
  it('keeps what was typed in the last box, trimmed', () => {
    expect(composeAgentPrompt('lesson', [' Light ', ' Class 7 '], '  with 3 experiments ')).toBe('Light for Class 7 students. with 3 experiments')
  })
})

describe('/agent "on the go" style', () => {
  const on = () => setLooseAgent(true)
  const off = () => setLooseAgent(false)

  it('takes what follows the type as the topic', () => {
    on()
    try {
      expect(parse('workbook circuits', 'agent')).toMatchObject({ choice: { label: 'Workbook' }, topic: 'circuits' })
      expect(parse('workbook for circuits', 'agent').topic).toBe('circuits')
      expect(parse('workbook ', 'agent').topic).toBeNull()
      expect(parse('workbook from a file', 'agent').topic).toBeNull()
    } finally { off() }
  })

  it('hints at a topic first, then suggests who it is for', () => {
    on()
    try {
      expect(ghostFor('workbook for ', 0, 'agent')).toMatchObject({ text: 'e.g. Photosynthesis', full: null })
      const g = ghostFor('workbook for circuits', 0, 'agent')
      expect(g?.text).toBe(' for Class 8 students')
      expect(g?.full).toBe('workbook for circuits for Class 8 students')
      // The class is the part to edit: underlined in the grey text, and selected after Tab.
      expect(g?.text.slice(...g!.blank!)).toBe('Class 8')
      expect(g?.full?.slice(...g!.select!)).toBe('Class 8')
      expect(ghostFor('workbook for circuits', 1, 'agent')?.text).toBe(' for Class 4 students')
      expect(ghostFor('workbook for circuits f', 0, 'agent')?.text).toBe('or Class 8 students')
      expect(ghostFor('workbook for circuits for Class 8 students', 0, 'agent')).toBeNull()
      expect(ghostFor('lesson plan for optics', 0, 'agent')?.text).toBe(' for Class 8 students, 45 minutes')
    } finally { off() }
  })

  it('leaves the blanks style as it was', () => {
    expect(parse('workbook circuits', 'agent').topic).toBeNull()
  })
})
