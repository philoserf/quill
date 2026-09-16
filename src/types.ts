export const PARAGRAPHS_PER_LETTER = 5;

export const ATTRIBUTES = ['penmanship', 'language', 'heart'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Rating = 'poor' | 'average' | 'good';

export interface Character {
  id: string;
  name: string;
  flavor: string[];
  attributes: Record<Attribute, Rating>;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  bonusAttribute: Attribute;
}

export interface InkPotEntry {
  inferior: string;
  superior: string;
}

export type Modifier =
  | {
      type: 'dice_bonus';
      attribute: Attribute;
      amount: number;
      appliesTo?: { characters: string[] };
      description: string;
    }
  | {
      type: 'reroll_highest';
      attribute: Attribute;
      description: string;
    };

export interface Scenario {
  id: string;
  title: string;
  profile: string[];
  rulesOfCorrespondence: Modifier[];
  inkPot: InkPotEntry[];
  consequences: Record<TierName, string>;
}

export interface Paragraph {
  inkPotIndex: number;
  flourishAdjective: string | null;
  heartRoll: number[] | null;
  languageRoll: number[];
  penmanshipRoll: number[];
  skillUsedHere: Attribute | null;
  text: string;
}

export interface GameSession {
  id: string;
  startedAt: string;
  characterId: string;
  skillId: string;
  scenarioId: string;
  skillSpent: boolean;
  paragraphs: Paragraph[];
  status: 'in_progress' | 'finished';
}

// Ordered high to low: the first threshold a total clears wins. The single
// home for both the boundaries and the names — TierName derives from it.
export const LOWEST_TIER = 'unsuccessful';

export const TIERS = [
  { threshold: 11, name: 'excellent' },
  { threshold: 8, name: 'favourable' },
  { threshold: 5, name: 'tepid' },
  { threshold: 0, name: LOWEST_TIER },
] as const;

export type TierName = (typeof TIERS)[number]['name'];
