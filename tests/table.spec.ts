import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('table optimization', () => {
  it('increases row padding', () => {
    expect(css).toContain('padding: 8px 10px')
  })
  it('adds selected row left indicator', () => {
    expect(css).toContain('inset 3px 0 0 var(--primary)')
  })
})
