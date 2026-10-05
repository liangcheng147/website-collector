import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('sidebar grouping', () => {
  it('defines sidebar group card style', () => {
    expect(css).toContain('var(--panel)')
  })
  it('active item has left brand bar', () => {
    expect(css).toContain('inset 3px 0 0 var(--primary)')
  })
})
