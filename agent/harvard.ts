/**
 * Harvard Art Museums API Integration — Real-world art & architectural knowledge.
 *
 * Provides material palettes, color schemes, techniques, and cultural context
 * from 226k+ museum objects. Inspires the agent with real historical designs.
 *
 * API docs: https://github.com/harvardartmuseums/api-docs
 * Key: 4022c751-a448-4f09-a1c0-a9b0c19c45cf
 */

const API_BASE = 'https://api.harvardartmuseums.org';
const API_KEY = '4022c751-a448-4f09-a1c0-a9b0c19c45cf';

/** A curated piece of art/artifact knowledge extracted from the API */
export interface ArtifactKnowledge {
  title: string;
  classification: string;
  medium: string;
  period?: string;
  century?: string;
  culture?: string;
  technique?: string;
  colors?: string[];
  description?: string;
}

/** Grouped art knowledge for prompt injection */
export interface ArtKnowledgeGroup {
  category: string;
  items: ArtifactKnowledge[];
  summary: string;
}

/**
 * Query the Harvard Art Museums API for objects matching a classification.
 * Returns parsed artifact knowledge entries.
 */
export async function queryArtByClassification(
  classification: string,
  size = 5,
): Promise<ArtifactKnowledge[]> {
  const url = `${API_BASE}/object?apikey=${API_KEY}&classification=${encodeURIComponent(classification)}&hasimage=1&size=${size}&sort=random`;

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'WorldAgent/1.0 (yusufsamodien12@gmail.com)' },
    });
    if (!resp.ok) return [];
    const data: any = await resp.json();
    const records = Array.isArray(data?.records) ? data.records : [];

    return records.map((r: any) => ({
      title: r.title || 'Untitled',
      classification: r.classification || 'Unknown',
      medium: r.medium || 'Unknown material',
      period: r.period || undefined,
      century: r.century || undefined,
      culture: r.culture || undefined,
      technique: r.technique || undefined,
      colors: r.colors?.map((c: any) => c.color).filter(Boolean) || undefined,
      description: r.description || undefined,
    }));
  } catch (err) {
    console.warn('Harvard Art API error:', err);
    return [];
  }
}

/**
 * Fetch multiple classifications in parallel and group them.
 */
export async function queryArtKnowledge(): Promise<ArtKnowledgeGroup[]> {
  const classifications = [
    'Architectural Elements',
    'Sculpture',
    'Furniture',
    'Ceramics',
    'Metalwork',
    'Textiles',
    'Tools and Equipment',
    'Arms and Armor',
  ];

  const results = await Promise.all(
    classifications.map((c) => queryArtByClassification(c, 4)),
  );

  const groups: ArtKnowledgeGroup[] = [];

  for (let i = 0; i < classifications.length; i++) {
    const items = results[i];
    if (items.length === 0) continue;

    const materials = [...new Set(items.map((it) => it.medium).filter(Boolean))];
    const cultures = [...new Set(items.map((it) => it.culture).filter(Boolean))];
    const techniques = [...new Set(items.map((it) => it.technique).filter(Boolean))];

    groups.push({
      category: classifications[i],
      items,
      summary: `${classifications[i]}: ${items.length} examples. Materials: ${materials.slice(0, 4).join(', ')}${cultures.length ? `. Cultures: ${cultures.slice(0, 3).join(', ')}` : ''}${techniques.length ? `. Techniques: ${techniques.slice(0, 3).join(', ')}` : ''}`,
    });
  }

  return groups;
}

/**
 * Format art knowledge into a prompt-friendly string.
 */
export async function getArtKnowledgeForPrompt(): Promise<string> {
  const groups = await queryArtKnowledge();

  if (groups.length === 0) return '';

  const lines: string[] = ['HARVARD ART MUSEUMS — REAL ARTIFACTS & ARCHITECTURE:'];

  for (const group of groups.slice(0, 6)) {
    lines.push(`  \u2022 ${group.summary}`);
    // Show 1-2 standout items with colors
    const standouts = group.items.slice(0, 2);
    for (const item of standouts) {
      const colorStr = item.colors?.length ? ` [colors: ${item.colors.slice(0, 3).join(', ')}]` : '';
      const cultureStr = item.culture ? ` (${item.culture})` : '';
      lines.push(`      - "${item.title}" — ${item.medium}${cultureStr}${colorStr}`);
    }
  }

  lines.push('');
  lines.push('Use these real-world materials, color palettes, and techniques as inspiration for your BlockForge designs.');
  lines.push('Reference historical art and architecture to create more authentic, culturally-informed objects.');

  return lines.join('\n');
}
