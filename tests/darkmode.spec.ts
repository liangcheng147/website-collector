import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('dark mode', () => {
  it('primary button has glow in dark mode', () => {
    const darkBlock = css.substring(css.indexOf('html[data-theme="dark"]'))
    expect(darkBlock).toContain('box-shadow: 0 0 8px')
  })
})
