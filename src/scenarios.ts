import type { Modifier, Scenario } from './types';

const REQUIRED_THRESHOLDS = [0, 5, 8, 11] as const;
const VALID_ATTRS = new Set(['penmanship', 'language', 'heart']);

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function validateModifier(m: unknown): Modifier {
  if (typeof m !== 'object' || m === null) {
    throw new Error('Modifier must be an object');
  }
  const obj = m as Record<string, unknown>;
  if (typeof obj.description !== 'string') {
    throw new Error('Modifier missing description');
  }
  if (typeof obj.attribute !== 'string' || !VALID_ATTRS.has(obj.attribute)) {
    throw new Error(`Modifier has invalid attribute: ${String(obj.attribute)}`);
  }

  if (obj.type === 'dice_bonus') {
    if (typeof obj.amount !== 'number' || obj.amount <= 0) {
      throw new Error('dice_bonus modifier requires positive numeric amount');
    }
    let appliesTo: { characters: string[] } | undefined;
    if (obj.appliesTo !== undefined) {
      const at = obj.appliesTo as Record<string, unknown>;
      if (!isStringArray(at.characters)) {
        throw new Error('dice_bonus.appliesTo.characters must be string[]');
      }
      appliesTo = { characters: at.characters };
    }
    return {
      type: 'dice_bonus',
      attribute: obj.attribute as Modifier['attribute'],
      amount: obj.amount,
      ...(appliesTo ? { appliesTo } : {}),
      description: obj.description,
    };
  }

  if (obj.type === 'reroll_highest') {
    return {
      type: 'reroll_highest',
      attribute: obj.attribute as Modifier['attribute'],
      description: obj.description,
    };
  }

  throw new Error(`Unknown modifier type: ${String(obj.type)}`);
}

export function validateScenario(raw: unknown): Scenario {
  if (typeof raw !== 'object' || raw === null) throw new Error('Scenario must be an object');
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string') throw new Error('Scenario.id must be a string');
  if (typeof obj.title !== 'string') throw new Error('Scenario.title must be a string');
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
  const thresholds = obj.consequences
    .map((c) => (c as { threshold: number }).threshold)
    .sort((a, b) => a - b);
  if (
    thresholds.length !== REQUIRED_THRESHOLDS.length ||
    !thresholds.every((t, i) => t === REQUIRED_THRESHOLDS[i])
  ) {
    throw new Error(
      `Scenario.consequences thresholds must be exactly [0,5,8,11], got [${thresholds.join(',')}]`,
    );
  }
  const consequences = obj.consequences.map((c, i) => {
    const ct = c as Record<string, unknown>;
    if (typeof ct.threshold !== 'number' || typeof ct.text !== 'string') {
      throw new Error(`consequences[${i}] malformed`);
    }
    return { threshold: ct.threshold, text: ct.text };
  });

  return {
    id: obj.id,
    title: obj.title,
    profile: obj.profile,
    rulesOfCorrespondence: rules,
    inkPot,
    consequences,
  };
}

export async function loadScenarios(baseUrl = './scenarios'): Promise<Scenario[]> {
  const manifestRes = await fetch(`${baseUrl}/manifest.json`);
  if (!manifestRes.ok) throw new Error('Failed to fetch scenario manifest');
  const files = (await manifestRes.json()) as string[];
  const out: Scenario[] = [];
  for (const f of files) {
    const res = await fetch(`${baseUrl}/${f}`);
    if (!res.ok) throw new Error(`Failed to fetch scenario ${f}`);
    out.push(validateScenario(await res.json()));
  }
  return out;
}
