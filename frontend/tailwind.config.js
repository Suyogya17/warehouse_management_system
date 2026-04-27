/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#11212d",
        slate: "#1d3b53",
        sand: "#f3efe6",
        gold: "#d2a24c",
        mint: "#a6d6b8",
        coral: "#e5866c",
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["Trebuchet MS", "sans-serif"],
      },
      boxShadow: {
        panel: "0 20px 60px rgba(17, 33, 45, 0.12)",
      },
    },
  },
  plugins: [],
};
