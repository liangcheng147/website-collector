import type { GlobalThemeOverrides } from 'naive-ui'
import { DEFAULT_PALETTE_ID, getPalette, type Palette } from './palettes'
import { getShellTokens } from './tokens'

/** 逐通道线性插值，返回 6 位小写十六进制。 */
export function mix(hex: string, other: string, ratio: number): string {
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(other.slice(1), 16)
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * ratio)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`
}

export function buildThemeOverrides(
  p: Palette,
  dark: boolean,
): GlobalThemeOverrides {
  const c = p[dark ? 'dark' : 'light']
  return {
    common: {
      primaryColor: c.primary,
      // 暗色下 hover 向白色靠，亮色下向黑色靠
      primaryColorHover: mix(c.primary, dark ? '#FFFFFF' : '#000000', dark ? 0.12 : 0.10),
      primaryColorPressed: mix(c.primary, '#000000', 0.12),
      primaryColorSuppl: c.container,
      borderRadius: '8px',
      fontFamily:
        '"Geist Variable","Segoe UI",-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
      fontSizeMedium: '13px',
    },
    Button: {
      heightMedium: '36px',
      heightSmall: '30px',
      borderRadiusMedium: '8px',
    },
  }
}

export function applyShellVars(p: Palette, dark: boolean): void {
  if (typeof document === 'undefined') return
  const t = getShellTokens(dark)
  const c = p[dark ? 'dark' : 'light']
  const s = document.documentElement.style
  s.setProperty('--bg', t.neutral.bg)
  s.setProperty('--panel', t.neutral.panel)
  s.setProperty('--text', t.neutral.text)
  s.setProperty('--text-2', t.neutral.text2)
  s.setProperty('--border', t.neutral.border)
  s.setProperty('--border-2', t.neutral.border2)
  s.setProperty('--hover', t.neutral.hover)
  s.setProperty('--ok', t.semantic.ok)
  s.setProperty('--ok-txt', t.semantic.okText)
  s.setProperty('--pending', t.semantic.pending)
  s.setProperty('--pending-txt', t.semantic.pendingText)
  s.setProperty('--danger', t.semantic.danger)
  s.setProperty('--danger-txt', t.semantic.dangerText)
  s.setProperty('--danger-bg', t.semantic.dangerBg)
  s.setProperty('--danger-bd', t.semantic.dangerBorder)
  s.setProperty('--primary', c.primary)
  s.setProperty('--primary-t', c.container)
  s.setProperty('--on-primary', c.onPrimary)
  s.setProperty(
    '--primary-w',
    mix(c.primary, dark ? '#FFFFFF' : '#000000', dark ? 0.12 : 0.15),
  )
  const alpha = Math.round((dark ? 0.32 : 0.30) * 255)
    .toString(16)
    .padStart(2, '0')
  s.setProperty('--ring', `0 0 0 3px ${c.primary}${alpha}`)
}

export function resolveTheme(s: {
  theme: 'system' | 'light' | 'dark'
  palette?: string
}): { dark: boolean; palette: Palette } {
  const dark =
    s.theme === 'dark'
      ? true
      : s.theme === 'light'
        ? false
        : window.matchMedia('(prefers-color-scheme: dark)').matches
  return { dark, palette: getPalette(s.palette ?? DEFAULT_PALETTE_ID) }
}
