import { describe, expect, test } from 'bun:test';
import { CHARACTERS, SKILLS } from '../src/data';
import { toMarkdown } from '../src/export';
import type { GameSession, Scenario } from '../src/types';
import { must } from './helpers';

const scenario: Scenario = {
  id: 'archduke',
  title: 'The Archduke',
  set: 'Quill Rulebook',
  profile: [],
  rulesOfCorrespondence: [],
  inkPot: [
    { inferior: 'Death', superior: 'Passing' },
    { inferior: 'Town', superior: 'Riverton' },
  ],
  consequences: [
    { threshold: 0, text: 'bad' },
    { threshold: 5, text: 'tepid' },
    { threshold: 8, text: 'The Archduke thanks you for your kind letter.' },
    { threshold: 11, text: 'great' },
  ],
};

const session: GameSession = {
  id: 'g',
  startedAt: '2026-05-01T00:00:00.000Z',
  characterId: 'monk',
  skillId: 'illumination',
  scenarioId: 'archduke',
  skillSpent: true,
  status: 'finished',
  paragraphs: [
    {
      // P1: flourished superior (2) + penmanship pass (1) = 3
      inkPotIndex: 0,
      attemptedFlourish: true,
      flourishAdjective: 'solemn',
      heartRoll: [5, 3],
      languageRoll: [6, 2],
      penmanshipRoll: [4, 5],
      skillUsedHere: 'penmanship',
      text: 'I write to convey solemn Passing of your dear sister.',
    },
    {
      // P2: plain superior (1) + penmanship pass (1) = 2 — total grand 5 → tepid
      inkPotIndex: 1,
      attemptedFlourish: false,
      flourishAdjective: null,
      heartRoll: null,
      languageRoll: [5],
      penmanshipRoll: [6],
      skillUsedHere: null,
      text: 'I remain near our small Town this season.',
    },
  ],
};

describe('toMarkdown', () => {
  test('frontmatter contains character, skill, scenario, set, score, consequence', () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    expect(md).toContain('character: The Monk');
    expect(md).toContain('skill: Illumination');
    expect(md).toContain('scenario: The Archduke');
    expect(md).toContain('set: Quill Rulebook');
    expect(md).toContain('score: 5');
    expect(md).toContain('consequence: tepid');
  });

  test('letter body contains paragraph text in order', () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    const i1 = md.indexOf('solemn Passing');
    const i2 = md.indexOf('our small Town');
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
  });

  test('game-record table renders rolls and shows em-dash for missing rolls', () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    const lines = md.split('\n');
    const row2 = must(
      lines.find((l) => l.startsWith('| 2 |')),
      'expected row 2 in markdown table',
    );
    // Paragraph 2 had no flourish and no heart roll → both cells are em-dash.
    expect(row2).toContain('—');
  });

  test('total score and consequence text appear at the end', () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    expect(md).toContain('**Total**: 5 / tepid');
    expect(md).toContain('> tepid');
  });
});
