/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0b0f14",
          850: "#0e131a",
          800: "#11161d",
          700: "#161d26",
          600: "#1f2833",
          500: "#2a3542",
          400: "#3a4757",
          300: "#55657a",
        },
        felt: {
          DEFAULT: "#0e6b46",
          dark: "#093d2a",
          light: "#15935f",
          rail: "#2a1a10",
        },
        gold: {
          DEFAULT: "#e8c25a",
          dark: "#c79a36",
          light: "#f4dd92",
        },
        chip: {
          red: "#d23b3b",
          blue: "#2f6fd0",
          green: "#2faa66",
          black: "#20242b",
          purple: "#8a5cd1",
        },
        suit: {
          red: "#d83a3a",
          black: "#1b2230",
        },
        good: "#3fbf7f",
        bad: "#ec5a5a",
        warn: "#e8b54a",
        info: "#4f9be8",
        combo: {
          pair: "#b8442f",
          suited: "#2f8f5c",
          offsuit: "#2c3a4a",
        },
      },
      textColor: {
        DEFAULT: "#e9eef4",
        muted: "#9aa7b4",
        faint: "#6b7888",
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
