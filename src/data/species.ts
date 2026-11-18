// Curated species facts. NAMI and discovery cards only ever show text from here.
// reviewStatus marks whether a human has re-checked the wording against sourceUrl
// before submission (see docs/QA.md). The ocean itself is stylized.

export type Species = {
  id: string;
  name: string;
  scientificName: string;
  habitat: string;
  shortFact: string;
  extendedFact: string;
  sourceUrl: string;
  sourceName: string;
  assetId: string;
  discoveryTrigger: string;
  reviewStatus: 'needs-human-check' | 'checked';
};

export const SPECIES: Species[] = [
  {
    id: 'blue-green-chromis', name: 'Blue-green chromis', scientificName: 'Chromis viridis',
    habitat: 'Shallow Indo-Pacific coral reefs and lagoons',
    shortFact: 'These small damselfish hover in schools above branching coral and dive into it for shelter when threatened.',
    extendedFact: 'They pick zooplankton from the water column. Schooling helps them spot danger and confuse predators.',
    sourceUrl: 'https://www.fishbase.se/summary/Chromis-viridis.html', sourceName: 'FishBase',
    assetId: 'fish-school', discoveryTrigger: 'Point at the school and pinch', reviewStatus: 'needs-human-check',
  },
  {
    id: 'green-sea-turtle', name: 'Green sea turtle', scientificName: 'Chelonia mydas',
    habitat: 'Tropical and subtropical coasts worldwide',
    shortFact: 'Adults mostly graze on seagrass and algae — their name comes from the greenish colour of their fat, not their shell.',
    extendedFact: 'Females migrate long distances to nest, often returning to the region where they hatched.',
    sourceUrl: 'https://www.fisheries.noaa.gov/species/green-turtle', sourceName: 'NOAA Fisheries',
    assetId: 'turtle', discoveryTrigger: 'Pinch the turtle during its sunlit pass', reviewStatus: 'needs-human-check',
  },
  {
    id: 'grey-reef-shark', name: 'Grey reef shark', scientificName: 'Carcharhinus amblyrhynchos',
    habitat: 'Indo-Pacific reef edges and drop-offs',
    shortFact: 'Look for the dark band along its tail fin. Like other sharks, it can sense the faint electric fields of nearby prey.',
    extendedFact: 'Electroreceptors called ampullae of Lorenzini sit in pores around the snout. Sharks are important predators that help keep reef food webs in balance.',
    sourceUrl: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/carcharhinus-amblyrhynchos/', sourceName: 'Florida Museum',
    assetId: 'shark', discoveryTrigger: 'Pinch the shark while it investigates', reviewStatus: 'needs-human-check',
  },
  {
    id: 'moon-jelly', name: 'Moon jelly', scientificName: 'Aurelia aurita',
    habitat: 'Coastal and open waters worldwide',
    shortFact: 'Moon jellies have no brain, heart or bones. The four rings you can see through the bell are their reproductive organs.',
    extendedFact: 'They pulse their bell to swim but mostly drift with currents, catching plankton on mucus-covered surfaces.',
    sourceUrl: 'https://www.montereybayaquarium.org/animals/animals-a-to-z/moon-jelly', sourceName: 'Monterey Bay Aquarium',
    assetId: 'jelly', discoveryTrigger: 'Pinch a drifting jelly in the twilight', reviewStatus: 'needs-human-check',
  },
  {
    id: 'anglerfish', name: 'Deep-sea anglerfish', scientificName: 'Melanocetus johnsonii',
    habitat: 'Deep open ocean, far below sunlight',
    shortFact: 'Females dangle a glowing lure lit by bioluminescent bacteria to draw prey toward their mouth in the dark.',
    extendedFact: 'Most light in the deep sea is made by animals themselves. Bioluminescence is used to hunt, hide and communicate.',
    sourceUrl: 'https://oceanexplorer.noaa.gov/facts/bioluminescence.html', sourceName: 'NOAA Ocean Exploration',
    assetId: 'anglerfish', discoveryTrigger: 'Pinch the glowing lure at midnight', reviewStatus: 'needs-human-check',
  },
  {
    id: 'giant-squid', name: 'Giant squid', scientificName: 'Architeuthis dux',
    habitat: 'Deep ocean worldwide; rarely seen alive',
    shortFact: 'Giant squid have some of the largest eyes in the animal kingdom — as wide as a dinner plate — to catch faint light in the deep.',
    extendedFact: 'They were first filmed alive in their natural habitat in 2012. This reveal is stylized: real squid do not answer a pulse of light.',
    sourceUrl: 'https://ocean.si.edu/ocean-life/invertebrates/giant-squid', sourceName: 'Smithsonian Ocean',
    assetId: 'giant-squid', discoveryTrigger: 'Send a light pulse at midnight, then pinch what emerges', reviewStatus: 'needs-human-check',
  },
];

export function speciesById(id: string) { return SPECIES.find(s => s.id === id); }
