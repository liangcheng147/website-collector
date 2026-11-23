export interface SemanticTokens {
  ok: string
  okText: string
  pending: string
  pendingText: string
  danger: string
  dangerText: string
  dangerBg: string
  dangerBorder: string
}

export interface NeutralTokens {
  bg: string
  panel: string
  text: string
  text2: string
  border: string
  border2: string
  hover: string
}

export interface ShellTokens {
  semantic: SemanticTokens
  neutral: NeutralTokens
}

export const SHELL_LIGHT: ShellTokens = {
  semantic: {
    ok: '#16A34A',
    okText: '#14833E',
    pending: '#D97706',
    pendingText: '#A8660A',
    danger: '#DC2626',
    dangerText: '#C02424',
    dangerBg: '#FDF1F1',
    dangerBorder: '#F2C9C9',
  },
  neutral: {
    bg: '#F6F9F8',
    panel: '#FFFFFF',
    text: '#0F2E2A',
    text2: '#5B7A76',
    border: '#D8EBE7',
    border2: '#C3DED9',
    hover: '#EEF5F3',
  },
}

export const SHELL_DARK: ShellTokens = {
  semantic: {
    ok: '#4ADE80',
    okText: '#5BE38C',
    pending: '#FBBF24',
    pendingText: '#FBC74A',
    danger: '#F87171',
    dangerText: '#F88383',
    dangerBg: '#2A1D1D',
    dangerBorder: '#4A2A2A',
  },
  neutral: {
    bg: '#0B1413',
    panel: '#12201E',
    text: '#E6F0EE',
    text2: '#93ADA8',
    border: '#1E3330',
    border2: '#294742',
    hover: '#162624',
  },
}

export function getShellTokens(dark: boolean): ShellTokens {
  return dark ? SHELL_DARK : SHELL_LIGHT
}
