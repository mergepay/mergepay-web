import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF3E2",
        cream: "#FFF9EC",
        ink: "#18130E",
        grape: {
          DEFAULT: "#6C4DF6",
          dark: "#4F33C8",
          light: "#A28BFF",
          pale: "#E9E3FF",
        },
        lime: {
          DEFAULT: "#D7F94B",
          dark: "#B5DB1F",
          pale: "#F2FFC2",
        },
        tangerine: {
          DEFAULT: "#FF8A3C",
          dark: "#E66A14",
          pale: "#FFE5D1",
        },
        flamingo: {
          DEFAULT: "#FF5D8F",
          pale: "#FFDCE7",
        },
        aqua: {
          DEFAULT: "#3DD6C3",
          pale: "#D2F8F3",
        },
        butter: {
          DEFAULT: "#FFE45C",
          pale: "#FFF6CE",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        brutal: "4px 4px 0 0 #18130E",
        "brutal-sm": "2px 2px 0 0 #18130E",
        "brutal-lg": "8px 8px 0 0 #18130E",
        "brutal-xl": "12px 12px 0 0 #18130E",
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
