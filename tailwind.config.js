import colors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'

// Paletas que cambian con el tema: cada tono es una variable CSS "r g b". En oscuro
// la escala se invierte (50↔950, 100↔900…), así `bg-slate-50` o `text-rose-700`
// siguen funcionando sin escribir `dark:` en cada componente.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

// Azul marino sobrio: transmite formalidad y confianza, sin el morado anterior.
const brand = {
  50: '241 245 251', 100: '224 233 246', 200: '196 213 238', 300: '150 177 224',
  400: '96 133 204', 500: '52 95 178', 600: '36 72 148', 700: '30 58 120',
  800: '27 49 98', 900: '24 40 78', 950: '15 24 50',
}
const PALETTES = { slate: colors.slate, rose: colors.rose, emerald: colors.emerald, amber: colors.amber, brand }

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`
}
const rgb = (v) => (v.startsWith('#') ? toRgb(v) : v)

const themed = Object.fromEntries(
  Object.keys(PALETTES).map((name) => [
    name,
    Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`])),
  ]),
)

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ...themed,
        brand: { ...themed.brand, DEFAULT: 'rgb(var(--brand-solid) / <alpha-value>)' },
        surface: 'rgb(var(--surface) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const vars = (invert) =>
        Object.fromEntries(
          Object.entries(PALETTES).flatMap(([name, scale]) =>
            SHADES.map((s, i) => [`--${name}-${s}`, rgb(scale[SHADES[invert ? SHADES.length - 1 - i : i]])]),
          ),
        )
      addBase({
        ':root': { ...vars(false), '--surface': '255 255 255', '--brand-solid': '30 64 140' },
        '.dark': { ...vars(true), '--surface': '20 27 42', '--brand-solid': '59 108 214' },
      })
    }),
  ],
}
