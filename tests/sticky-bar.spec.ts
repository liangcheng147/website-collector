import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('sticky-bar', () => {
  it('sticks to left edge during horizontal scroll', () => {
    expect(css).toMatch(/\.sticky-bar\s*\{[^}]*left:\s*0/)
  })
})
