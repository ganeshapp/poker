/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "rgb(var(--c-ink-900) / <alpha-value>)",
          850: "rgb(var(--c-ink-850) / <alpha-value>)",
          800: "rgb(var(--c-ink-800) / <alpha-value>)",
          700: "rgb(var(--c-ink-700) / <alpha-value>)",
          600: "rgb(var(--c-ink-600) / <alpha-value>)",
          500: "rgb(var(--c-ink-500) / <alpha-value>)",
          400: "rgb(var(--c-ink-400) / <alpha-value>)",
          300: "rgb(var(--c-ink-300) / <alpha-value>)",
        },
        felt: {
          DEFAULT: "rgb(var(--c-felt) / <alpha-value>)",
          dark: "rgb(var(--c-felt-dark) / <alpha-value>)",
          light: "rgb(var(--c-felt-light) / <alpha-value>)",
          rail: "#2a1a10",
        },
        gold: {
          DEFAULT: "rgb(var(--c-gold) / <alpha-value>)",
          dark: "rgb(var(--c-gold-dark) / <alpha-value>)",
          light: "rgb(var(--c-gold-light) / <alpha-value>)",
        },
        chip: {
          red: "rgb(var(--c-chip-red) / <alpha-value>)",
          blue: "rgb(var(--c-chip-blue) / <alpha-value>)",
          green: "rgb(var(--c-chip-green) / <alpha-value>)",
          black: "rgb(var(--c-chip-black) / <alpha-value>)",
          purple: "rgb(var(--c-chip-purple) / <alpha-value>)",
        },
        suit: {
          red: "rgb(var(--c-suit-red) / <alpha-value>)",
          black: "rgb(var(--c-suit-black) / <alpha-value>)",
        },
        good: "rgb(var(--c-good) / <alpha-value>)",
        bad: "rgb(var(--c-bad) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        info: "rgb(var(--c-info) / <alpha-value>)",
        combo: {
          pair: "rgb(var(--c-combo-pair) / <alpha-value>)",
          suited: "rgb(var(--c-combo-suited) / <alpha-value>)",
          offsuit: "rgb(var(--c-combo-offsuit) / <alpha-value>)",
        },
      },
      textColor: {
        DEFAULT: "rgb(var(--c-text) / <alpha-value>)",
        muted: "rgb(var(--c-text-muted) / <alpha-value>)",
        faint: "rgb(var(--c-text-faint) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 2px 6px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
        pop: "0 18px 50px -12px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.4)",
        chip: "0 3px 6px rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(232,194,90,0.45), 0 0 26px -4px rgba(232,194,90,0.5)",
        table: "inset 0 0 120px rgba(0,0,0,0.55), 0 30px 70px -24px rgba(0,0,0,0.7)",
      },
      keyframes: {
        dealIn: {
          "0%": { transform: "translateY(-34px) rotate(-6deg) scale(0.85)", opacity: "0" },
          "100%": { transform: "translateY(0) rotate(0) scale(1)", opacity: "1" },
        },
        fadeUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pop: {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "60%": { transform: "scale(1.04)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slideInRight: {
          "0%": { transform: "translateX(110%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(232,194,90,0.55)" },
          "70%": { boxShadow: "0 0 0 13px rgba(232,194,90,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(232,194,90,0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "deal-in": "dealIn 0.34s cubic-bezier(0.2,0.8,0.2,1) both",
        "fade-up": "fadeUp 0.3s ease-out both",
        pop: "pop 0.25s ease-out both",
        "slide-in-right": "slideInRight 0.35s cubic-bezier(0.2,0.8,0.2,1) both",
        "pulse-ring": "pulseRing 1.7s ease-out infinite",
      },
    },
  },
  plugins: [],
};
