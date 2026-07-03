import { CHARACTERS, SKILLS } from '../data';
import { countSuccesses } from '../dice';
import { toMarkdown } from '../export';
import { score } from '../scoring';
import type { GameSession, Scenario } from '../types';

export interface ScoreCtx {
  session: GameSession;
  scenario: Scenario;
  onRestart: () => void;
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

// Local time on purpose: the letterhead should read as the player's calendar
// day, even though startedAt is stored (and the export filename derived) in UTC.
function formatOrdinalDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `Written this ${day}${ordinalSuffix(day)} day of ${month}`;
}

function withIndefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `An ${word}` : `A ${word}`;
}

export function renderScore(ctx: ScoreCtx): HTMLElement {
  const root = document.createElement('section');
  root.className = 'screen screen--score';

  const result = score(ctx.session, ctx.scenario);

  const banner = document.createElement('div');
  banner.className = 'score-banner';
  const seal = document.createElement('div');
  seal.className = 'score-seal';
  const sealStrong = document.createElement('strong');
  sealStrong.textContent = String(result.total);
  seal.appendChild(sealStrong);
  const tierName = document.createElement('p');
  tierName.className = 'score-tier';
  tierName.textContent = `${withIndefiniteArticle(result.tierName)} letter`;
  const consequenceLine = document.createElement('p');
  consequenceLine.className = 'consequence';
  consequenceLine.textContent = result.tier.text;
  banner.append(seal, tierName, consequenceLine);
  root.appendChild(banner);

  const letterCard = document.createElement('article');
  letterCard.className = 'finished-letter paper';
  const head = document.createElement('div');
  head.className = 'letterhead';
  const title = document.createElement('p');
  title.className = 'letterhead__title';
  title.textContent = ctx.scenario.title;
  const date = document.createElement('p');
  date.className = 'letterhead__date';
  date.textContent = formatOrdinalDate(ctx.session.startedAt);
  head.append(title, date);
  letterCard.appendChild(head);
  for (const p of ctx.session.paragraphs) {
    const para = document.createElement('p');
    para.className = 'letter-paragraph';
    para.textContent = p.text;
    letterCard.appendChild(para);
  }
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  const signature = document.createElement('div');
  signature.className = 'signature-row';
  const signatureText = document.createElement('span');
  signatureText.textContent = `— ${character?.name ?? 'The Correspondent'}`;
  const sealDot = document.createElement('span');
  sealDot.className = 'seal-dot';
  signature.append(signatureText, sealDot);
  letterCard.appendChild(signature);
  root.appendChild(letterCard);

  const breakdown = document.createElement('section');
  breakdown.className = 'breakdown paper';
  const breakdownHeading = document.createElement('h4');
  breakdownHeading.textContent = 'The reckoning, paragraph by paragraph';
  breakdown.appendChild(breakdownHeading);

  const table = document.createElement('table');
  table.className = 'breakdown-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['No.', 'Word & flourish', 'Hand', 'Points']) {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const [i, p] of ctx.session.paragraphs.entries()) {
    const pair = ctx.scenario.inkPot[p.inkPotIndex];
    const sup = countSuccesses(p.languageRoll) > 0;
    const flourish = p.flourishAdjective;
    const flourishApplied =
      flourish !== null && p.heartRoll !== null && countSuccesses(p.heartRoll) > 0;
    let word = pair
      ? `"${sup ? pair.superior : pair.inferior}" (${sup ? 'superior' : 'inferior'})`
      : '—';
    if (p.attemptedFlourish) {
      word += flourishApplied && flourish !== null ? ` + "${flourish}"` : ' — flourish lost';
    }
    const penOk = countSuccesses(p.penmanshipRoll) > 0;
    const hand = penOk ? 'Fine hand' : 'Plain hand';

    const row = document.createElement('tr');
    for (const cell of [String(i + 1), word, hand, String(result.paragraphs[i] ?? 0)]) {
      const td = document.createElement('td');
      td.textContent = cell;
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  breakdown.appendChild(table);
  root.appendChild(breakdown);

  const actions = document.createElement('div');
  actions.className = 'actions actions--score';

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'btn btn--primary';
  download.textContent = 'Download letter (.md)';
  download.addEventListener('click', () => {
    const md = toMarkdown(ctx.session, ctx.scenario, CHARACTERS, SKILLS);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = ctx.session.startedAt.slice(0, 10);
    a.href = url;
    a.download = `quill-${d}-${ctx.scenario.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'btn';
  restart.textContent = 'Write another letter';
  restart.addEventListener('click', ctx.onRestart);

  actions.append(download, restart);
  root.appendChild(actions);

  return root;
}
