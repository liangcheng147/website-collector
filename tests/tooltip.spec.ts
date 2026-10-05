import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('tooltip', () => {
  it('defines data-tooltip style', () => {
    expect(css).toContain('[data-tooltip]')
  })
})
