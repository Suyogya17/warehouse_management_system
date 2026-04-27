const paths = {
  dashboard: "M3 13.5h8V3H3zm10 7.5h8V10.5h-8zM3 21h8v-5.5H3zM13 8.5h8V3h-8z",
  materials: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zm8 0 8-4.5M12 7.5v13.5",
  finishedGoods: "M5 7h14l1 4v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8zm2 0V5a3 3 0 0 1 6 0v2",
  purchase: "M3 7h18M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 11h6m-3-3v6",
  consumption: "M7 4h10l1 4-6 12-6-12zM9 11h6",
  formulas: "M7 4h10M7 12h10M7 20h10M4 4h.01M4 12h.01M4 20h.01",
  production: "M4 16l4-4 3 3 7-7M4 7h6v6",
  users: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  logout: "M10 17l5-5-5-5M15 12H3m8-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4l10-10-4-4L4 16zm9-11 4 4",
  delete: "M6 7h12M9 7V5h6v2m-7 4v6m4-6v6M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  eyeOff: "M4 4l16 16M10.6 10.7a3 3 0 0 0 4 4M9.9 5.1A12.4 12.4 0 0 1 12 5c6.5 0 10 7 10 7a18.1 18.1 0 0 1-4.2 4.8M6.2 6.3A18 18 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 3.1-.4",
  check: "M5 13l4 4L19 7",
  warning: "M12 3l9 16H3zm0 5v4m0 4h.01",
  image: "M4 5h16v14H4zm0 10 4-4 3 3 4-5 5 6",
  box: "M4 7.5 12 3l8 4.5-8 4.5zm0 0V16.5L12 21l8-4.5v-9",
  color: "M12 3c-3 3.3-6 6.6-6 10a6 6 0 0 0 12 0c0-3.4-3-6.7-6-10z",
  size: "M7 7h10M7 17h10M7 7v10M17 7v10",
  stock: "M5 19h14M7 16V9m5 7V5m5 11v-4",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
};

export default function Icon({ name, className = "h-4 w-4", strokeWidth = 1.8 }) {
  const d = paths[name] || paths.spark;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
