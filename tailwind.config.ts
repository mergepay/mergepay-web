import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Theme-aware surfaces: values come from CSS custom properties so the
        // `.dark` class on <html> (set by the pre-paint script in
        // src/app/layout.tsx) re-themes every component without per-file
        // `dark:` variants. See :root/.dark in src/app/globals.css.
        paper: "rgb(var(--mp-paper) / <alpha-value>)",
        cream: "rgb(var(--mp-cream) / <alpha-value>)",
        ink: "rgb(var(--mp-ink) / <alpha-value>)",
        // Constant dark chrome for elements that must stay dark in BOTH
        // themes (badges, secondary buttons, scrims, the QR scanner well).
        // `ink` flips to a light foreground in dark mode; these do not.
        surface: "#18130E",
        onSurface: "#F6EFDD",
        grape: {
          DEFAULT: "#6C4DF6",
          dark: "#4F33C8",
          light: "#A28BFF",
          pale: "rgb(var(--mp-grape-pale) / <alpha-value>)",
        },
        lime: {
          DEFAULT: "rgb(var(--mp-lime) / <alpha-value>)",
          dark: "#B5DB1F",
          pale: "rgb(var(--mp-lime-pale) / <alpha-value>)",
        },
        tangerine: {
          DEFAULT: "rgb(var(--mp-tangerine) / <alpha-value>)",
          dark: "#E66A14",
          pale: "rgb(var(--mp-tangerine-pale) / <alpha-value>)",
        },
        flamingo: {
          DEFAULT: "rgb(var(--mp-flamingo) / <alpha-value>)",
          pale: "rgb(var(--mp-flamingo-pale) / <alpha-value>)",
        },
        aqua: {
          DEFAULT: "rgb(var(--mp-aqua) / <alpha-value>)",
          pale: "rgb(var(--mp-aqua-pale) / <alpha-value>)",
        },
        butter: {
          DEFAULT: "rgb(var(--mp-butter) / <alpha-value>)",
          pale: "rgb(var(--mp-butter-pale) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Ink shadows follow the theme foreground so dark mode gets light
        // offset shadows instead of invisible black ones.
        brutal: "4px 4px 0 0 rgb(var(--mp-ink) / 1)",
        "brutal-sm": "2px 2px 0 0 rgb(var(--mp-ink) / 1)",
        "brutal-lg": "8px 8px 0 0 rgb(var(--mp-ink) / 1)",
        "brutal-xl": "12px 12px 0 0 rgb(var(--mp-ink) / 1)",
        "brutal-grape": "4px 4px 0 0 #6C4DF6",
        "brutal-lime": "4px 4px 0 0 #B5DB1F",
        none: "none",
      },
      borderWidth: {
        "3": "3px",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) rotate(-2deg)" },
          "50%": { transform: "translateY(-12px) rotate(2deg)" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
      },
      animation: {
        marquee: "marquee 28s linear infinite",
        "float-slow": "float-slow 6s ease-in-out infinite",
        "pop-in": "pop-in 0.25s ease-out both",
        wiggle: "wiggle 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
