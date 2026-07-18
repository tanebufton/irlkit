/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0e14",
        panel: "#141925",
        edge: "#232a3a",
        accent: "#5b8cff",
        live: "#ff4d4f",
        good: "#25c26e",
        warn: "#f0a020",
      },
    },
  },
  plugins: [],
};
