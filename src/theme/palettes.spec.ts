// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { PALETTES, DEFAULT_PALETTE_ID, getPalette } from './palettes'
import { buildThemeOverrides, applyShellVars, mix, resolveTheme } from './index'
import { SHELL_DARK, getShellTokens } from './tokens'

const HEX = /^#[0-9a-fA-F]{6}$/

describe('palettes', () => {
  it('有 11 套色板且 id 唯一', () => {
    expect(PALETTES).toHaveLength(11)
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(11)
  })

  it('每套色板的亮暗主色都是合法十六进制', () => {
    for (const p of PALETTES) {
      for (const mode of ['light', 'dark'] as const) {
        expect(p[mode].primary).toMatch(HEX)
        expect(p[mode].container).toMatch(HEX)
        expect(p[mode].onPrimary).toMatch(HEX)
      }
    }
  })

  it('未知 id 回退到默认色板', () => {
    expect(getPalette('nope').id).toBe(DEFAULT_PALETTE_ID)
  })
})

describe('buildThemeOverrides', () => {
  it('每套色板在两种模式下都产出主色', () => {
    for (const p of PALETTES) {
      for (const dark of [false, true]) {
        const o = buildThemeOverrides(p, dark)
        expect(o.common?.primaryColor).toBe(p[dark ? 'dark' : 'light'].primary)
        expect(o.common?.borderRadius).toBeTruthy()
      }
    }
  })
})

describe('applyShellVars', () => {
  it('暗色写入暗色中性色', () => {
    applyShellVars(getPalette('teal'), true)
    expect(document.documentElement.style.getPropertyValue('--bg').trim())
      .toBe(SHELL_DARK.neutral.bg)
  })

  it('连续切换不残留上一个色板的主色', () => {
    applyShellVars(getPalette('teal'), false)
    applyShellVars(getPalette('ocean'), false)
    expect(document.documentElement.style.getPropertyValue('--primary').trim())
      .toBe(getPalette('ocean').light.primary)
  })
})

describe('tokens', () => {
  it('亮暗中性色不同', () => {
    expect(getShellTokens(false).neutral.bg).not.toBe(getShellTokens(true).neutral.bg)
  })
})

describe('mix', () => {
  it('按比例混合', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('resolveTheme', () => {
  it('system 跟随 matchMedia', () => {
    expect(resolveTheme({ theme: 'system' }).dark).toBe(
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    )
  })
  it('显式 dark/light 不受系统影响', () => {
    expect(resolveTheme({ theme: 'dark' }).dark).toBe(true)
    expect(resolveTheme({ theme: 'light' }).dark).toBe(false)
  })
})
