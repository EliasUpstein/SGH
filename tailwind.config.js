/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        sgh: {
          bg: '#0f172a',
          panel: '#1e293b',
          border: '#334155',
          accent: '#3b82f6'
        }
      }
    }
  },
  plugins: []
};
