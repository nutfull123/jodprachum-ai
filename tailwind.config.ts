import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "IBM Plex Sans Thai",
          "IBM Plex Sans",
          "Noto Sans Thai",
          "Thonburi",
          "Sukhumvit Set",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      colors: {
        paper: "var(--bg-paper)",
        surface: "var(--bg-card)",
        ink: "var(--text-ink)",
        muted: "var(--text-muted)",
        line: "var(--border-line)",
        accent: "#0F766E",
        "accent-dark": "#0D5C56",
        "accent-soft": "var(--accent-soft)",
      },
    },
  },
  plugins: [],
};

export default config;
