import { CHARACTERS, SKILLS } from '../data';
import { toMarkdown } from '../export';
import { score } from '../scoring';
import type { GameSession, Scenario } from '../types';

export interface ScoreCtx {
  session: GameSession;
  scenario: Scenario;
  onRestart: () => void;
}

export function renderScore(ctx: ScoreCtx): HTMLElement {
  const root = document.createElement('section');
  root.className = 'screen screen--score';

  const result = score(ctx.session, ctx.scenario);

  const banner = document.createElement('div');
  banner.className = 'score-banner';
  const bannerTitle = document.createElement('h2');
  bannerTitle.textContent = ctx.scenario.title;
  const totalLine = document.createElement('p');
  totalLine.className = 'score-total';
  const totalStrong = document.createElement('strong');
  totalStrong.textContent = String(result.total);
  totalLine.append('Final score: ', totalStrong, ` — ${result.tierName}`);
  const consequenceLine = document.createElement('p');
  consequenceLine.className = 'consequence';
  consequenceLine.textContent = result.tier.text;
  banner.append(bannerTitle, totalLine, consequenceLine);
  root.appendChild(banner);

  const letterCard = document.createElement('article');
  letterCard.className = 'finished-letter';
  for (const p of ctx.session.paragraphs) {
    const para = document.createElement('p');
    para.textContent = p.text;
    letterCard.appendChild(para);
  }
  root.appendChild(letterCard);

  const breakdown = document.createElement('details');
  breakdown.className = 'breakdown';
  const summary = document.createElement('summary');
  summary.textContent = 'Per-paragraph breakdown';
  breakdown.appendChild(summary);

  const table = document.createElement('table');
  table.className = 'breakdown-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['#', 'Word', 'Flourish', 'Heart', 'Language', 'Penmanship', 'Points']) {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const rollCell = (values: number[] | null): string =>
    values && values.length > 0 ? values.join(',') : '—';
  for (const [i, p] of ctx.session.paragraphs.entries()) {
    const pair = ctx.scenario.inkPot[p.inkPotIndex];
    const sup = p.languageRoll.some((d) => d >= 5);
    const word = pair
      ? `${sup ? pair.superior : pair.inferior} (${sup ? 'superior' : 'inferior'})`
      : '—';
    const flourish = p.attemptedFlourish && p.flourishAdjective ? p.flourishAdjective : '—';
    const row = document.createElement('tr');
    for (const cell of [
      String(i + 1),
      word,
      flourish,
      rollCell(p.heartRoll),
      rollCell(p.languageRoll),
      rollCell(p.penmanshipRoll),
      String(result.paragraphs[i] ?? 0),
    ]) {
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
