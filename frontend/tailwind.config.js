/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        teal: {
          400: '#14b8a6',
          500: '#0d9488',
          600: '#0f766e',
        }
      }
    },
  },
  plugins: [],
}