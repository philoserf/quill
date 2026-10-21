import { paragraphProse } from './paragraph';
import { paragraphOutcome, score } from './scoring';
import type { Character, GameSession, Paragraph, Scenario, Skill } from './types';

const EMDASH = '—';

/** Player text reaches the game-record table unmodified, and the flourish input
 *  has no pattern or sanitisation. A literal pipe adds a cell; a pasted newline
 *  splits the row and terminates the table early. Backslashes go first, or a
 *  typed `\|` becomes `\\|` — an escaped backslash, then a bare pipe. */
function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Unquoted, a frontmatter value carrying a colon or a leading dash writes an
 *  invalid document. Every bundled name and title is plain; this is for the
 *  next one, so every rulebook string in the frontmatter goes through it. */
function yamlScalar(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function rollCell(values: number[] | null): string {
  return values && values.length > 0 ? values.join(',') : EMDASH;
}

function paragraphRow(p: Paragraph, idx: number, scenario: Scenario): string {
  const o = paragraphOutcome(p, scenario);
  const word =
    o.word === null ? EMDASH : `${escapeCell(o.word)} (${o.superior ? 'superior' : 'inferior'})`;
  // Only a flourish that held is reported — an attempt whose Heart roll failed
  // earns nothing and is not shown, matching the play screen's done summary.
  const flourish = o.flourish?.held && o.flourish.word ? escapeCell(o.flourish.word) : EMDASH;
  return `| ${idx + 1} | ${word} | ${flourish} | ${rollCell(p.heartRoll)} | ${rollCell(p.languageRoll)} | ${rollCell(p.penmanshipRoll)} | ${o.points} |`;
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
    `character: ${yamlScalar(character.name)}`,
    `skill: ${yamlScalar(skill.name)}`,
    `scenario: ${yamlScalar(scenario.title)}`,
    `score: ${result.total}`,
    `consequence: ${result.tierName}`,
    '---',
    '',
  ].join('\n');

  const body = session.paragraphs.map((p) => paragraphProse(p.text)).join('\n\n');

  const tableHeader =
    '| # | Word | Flourish | Heart | Language | Penmanship | Points |\n| --- | --- | --- | --- | --- | --- | --- |';
  const tableRows = session.paragraphs.map((p, i) => paragraphRow(p, i, scenario)).join('\n');

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
