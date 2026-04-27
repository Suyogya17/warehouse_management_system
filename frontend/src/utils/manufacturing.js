export const materialBlueprints = [
  {
    name: "Upper",
    unit: "pcs",
    stage: "Cutting",
    notes: "Usually received inside cartons. One pair of shoes uses 2 upper pieces.",
  },
  {
    name: "Sole",
    unit: "pcs",
    stage: "Bottoming",
    notes: "Finished sole pieces. One pair of shoes uses 2 soles.",
  },
  {
    name: "Sole Powder",
    unit: "kg",
    stage: "Compounding",
    notes: "Measured in kg, but consumed in grams per pair such as 100gm or 200gm.",
  },
  {
    name: "Sole Foam",
    unit: "kg",
    stage: "Compounding",
    notes: "Measured in kg and consumed by weight per pair.",
  },
  {
    name: "Lace",
    unit: "pairs",
    stage: "Optional",
    notes: "Optional trim depending on the shoe style.",
  },
  {
    name: "TPR",
    unit: "pairs",
    stage: "Optional",
    notes: "Optional component depending on the shoe style.",
  },
  {
    name: "Inner Box",
    unit: "pcs",
    stage: "Packing",
    notes: "Each pair takes 1 inner box.",
  },
  {
    name: "Outer Box",
    unit: "pcs",
    stage: "Packing",
    notes: "30 inner boxes are packed into 1 outer box carton.",
  },
];

export const manufacturingFlowByRole = {
  ADMIN: [
    {
      title: "Register raw materials",
      route: "/raw-materials",
      description: "Create uppers, soles, powder, foam, packaging, and optional trims.",
      getProgress: ({ materialsCount }) => (materialsCount > 0 ? 100 : 20),
    },
    {
      title: "Receive purchased stock",
      route: "/receive-stock",
      description: "Record cartons, kg, pieces, and FIFO stock batches from suppliers.",
      getProgress: ({ materialsCount }) => (materialsCount > 0 ? 85 : 10),
    },
    {
      title: "Create finished good master",
      route: "/finished-goods",
      description: "Connect the upper code and sole code for each shoe style.",
      getProgress: ({ finishedGoodsCount }) => (finishedGoodsCount > 0 ? 100 : 15),
    },
    {
      title: "Define formula",
      route: "/formulas",
      description: "Set quantities such as 2 uppers, powder in grams, foam, and packing materials.",
      getProgress: ({ formulasCount }) => (formulasCount > 0 ? 100 : 25),
    },
    {
      title: "Run production",
      route: "/production",
      description: "Convert raw materials into finished pairs and track consumption.",
      getProgress: ({ productionCount }) => (productionCount > 0 ? 100 : 20),
    },
    {
      title: "Pack and review stock",
      route: "/finished-goods",
      description: "Check finished pairs, inner boxes, and outer box readiness.",
      getProgress: ({ productionCount, finishedGoodsCount }) =>
        productionCount > 0 && finishedGoodsCount > 0 ? 100 : 30,
    },
  ],
  STORE_KEEPER: [
    {
      title: "Check material stock",
      route: "/raw-materials",
      description: "Monitor uppers, soles, powder, foam, and packing stock.",
      getProgress: ({ materialsCount }) => (materialsCount > 0 ? 100 : 20),
    },
    {
      title: "Watch low stock",
      route: "/raw-materials",
      description: "Follow which materials are close to minimum quantity.",
      getProgress: ({ lowStockCount }) => (lowStockCount === 0 ? 100 : 60),
    },
    {
      title: "Check consumption",
      route: "/consumption",
      description: "Review usage, wastage, and manual deductions.",
      getProgress: ({ consumptionCount }) => (consumptionCount > 0 ? 100 : 35),
    },
  ],
  USER: [
    {
      title: "View finished pairs",
      route: "/finished-goods",
      description: "See the available finished-goods stock.",
      getProgress: ({ finishedGoodsCount }) => (finishedGoodsCount > 0 ? 100 : 25),
    },
  ],
};
