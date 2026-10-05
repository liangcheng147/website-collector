import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('empty state', () => {
  it('uses gradient brand background', () => {
    expect(css).toMatch(/linear-gradient.*var\(--primary-t\)/)
  })
})
