/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          light: "#B8C5D6", // Light blue-gray for backgrounds
          DEFAULT: "#4B5563", // Default gray for text
          dark: "#374151", // Dark gray for headers
        },
        accent: {
          DEFAULT: "#EF4444", // Red for recording button
          hover: "#DC2626", // Darker red for hover states
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        control:
          "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      },
       aspectRatio: {
         'auto': 'auto',
         'square': '1 / 1',
         'video': '16 / 9',
         '1': '1',
         '2': '2',
         '3': '3',
         '4': '4',
         '5': '5',
         '6': '6',
         '7': '7',
         '8': '8',
         '9': '9',
         '10': '10',
         '11': '11',
         '12': '12',
         '13': '13',
         '14': '14',
         '15': '15',
         '16': '16',
      },
    },
  },
  plugins: [
    require('@tailwindcss/aspect-ratio'),
  ],
};
