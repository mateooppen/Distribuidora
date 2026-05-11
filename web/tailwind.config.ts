import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    screens: {
      // Breakpoint extra para mobile chico (≥480px). Útil para mostrar/ocultar
      // detalles secundarios (ej. "/sin-tacc" del logo) en pantallas muy chicas.
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['IBM Plex Sans', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /* Tokens semánticos propios — disponibles como clases Tailwind */
        'app-accent':    'hsl(var(--accent-color))',
        'state-vigente': 'hsl(var(--state-vigente))',
        'state-vencido': 'hsl(var(--state-vencido))',
        'state-revision':'hsl(var(--state-revision))',
        cat: {
          lacteos:     'hsl(var(--cat-lacteos))',
          panaderia:   'hsl(var(--cat-panaderia))',
          cereales:    'hsl(var(--cat-cereales))',
          chocolates:  'hsl(var(--cat-chocolates))',
          dulces:      'hsl(var(--cat-dulces))',
          bebidas:     'hsl(var(--cat-bebidas))',
          aceites:     'hsl(var(--cat-aceites))',
          carnes:      'hsl(var(--cat-carnes))',
          snacks:      'hsl(var(--cat-snacks))',
          helados:     'hsl(var(--cat-helados))',
          suplementos: 'hsl(var(--cat-suplementos))',
          otros:       'hsl(var(--cat-otros))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
