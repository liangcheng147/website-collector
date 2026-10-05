import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('scrollbar', () => {
  it('defines webkit scrollbar', () => {
    expect(css).toContain('::-webkit-scrollbar')
  })
  it('scrollbar width 6px', () => {
    expect(css).toContain('width: 6px')
  })
})
