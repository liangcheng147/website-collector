import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('micro-interactions', () => {
  it('chip hover lift', () => {
    expect(css).toMatch(/\.chip:hover.*translateY/)
  })
  it('checkbox transition', () => {
    expect(css).toMatch(/\.cb.*transition/)
  })
})
