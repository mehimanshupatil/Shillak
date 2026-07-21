import { describe, expect, it } from 'vitest'
import { GROUP_COLORS, groupColor } from '../utils'

describe('groupColor', () => {
  it('returns a color from GROUP_COLORS for indices within range', () => {
    expect(groupColor(0)).toBe(GROUP_COLORS[0])
    expect(groupColor(GROUP_COLORS.length - 1)).toBe(GROUP_COLORS[GROUP_COLORS.length - 1])
  })

  it('wraps around via modulo for an index beyond the palette length', () => {
    expect(groupColor(GROUP_COLORS.length)).toBe(GROUP_COLORS[0])
    expect(groupColor(GROUP_COLORS.length + 2)).toBe(GROUP_COLORS[2])
  })
})
