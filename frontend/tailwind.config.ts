import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Midas gold palette — warm, regal, high-contrast on near-black.
        gold: {
          50: "#fdf9ec",
          100: "#faf0cd",
          200: "#f4df9c",
          300: "#edc862",
          400: "#e7b13a",
          500: "#d4941b",
          600: "#bb7314",
          700: "#955314",
          800: "#7b4217",
          900: "#683817",
          950: "#3c1d09",
        },
        ink: {
          DEFAULT: "#0a0a0b",
          900: "#0a0a0b",
          800: "#121214",
          700: "#1a1a1e",
          600: "#242429",
          500: "#3a3a42",
        },
        // Warm off-white for body text on the dark theme.
        cream: "#f5ecd8",
      },
      fontFamily: {
        display: ['"Playfair Display"', "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(231,177,58,0.15), 0 8px 40px -8px rgba(231,177,58,0.25)",
        "gold-lg": "0 0 0 1px rgba(231,177,58,0.2), 0 20px 60px -12px rgba(231,177,58,0.35)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #f4df9c 0%, #e7b13a 45%, #bb7314 100%)",
        "gold-radial": "radial-gradient(ellipse at top, rgba(231,177,58,0.12), transparent 60%)",
        // Repeating sheen for the shimmering wordmark / gradient text.
        "gold-shine":
          "linear-gradient(110deg, #bb7314 0%, #e7b13a 25%, #faf0cd 50%, #e7b13a 75%, #bb7314 100%)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "pulse-gold": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        shimmer: "shimmer 3s linear infinite",
        float: "float 6s ease-in-out infinite",
        "pulse-gold": "pulse-gold 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
