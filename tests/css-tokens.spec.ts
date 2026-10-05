import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('design tokens', () => {
  it('defines spacing scale (4px base)', () => {
    expect(css).toContain('--space-1: 4px')
    expect(css).toContain('--space-2: 8px')
    expect(css).toContain('--space-4: 16px')
    expect(css).toContain('--space-8: 32px')
  })
  it('defines radius scale', () => {
    expect(css).toContain('--radius-sm: 6px')
    expect(css).toContain('--radius-md: 10px')
    expect(css).toContain('--radius-lg: 14px')
    expect(css).toContain('--radius-full: 999px')
  })
  it('defines three-level shadows', () => {
    expect(css).toContain('--shadow-sm')
    expect(css).toContain('--shadow-md')
    expect(css).toContain('--shadow-lg')
  })
  it('defines transition durations', () => {
    expect(css).toContain('--duration-fast: 120ms')
    expect(css).toContain('--duration-normal: 180ms')
    expect(css).toContain('--duration-slow: 250ms')
  })
})
