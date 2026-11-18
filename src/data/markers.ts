// Dive markers: places to swim to in each depth zone. Reaching one opens a card
// about the real ocean at that depth. Text is curated here only (like species.ts);
// positions are in the ocean's travel frame (metres, viewer starts near 0,0).

export type MarkerBand = 'sunlit' | 'openBlue' | 'twilight' | 'midnight';

export type DiveMarker = {
  id: string;
  band: MarkerBand;
  /** Travel-frame position: x/z within the 6 m travel radius, y relative to the ocean origin. */
  x: number; y: number; z: number;
  title: string;
  depthLabel: string;
  fact: string;
  more: string;
  sourceName: string;
  sourceUrl: string;
};

export const MARKERS: DiveMarker[] = [
  {
    id: 'sunlit-oxygen', band: 'sunlit', x: -2.6, y: -0.35, z: -2.2,
    title: 'The sunlit zone', depthLabel: '0 – 200 m',
    fact: 'Enough sunlight reaches these waters for photosynthesis. Tiny drifting plankton here produce about half of the oxygen on Earth.',
    more: 'Almost all ocean life depends on this thin, bright top layer.',
    sourceName: 'NOAA Ocean Service', sourceUrl: 'https://oceanservice.noaa.gov/facts/ocean-oxygen.html',
  },
  {
    id: 'sunlit-reef', band: 'sunlit', x: 2.4, y: -0.45, z: -3.4,
    title: 'Coral reefs', depthLabel: 'Shallow tropical seas',
    fact: 'Reefs cover less than 1% of the ocean floor, yet they support about a quarter of all marine species.',
    more: 'Each coral is a colony of tiny animals (polyps) that build a limestone skeleton together.',
    sourceName: 'NOAA', sourceUrl: 'https://oceanservice.noaa.gov/facts/coralreef-climate.html',
  },
  {
    id: 'blue-colour', band: 'openBlue', x: -3.2, y: -0.2, z: -1.4,
    title: 'Why the sea turns blue', depthLabel: 'Open water',
    fact: 'Water absorbs red light first, then yellow and green. A few tens of metres down, mostly blue light is left.',
    more: 'A red fish looks grey or black at depth: there is no red light left to reflect.',
    sourceName: 'NOAA Ocean Exploration', sourceUrl: 'https://oceanexplorer.noaa.gov/facts/blue.html',
  },
  {
    id: 'pressure', band: 'openBlue', x: 2.9, y: -0.3, z: -2.6,
    title: 'Pressure', depthLabel: 'Every 10 m',
    fact: 'Every 10 metres of seawater adds about one atmosphere of pressure. At 200 m it is roughly 21 times the pressure at the surface.',
    more: 'Deep-sea animals have no air spaces to crush, so they cope with pressures that would flatten a submarine.',
    sourceName: 'NOAA Ocean Service', sourceUrl: 'https://oceanservice.noaa.gov/facts/pressure.html',
  },
  {
    id: 'twilight-migration', band: 'twilight', x: -2.2, y: 0.1, z: -3.0,
    title: 'The twilight zone', depthLabel: '200 – 1,000 m',
    fact: 'Too little light for plants to grow. Each night, huge numbers of animals rise from here to feed near the surface, then sink back by dawn.',
    more: 'This daily vertical migration is thought to be the largest animal migration on Earth.',
    sourceName: 'Woods Hole Oceanographic Institution', sourceUrl: 'https://twilightzone.whoi.edu/',
  },
  {
    id: 'twilight-light', band: 'twilight', x: 3.0, y: -0.1, z: -1.8,
    title: 'Living light', depthLabel: 'Bioluminescence',
    fact: 'Roughly three-quarters of animals in the deep water column can make their own light — to hunt, hide or find a mate.',
    more: 'Blue-green light travels farthest in seawater, so most bioluminescence is blue-green.',
    sourceName: 'MBARI', sourceUrl: 'https://www.mbari.org/news/the-glowing-ocean/',
  },
  {
    id: 'midnight-zone', band: 'midnight', x: -2.8, y: 0, z: -2.4,
    title: 'The midnight zone', depthLabel: '1,000 – 4,000 m',
    fact: 'No sunlight reaches here at all. The water is near 4 °C, and the only light comes from living things.',
    more: 'Food is scarce: many animals here wait for scraps sinking from above.',
    sourceName: 'NOAA Ocean Exploration', sourceUrl: 'https://oceanexplorer.noaa.gov/facts/ocean-depth.html',
  },
  {
    id: 'abyss', band: 'midnight', x: 2.6, y: -0.5, z: -3.2,
    title: 'The abyss', depthLabel: '4,000 – 6,000 m',
    fact: 'Below the midnight zone lies the abyssal zone. Its name comes from the Greek for “bottomless”.',
    more: 'It covers most of the deep seafloor and remains one of the least explored places on Earth.',
    sourceName: 'NOAA Ocean Exploration', sourceUrl: 'https://oceanexplorer.noaa.gov/facts/ocean-depth.html',
  },
];

/** How close (metres, horizontal) the viewer must swim to log a marker. */
export const MARKER_REACH = 0.9;
