/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accord: {
          blurple: '#5865F2',
          green: '#23A55A',
          yellow: '#FEE75C',
          fuchsia: '#EB459E',
          red: '#ED4245',
          dark: {
            100: '#404249',
            200: '#383A40',
            300: '#313338', // Main BG
            400: '#2B2D31', // Sidebars
            500: '#232428', // User panel
            600: '#1E1F22', // Input / Modals
            700: '#111214',
          },
          text: {
            normal: '#DBDEE1',
            muted: '#949BA4',
            link: '#00A8FC',
          },
          mention: {
            bg: 'rgba(250, 166, 26, 0.1)',
            border: '#faa61a',
          }
        }
      },
      animation: {
        'message-pop': 'messagePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'reaction-pop': 'reactionPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'badge-shake': 'badgeShake 0.5s ease-in-out',
      },
      keyframes: {
        messagePop: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(20px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        reactionPop: {
          '0%': { transform: 'scale(0)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        badgeShake: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-5deg)' },
          '75%': { transform: 'rotate(5deg)' },
        }
      }
    },
  },
  plugins: [],
}
