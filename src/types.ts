export type Attribute = 'penmanship' | 'language' | 'heart';
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

export interface ConsequenceTier {
  threshold: number;
  text: string;
}

export interface Scenario {
  id: string;
  title: string;
  profile: string[];
  rulesOfCorrespondence: Modifier[];
  inkPot: InkPotEntry[];
  consequences: ConsequenceTier[];
}

export interface Paragraph {
  inkPotIndex: number;
  attemptedFlourish: boolean;
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

export const TIER_NAMES = {
  0: 'unsuccessful',
  5: 'tepid',
  8: 'favourable',
  11: 'excellent',
} as const;

export type TierName = (typeof TIER_NAMES)[keyof typeof TIER_NAMES];
