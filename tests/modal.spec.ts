import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('modal animation', () => {
  it('increases backdrop blur', () => {
    expect(css).toContain('blur(8px)')
  })
  it('uses larger shadow', () => {
    expect(css).toContain('--shadow-lg')
  })
})
