/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#8b1a1a",
          dark: "#211e1d",
          light: "#b78a54",
        },
      },
    },
  },
  plugins: [],
};
