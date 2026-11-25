import { describe, it, expect } from 'vitest'
import { describeSource, matchSource, readSourceFile, rememberSource, validateSourceFile, MAX_SOURCE_CHARS } from './sourceFiles'

const file = (text: string, name = 'notes.txt') => new File([text], name, { type: 'text/plain' })
const LONG = 'Acids taste sour and turn blue litmus paper red. '.repeat(4)

describe('validateSourceFile', () => {
  it('accepts PDF, DOCX, TXT and MD', () => {
    for (const name of ['a.pdf', 'a.DOCX', 'a.txt', 'a.md']) expect(validateSourceFile({ name, size: 100 })).toBeNull()
  })
  it('refuses other types, empty files and files over 10 MB', () => {
    expect(validateSourceFile({ name: 'a.png', size: 100 })).toMatch(/PDF, DOCX, TXT or MD/)
    expect(validateSourceFile({ name: 'a.pdf', size: 0 })).toMatch(/empty/)
    expect(validateSourceFile({ name: 'big.pdf', size: 11 * 1024 * 1024 })).toMatch(/over 10 MB/)
  })
})

describe('readSourceFile', () => {
  it('reads a text file and keeps its text', async () => {
    const src = await readSourceFile(file(LONG))
    expect(src.name).toBe('notes.txt')
    expect(src.pages).toBeNull()
    expect(src.text).toContain('Acids taste sour')
    expect(src.truncated).toBe(false)
  })
  it('refuses a file with no readable text instead of sending nothing', async () => {
    await expect(readSourceFile(file('   \n  '))).rejects.toThrow(/No readable text/)
  })
  it('cuts a very long file and says so', async () => {
    const src = await readSourceFile(file('word '.repeat(MAX_SOURCE_CHARS)))
    expect(src.truncated).toBe(true)
    expect(src.text.length).toBe(MAX_SOURCE_CHARS)
  })
  it('refuses a damaged PDF with a readable message', async () => {
    await expect(readSourceFile(new File(['not a pdf'], 'bad.pdf'))).rejects.toThrow(/could not be read/)
  })
})

describe('known files', () => {
  it('finds a file by the start of the text and returns what follows as the instruction', async () => {
    rememberSource(await readSourceFile(file(LONG, 'Acids_Ch4.txt')))
    const found = matchSource('acids_ch4.txt, only chapter 2')
    expect(found?.source.name).toBe('Acids_Ch4.txt')
    expect(found?.rest).toBe('only chapter 2')
    expect(matchSource('other.txt')).toBeNull()
  })
  it('describes a file by pages, or by words when it has none', async () => {
    expect(describeSource({ id: '1', name: 'a.pdf', pages: 12, text: 'x', truncated: false })).toBe('12 pages')
    expect(describeSource({ id: '2', name: 'a.txt', pages: null, text: 'one two three', truncated: false })).toBe('3 words')
  })
})
