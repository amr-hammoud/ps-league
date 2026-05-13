/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand magenta sampled from the NASA International Schools logo (#9D3689).
        // Shades generated around the primary so we can use a clean 50→900 ramp.
        brand: {
          50:  '#FBF0F8',
          100: '#F5DCED',
          200: '#ECB8DA',
          300: '#DD8CC0',
          400: '#C45DA4',
          500: '#9D3689', // PRIMARY
          600: '#832872',
          700: '#6A1F5C',
          800: '#511847',
          900: '#3A1133',
        },
        // Neutral ink ramp tuned to the dark gray (#4D4D4D) used in the NASA wordmark.
        ink: {
          50:  '#F7F7F8',
          100: '#EDEDEF',
          200: '#D8D9DC',
          300: '#B8B9BE',
          400: '#8C8D94',
          500: '#6A6B72',
          600: '#4D4D4D',
          700: '#3A3A3A',
          800: '#262626',
          900: '#141414',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20,20,20,0.04), 0 4px 16px rgba(20,20,20,0.06)',
        ring: '0 0 0 4px rgba(157, 54, 137, 0.12)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #9D3689 0%, #6A1F5C 100%)',
      },
    },
  },
  plugins: [],
};
