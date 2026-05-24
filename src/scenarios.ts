import { CHARACTERS } from './data';
import { ATTRIBUTES, type Attribute, type Modifier, type Scenario } from './types';

const REQUIRED_THRESHOLDS = [0, 5, 8, 11] as const;
const VALID_ATTRS = new Set<string>(ATTRIBUTES);
const VALID_CHARACTER_IDS = new Set(CHARACTERS.map((c) => c.id));

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

const KNOWN_MODIFIER_TYPES = new Set(['dice_bonus', 'reroll_highest', 'narrative']);

function validateModifier(m: unknown): Modifier {
  if (typeof m !== 'object' || m === null) {
    throw new Error('Modifier must be an object');
  }
  const obj = m as Record<string, unknown>;
  if (typeof obj.description !== 'string') {
    throw new Error('Modifier missing description');
  }
  if (typeof obj.type !== 'string' || !KNOWN_MODIFIER_TYPES.has(obj.type)) {
    throw new Error(`Unknown modifier type: ${String(obj.type)}`);
  }

  if (obj.type === 'narrative') {
    for (const stray of ['attribute', 'amount', 'appliesTo'] as const) {
      if (stray in obj) {
        throw new Error(
          `narrative modifier has stray field "${stray}" — narrative rules are description-only`,
        );
      }
    }
    return { type: 'narrative', description: obj.description };
  }

  if (typeof obj.attribute !== 'string' || !VALID_ATTRS.has(obj.attribute)) {
    throw new Error(`Modifier has invalid attribute: ${String(obj.attribute)}`);
  }

  if (obj.type === 'dice_bonus') {
    if (typeof obj.amount !== 'number' || !Number.isInteger(obj.amount) || obj.amount <= 0) {
      throw new Error('dice_bonus modifier requires a positive integer amount');
    }
    let appliesTo: { characters: string[] } | undefined;
    if ('appliesTo' in obj && obj.appliesTo !== undefined) {
      if (obj.appliesTo === null || typeof obj.appliesTo !== 'object') {
        throw new Error('dice_bonus.appliesTo must be an object (or omit the field)');
      }
      const at = obj.appliesTo as Record<string, unknown>;
      if (!isStringArray(at.characters)) {
        throw new Error('dice_bonus.appliesTo.characters must be string[]');
      }
      if (at.characters.length === 0) {
        throw new Error(
          'dice_bonus.appliesTo.characters must list at least one id (or omit appliesTo entirely)',
        );
      }
      const unknown = at.characters.filter((id) => !VALID_CHARACTER_IDS.has(id));
      if (unknown.length) {
        throw new Error(`dice_bonus.appliesTo.characters has unknown id(s): ${unknown.join(', ')}`);
      }
      appliesTo = { characters: at.characters };
    }
    return {
      type: 'dice_bonus',
      attribute: obj.attribute as Attribute,
      amount: obj.amount,
      ...(appliesTo ? { appliesTo } : {}),
      description: obj.description,
    };
  }

  // obj.type === 'reroll_highest' — KNOWN_MODIFIER_TYPES guard above ensures the only remaining case
  return {
    type: 'reroll_highest',
    attribute: obj.attribute as Attribute,
    description: obj.description,
  };
}

export function validateScenario(raw: unknown): Scenario {
  if (typeof raw !== 'object' || raw === null) throw new Error('Scenario must be an object');
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string') throw new Error('Scenario.id must be a string');
  if (typeof obj.title !== 'string') throw new Error('Scenario.title must be a string');
  if (typeof obj.set !== 'string' || obj.set.trim().length === 0) {
    throw new Error('Scenario.set must be a non-empty string');
  }
  const setName = obj.set.trim();
  if (!isStringArray(obj.profile)) throw new Error('Scenario.profile must be string[]');

  if (!Array.isArray(obj.rulesOfCorrespondence)) {
    throw new Error('Scenario.rulesOfCorrespondence must be an array');
  }
  const rules = obj.rulesOfCorrespondence.map(validateModifier);

  if (!Array.isArray(obj.inkPot) || obj.inkPot.length === 0) {
    throw new Error('Scenario.inkPot must be a non-empty array');
  }
  const inkPot = obj.inkPot.map((e, i) => {
    if (typeof e !== 'object' || e === null) throw new Error(`inkPot[${i}] must be object`);
    const entry = e as Record<string, unknown>;
    if (typeof entry.inferior !== 'string' || typeof entry.superior !== 'string') {
      throw new Error(`inkPot[${i}] must have inferior+superior strings`);
    }
    return { inferior: entry.inferior, superior: entry.superior };
  });

  if (!Array.isArray(obj.consequences)) throw new Error('Scenario.consequences must be array');
  const consequences = obj.consequences.map((c, i) => {
    if (typeof c !== 'object' || c === null) {
      throw new Error(`consequences[${i}] must be an object`);
    }
    const ct = c as Record<string, unknown>;
    if (typeof ct.threshold !== 'number' || Number.isNaN(ct.threshold)) {
      throw new Error(`consequences[${i}].threshold must be a number`);
    }
    if (typeof ct.text !== 'string') {
      throw new Error(`consequences[${i}].text must be a string`);
    }
    return { threshold: ct.threshold, text: ct.text };
  });
  const thresholds = consequences.map((c) => c.threshold).sort((a, b) => a - b);
  if (
    thresholds.length !== REQUIRED_THRESHOLDS.length ||
    !thresholds.every((t, i) => t === REQUIRED_THRESHOLDS[i])
  ) {
    throw new Error(
      `Scenario.consequences thresholds must be exactly [0,5,8,11], got [${thresholds.join(',')}]`,
    );
  }

  return {
    id: obj.id,
    title: obj.title,
    set: setName,
    profile: obj.profile,
    rulesOfCorrespondence: rules,
    inkPot,
    consequences,
  };
}

// Scenarios are imported at build time so the bundle is self-contained — Bun's
// HTML dev server doesn't serve sibling JSON via fetch (it returns the SPA HTML),
// and a bundled-in copy works identically in dev and production.
import archduke from '../public/scenarios/archduke.json' with { type: 'json' };
import artDealer from '../public/scenarios/art-dealer.json' with { type: 'json' };
import cruelDistance from '../public/scenarios/cruel-distance.json' with { type: 'json' };
import father from '../public/scenarios/father.json' with { type: 'json' };
import forbiddenLove from '../public/scenarios/forbidden-love.json' with { type: 'json' };
import king from '../public/scenarios/king.json' with { type: 'json' };
import makingAmends from '../public/scenarios/making-amends.json' with { type: 'json' };
import somethingMore from '../public/scenarios/something-more.json' with { type: 'json' };
import winningHeart from '../public/scenarios/winning-heart.json' with { type: 'json' };

const BUNDLED: unknown[] = [
  archduke,
  artDealer,
  cruelDistance,
  father,
  forbiddenLove,
  king,
  makingAmends,
  somethingMore,
  winningHeart,
];

export function loadScenarios(): Scenario[] {
  return BUNDLED.map((raw) => validateScenario(raw));
}
