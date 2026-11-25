import type { Config } from "tailwindcss";

const config: Config = {
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
        paper: "#F8F7F4",
        ink: "#1C1B18",
        muted: "#6B685F",
        line: "#E6E4DD",
        accent: "#0F766E",
        "accent-dark": "#0D5C56",
        "accent-soft": "#EAF6F4",
      },
    },
  },
  plugins: [],
};

export default config;
