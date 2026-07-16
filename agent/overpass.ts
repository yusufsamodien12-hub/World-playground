/**
 * Overpass API Integration — Real-world architectural knowledge for the agent.
 *
 * Queries OpenStreetMap's Overpass API for building types, materials, roof
 * shapes, and construction patterns. Results are injected into the agent's
 * prompt so it can design structures inspired by real-world architecture.
 *
 * Rate limits: <10k queries/day, <1GB data/day.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_USER_AGENT = 'WorldAgent/1.0 (yusufsamodien12@gmail.com)';

/** A real-world building type extracted from OSM */
export interface BuildingKnowledge {
  /** OSM building tag value (house, apartments, church, etc.) */
  buildingType: string;
  /** Typical roof shapes found for this type */
  roofShapes: string[];
  /** Typical materials found for this type */
  materials: string[];
  /** Typical number of levels */
  levels: string;
  /** Colour palette hint */
  colour?: string;
  /** Short architectural description */
  description: string;
}

/** Aggregate knowledge about a category of structures */
export interface ArchitecturalPattern {
  category: string;
  patterns: BuildingKnowledge[];
  summary: string;
}

/**
 * Query the Overpass API for building data around a real-world location.
 * Returns architectural patterns grouped by building type.
 */
export async function queryBuildingKnowledge(
  lat = 51.5,
  lon = -0.1,
  radius = 500,
  limit = 20
): Promise<ArchitecturalPattern[]> {
  const overpassQl = `[out:json][timeout:10];
(
  way["building"](around:${radius},${lat},${lon});
  node["building"](around:${radius},${lat},${lon});
);
out body tags ${limit};`;

  try {
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': OVERPASS_USER_AGENT,
      },
      body: `data=${encodeURIComponent(overpassQl)}`,
    });

    if (!resp.ok) return [];

    const data: any = await resp.json();
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    if (elements.length === 0) return [];

    // Group by building type and collect tags
    const typeMap = new Map<string, { roofs: Set<string>; materials: Set<string>; levels: string[]; colours: string[]; count: number }>();

    for (const el of elements) {
      const tags = el.tags || {};
      const bldgType = tags.building || 'unknown';
      if (bldgType === 'no' || bldgType === 'yes') continue; // skip generic

      if (!typeMap.has(bldgType)) {
        typeMap.set(bldgType, { roofs: new Set(), materials: new Set(), levels: [], colours: [], count: 0 });
      }
      const entry = typeMap.get(bldgType)!;
      entry.count++;

      if (tags['roof:shape']) entry.roofs.add(tags['roof:shape']);
      if (tags['building:material']) entry.materials.add(tags['building:material']);
      if (tags['building:levels']) entry.levels.push(tags['building:levels']);
      if (tags['building:colour']) entry.colours.push(tags['building:colour']);
    }

    // Convert to ArchitecturalPattern[]
    const patterns: ArchitecturalPattern[] = [];
    for (const [bldgType, data] of typeMap) {
      const levelStr = data.levels.length > 0
        ? `${Math.round(data.levels.reduce((a: number, b: string) => a + parseInt(b) || 0, 0) / data.levels.length)}`
        : 'variable';

      const desc = describeBuildingType(bldgType);

      patterns.push({
        category: bldgType,
        patterns: [{
          buildingType: bldgType,
          roofShapes: [...data.roofs],
          materials: [...data.materials],
          levels: levelStr,
          colour: data.colours[0] || undefined,
          description: desc,
        }],
        summary: `${bldgType}: typically ${desc}${data.materials.size > 0 ? ', built with ' + [...data.materials].join(', ') : ''}${data.roofs.size > 0 ? ', roof: ' + [...data.roofs].join(', ') : ''}`,
      });
    }

    return patterns;
  } catch (err) {
    console.warn('Overpass API query failed:', err);
    return [];
  }
}

/** Map OSM building types to short architectural descriptions */
function describeBuildingType(type: string): string {
  const descriptions: Record<string, string> = {
    house: 'a single-family residential home',
    apartments: 'a multi-unit apartment building',
    flats: 'a multi-storey residential block',
    terrace: 'a row of connected houses sharing side walls',
    detached: 'a standalone house',
    semidetached_house: 'a house sharing one wall with a neighbour',
    dormitory: 'a building with shared sleeping quarters',
    residential: 'a general residential building',
    commercial: 'a building used for businesses and retail',
    retail: 'a shop or retail store',
    office: 'an office building',
    industrial: 'a warehouse or industrial facility',
    warehouse: 'a large storage warehouse',
    church: 'a place of worship with a distinctive nave and spire',
    cathedral: 'a large church with ornate architecture',
    chapel: 'a small place of worship',
    school: 'an educational building with classrooms',
    university: 'a university building with lecture halls',
    hospital: 'a medical facility',
    hotel: 'a hospitality building with guest rooms',
    garage: 'a vehicle storage building',
    carport: 'a covered parking structure',
    shed: 'a small garden or utility shed',
    greenhouse: 'a glass structure for growing plants',
    barn: 'an agricultural building for storage or livestock',
    stable: 'a building for housing horses',
    kiosk: 'a small freestanding retail booth',
    pavilion: 'a light open-sided structure for shelter or events',
    stadium: 'a large sports venue',
    transformer_tower: 'a tall narrow utility building',
    water_tower: 'a tower supporting a water tank',
    silo: 'a tall cylindrical storage tower',
    bunker: 'a reinforced underground shelter',
    ruins: 'the remains of a destroyed building',
    construction: 'a building currently under construction',
    roof: 'a roofed structure without full walls',
    bridge: 'a structure spanning a road or waterway',
    gate: 'a gateway through a wall or fence',
  };
  return descriptions[type] || `a ${type.replace(/_/g, ' ')} building`;
}

/**
 * Get a formatted string of real-world building knowledge for the agent prompt.
 * Returns a concise summary of architectural patterns found.
 */
export async function getArchitectureKnowledgeForPrompt(
  lat = 51.5,
  lon = -0.1,
  radius = 1000,
): Promise<string> {
  const patterns = await queryBuildingKnowledge(lat, lon, radius);

  if (patterns.length === 0) {
    return '';
  }

  const lines: string[] = ['REAL-WORLD ARCHITECTURAL PATTERNS (from OpenStreetMap):'];

  for (const p of patterns.slice(0, 8)) {
    lines.push(`  \u2022 ${p.summary}`);
  }

  lines.push('');
  lines.push('Use these real-world architectural patterns as inspiration for your designs.');
  lines.push('You can reference building types, roof shapes, and materials from real cities.');

  return lines.join('\n');
}
