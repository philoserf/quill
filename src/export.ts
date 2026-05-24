import { score } from './scoring';
import type { Character, GameSession, Paragraph, Scenario, Skill } from './types';

const EMDASH = '—';

function rollCell(values: number[] | null): string {
  return values && values.length > 0 ? values.join(',') : EMDASH;
}

function paragraphRow(p: Paragraph, idx: number, scenario: Scenario, points: number): string {
  const pair = scenario.inkPot[p.inkPotIndex];
  const word = pair
    ? p.languageRoll.some((d) => d >= 5)
      ? `${pair.superior} (superior)`
      : `${pair.inferior} (inferior)`
    : EMDASH;
  const flourish = p.attemptedFlourish && p.flourishAdjective ? p.flourishAdjective : EMDASH;
  return `| ${idx + 1} | ${word} | ${flourish} | ${rollCell(p.heartRoll)} | ${rollCell(p.languageRoll)} | ${rollCell(p.penmanshipRoll)} | ${points} |`;
}

export function toMarkdown(
  session: GameSession,
  scenario: Scenario,
  characters: Character[],
  skills: Skill[],
): string {
  const character = characters.find((c) => c.id === session.characterId);
  const skill = skills.find((s) => s.id === session.skillId);
  if (!character || !skill) throw new Error('Unknown character or skill in session');

  const result = score(session, scenario);
  const date = session.startedAt.slice(0, 10);

  const frontmatter = [
    '---',
    `date: ${date}`,
    `character: ${character.name}`,
    `skill: ${skill.name}`,
    `scenario: ${scenario.title}`,
    `set: ${scenario.set}`,
    `score: ${result.total}`,
    `consequence: ${result.tierName}`,
    '---',
    '',
  ].join('\n');

  const body = session.paragraphs.map((p) => p.text.trim()).join('\n\n');

  const tableHeader =
    '| # | Word | Flourish | Heart | Language | Penmanship | Points |\n| --- | --- | --- | --- | --- | --- | --- |';
  const tableRows = session.paragraphs
    .map((p, i) => paragraphRow(p, i, scenario, result.paragraphs[i] ?? 0))
    .join('\n');

  const footer = [
    '',
    '---',
    '',
    '## Game record',
    '',
    tableHeader,
    tableRows,
    '',
    `**Total**: ${result.total} / ${result.tierName}`,
    '',
    `> ${result.tier.text}`,
    '',
  ].join('\n');

  return `${frontmatter}\n${body}\n${footer}`;
}
