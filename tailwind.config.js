module.exports = {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          pink: {
            500: '#ec4899'
          }
        }
      }
    },
    plugins: [
      require('@tailwindcss/typography')
    ]
  };