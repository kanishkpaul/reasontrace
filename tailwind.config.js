/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0A0E17',
          card: '#121826',
          border: '#1F293D',
          hover: '#29354E',
          text: '#F3F4F6',
          muted: '#9CA3AF',
          primary: '#3B82F6',
          accent: '#10B981',
          danger: '#EF4444',
          warning: '#F59E0B',
          purple: '#8B5CF6',
          cyan: '#06B6D4',
          pink: '#EC4899',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'cyber-glow': '0 0 15px rgba(59, 130, 246, 0.15)',
        'cyan-glow': '0 0 15px rgba(6, 182, 212, 0.25)',
        'purple-glow': '0 0 15px rgba(139, 92, 246, 0.25)',
        'emerald-glow': '0 0 15px rgba(16, 185, 129, 0.25)',
        'amber-glow': '0 0 15px rgba(245, 158, 11, 0.25)',
        'rose-glow': '0 0 15px rgba(239, 68, 68, 0.25)',
      }
    },
  },
  plugins: [],
}
