import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('button hierarchy', () => {
  it('defines btn-ghost class', () => {
    expect(css).toContain('.btn-ghost')
  })
  it('defines btn active scale feedback', () => {
    expect(css).toContain('scale(.97)')
  })
})
