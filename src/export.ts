import { succeeded } from './dice';
import { EMPTY_PARAGRAPH } from './paragraph';
import { score } from './scoring';
import type { Character, GameSession, Paragraph, Scenario, Skill } from './types';

const EMDASH = '—';

/** Player text reaches the game-record table unmodified, and the flourish input
 *  has no pattern or sanitisation. A literal pipe adds a cell; a pasted newline
 *  splits the row and terminates the table early. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Frontmatter scalars are unquoted, so a scenario title carrying a colon or a
 *  leading dash writes an invalid document. All four bundled titles are plain;
 *  this is for the next one. */
function yamlScalar(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function rollCell(values: number[] | null): string {
  return values && values.length > 0 ? values.join(',') : EMDASH;
}

function paragraphRow(p: Paragraph, idx: number, scenario: Scenario, points: number): string {
  const pair = scenario.inkPot[p.inkPotIndex];
  const word = pair
    ? succeeded(p.languageRoll)
      ? `${escapeCell(pair.superior)} (superior)`
      : `${escapeCell(pair.inferior)} (inferior)`
    : EMDASH;
  // Only a flourish that held is reported — an attempt whose Heart roll failed
  // earns nothing and is not shown, matching the play screen's done summary.
  const flourish =
    succeeded(p.heartRoll) && p.flourishAdjective ? escapeCell(p.flourishAdjective) : EMDASH;
  return `| ${idx + 1} | ${word} | ${flourish} | ${rollCell(p.heartRoll)} | ${rollCell(p.languageRoll)} | ${rollCell(p.penmanshipRoll)} | ${points} |`;
}

export function toMarkdown(
  session: GameSession,
  scenario: Scenario,
  character: Character,
  skill: Skill,
): string {
  const result = score(session);
  const date = session.startedAt.slice(0, 10);

  const frontmatter = [
    '---',
    `date: ${date}`,
    `character: ${character.name}`,
    `skill: ${skill.name}`,
    `scenario: ${yamlScalar(scenario.title)}`,
    `score: ${result.total}`,
    `consequence: ${result.tierName}`,
    '---',
    '',
  ].join('\n');

  const body = session.paragraphs.map((p) => p.text.trim() || EMPTY_PARAGRAPH).join('\n\n');

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
    `> ${scenario.consequences[result.tierName]}`,
    '',
  ].join('\n');

  return `${frontmatter}\n${body}\n${footer}`;
}
