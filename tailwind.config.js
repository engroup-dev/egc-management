/** @type {import('tailwindcss').Config} */
module.exports = {
  // include all files under src so Tailwind can scan JSX/TSX files for class names
  content: [
    "./index.html",
    "./src/**/*.{html,js,ts,jsx,tsx}",
    "./src/**/**/*.{html,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Cairo", "sans-serif"],
        cairo: ["Cairo", "sans-serif"],
      },
      colors: {
        /* 🎨 Core Semantic Colors */
        primary: {
          DEFAULT: "#2563eb", // blue-600
          light: "#3b82f6", // blue-500
          superLight: "#dbeafe", // blue-100
          dark: "#1d4ed8", // blue-700
          foreground: "#ffffff", // text on primary
        },
        secondary: {
          DEFAULT: "#64748b", // slate-500
          light: "#94a3b8", // slate-400
          dark: "#475569", // slate-600
          foreground: "#ffffff", // text on secondary
        },
        accent: {
          DEFAULT: "#06b6d4", // cyan-500
          light: "#22d3ee", // cyan-400
          dark: "#0891b2", // cyan-700
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#f1f5f9", // slate-100
          dark: "#e2e8f0", // slate-200
          foreground: "#0f172a", // text on muted
        },
        background: "#f8fafc", // slate-50
        foreground: "#0f172a", // slate-900
        border: "#e2e8f0", // slate-200
        card: "#ffffff", // white

        /* ✅ State Colors */
        success: {
          DEFAULT: "#16a34a", // green-600
          light: "#22c55e", // green-500
          dark: "#15803d", // green-700
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#eab308", // yellow-500
          light: "#facc15", // yellow-400
          dark: "#ca8a04", // yellow-600
          foreground: "#000000",
        },
        error: {
          DEFAULT: "#dc2626", // red-600
          light: "#ef4444", // red-500
          dark: "#b91c1c", // red-700
          foreground: "#ffffff",
        },
        info: {
          DEFAULT: "#0ea5e9", // sky-500
          light: "#38bdf8", // sky-400
          dark: "#0284c7", // sky-600
          foreground: "#ffffff",
        },
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        ".scrollbar-hide": {
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
          "&::-webkit-scrollbar": {
            display: "none",
          },
        },
      });
    },
  ],
};
