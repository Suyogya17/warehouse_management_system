export const TRANSPORT_DIRECTORY = [
  {
    name: "Danfe Logistic Company",
    phone: "9851060573",
    destinations: ["Narayanghat", "Hetauda", "Birgunj", "Kawasoti", "Butwal", "Bhairahawa"],
    aliases: ["danfe", "danfe logistic", "danfe logistics", "kawasti", "bhairawa", "birganj"],
  },
  {
    name: "Pawan Road Carriers",
    phone: "9851031412",
    destinations: [
      "Dharke",
      "Lahan",
      "Mirchaiya",
      "Kanchanpur",
      "Itahari",
      "Dharan",
      "Biratnagar",
      "Nijgadh",
    ],
    aliases: ["pawan", "pawan road carrier", "mirchiya", "nidgaj", "nijgarh"],
  },
  {
    name: "Gandaki Carriers",
    phone: "9801866731",
    destinations: ["Pokhara", "Aanbukhaireni", "Dumre", "Damauli"],
    aliases: ["gandhaki", "gandhaki carriers", "anbukhaireni"],
  },
  {
    name: "Bulbule Transport",
    phone: "9849837022",
    destinations: ["Kohalpur", "Surkhet", "Nepalgunj"],
    aliases: ["bulbule", "koholpur", "nepalganj"],
  },
  {
    name: "Jhapa Road Carriers",
    phone: "9851236819",
    destinations: [
      "Damak",
      "Birtamod",
      "Taplejung",
      "Urlabari",
      "Phidim",
      "Belbari",
      "Pathari",
      "Biratchowk",
      "Dhulabari",
    ],
    aliases: ["jhapa", "jhapa road carrier", "fidim"],
  },
  {
    name: "Kamalamai Darshan Transport",
    phone: "9851212479",
    destinations: [
      "Dhalkebar",
      "Bardibas",
      "Janakpur",
      "Hariban",
      "Lalbandhi",
      "Katari",
      "Gaighat",
      "Fatehpur",
      "Rampur",
    ],
    aliases: ["kamalamai", "kamalamai darshan", "fhatepur"],
  },
];

export const normalizeTransportSearch = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const findTransportByName = (value) => {
  const key = normalizeTransportSearch(value);
  if (!key) return null;
  return (
    TRANSPORT_DIRECTORY.find((transport) =>
      [transport.name, ...(transport.aliases || [])].some(
        (candidate) => normalizeTransportSearch(candidate) === key
      )
    ) || null
  );
};

export const transportServesAddress = (transport, address) => {
  const addressKey = normalizeTransportSearch(address);
  if (!addressKey) return false;
  return [...transport.destinations, ...(transport.aliases || [])].some((destination) => {
    const destinationKey = normalizeTransportSearch(destination);
    return destinationKey && addressKey.includes(destinationKey);
  });
};
