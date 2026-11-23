export type PaletteId =
  | 'teal'
  | 'ocean'
  | 'indigo'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'slate'
  | 'stone'
  | 'sky'
  | 'plum'

export interface PaletteColors {
  primary: string
  container: string
  onPrimary: string
}

export interface Palette {
  id: PaletteId
  name: string
  light: PaletteColors
  dark: PaletteColors
}

export const DEFAULT_PALETTE_ID: PaletteId = 'teal'

const LIGHT_ON_PRIMARY = '#FFFFFF'
const DARK_ON_PRIMARY = '#06201C'

export const PALETTES: readonly Palette[] = [
  {
    id: 'teal',
    name: '青绿',
    light: { primary: '#0D9488', container: '#CCFBF1', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#2DD4BF', container: '#10302C', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'ocean',
    name: '海洋',
    light: { primary: '#2563EB', container: '#DBEAFE', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#3B82F6', container: '#1E3A5F', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'indigo',
    name: '靛青',
    light: { primary: '#4F46E5', container: '#E0E7FF', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#6366F1', container: '#312E81', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'violet',
    name: '紫罗兰',
    light: { primary: '#7C3AED', container: '#EDE9FE', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#8B5CF6', container: '#4C1D95', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'rose',
    name: '玫瑰',
    light: { primary: '#E11D48', container: '#FFE4E6', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#F43F5E', container: '#4C1D33', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'amber',
    name: '琥珀',
    light: { primary: '#D97706', container: '#FEF3C7', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#F59E0B', container: '#4A3506', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'emerald',
    name: '翡翠',
    light: { primary: '#059669', container: '#D1FAE5', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#10B981', container: '#064E3B', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'slate',
    name: '石墨',
    light: { primary: '#475569', container: '#F1F5F9', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#64748B', container: '#1E293B', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'stone',
    name: '砂岩',
    light: { primary: '#57534E', container: '#F5F5F4', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#78716C', container: '#292524', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'sky',
    name: '天空',
    light: { primary: '#0284C7', container: '#E0F2FE', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#38BDF8', container: '#0C4A6E', onPrimary: DARK_ON_PRIMARY },
  },
  {
    id: 'plum',
    name: '梅紫',
    light: { primary: '#A21CAF', container: '#FAE8FF', onPrimary: LIGHT_ON_PRIMARY },
    dark: { primary: '#C026D3', container: '#3B0764', onPrimary: DARK_ON_PRIMARY },
  },
]

export function getPalette(id: string): Palette {
  const byId = PALETTES.find(p => p.id === id)
  if (byId) return byId
  return PALETTES.find(p => p.id === DEFAULT_PALETTE_ID) ?? PALETTES[0]
}
