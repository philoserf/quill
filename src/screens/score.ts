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
  banner.innerHTML = `
    <h2>${ctx.scenario.title}</h2>
    <p class="score-total">Final score: <strong>${result.total}</strong> — ${result.tierName}</p>
    <p class="consequence">${result.tier.text}</p>`;
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
  const breakdownRows = ctx.session.paragraphs
    .map((p, i) => {
      const pair = ctx.scenario.inkPot[p.inkPotIndex];
      const sup = p.languageRoll.some((d) => d >= 5);
      const word = pair
        ? `${sup ? pair.superior : pair.inferior} (${sup ? 'superior' : 'inferior'})`
        : '—';
      const flourish = p.attemptedFlourish && p.flourishAdjective ? p.flourishAdjective : '—';
      return `<tr>
          <td>${i + 1}</td>
          <td>${word}</td>
          <td>${flourish}</td>
          <td>${p.heartRoll?.join(',') ?? '—'}</td>
          <td>${p.languageRoll.join(',')}</td>
          <td>${p.penmanshipRoll.join(',')}</td>
          <td>${result.paragraphs[i] ?? 0}</td>
        </tr>`;
    })
    .join('');
  breakdown.innerHTML = `
    <summary>Per-paragraph breakdown</summary>
    <table class="breakdown-table">
      <thead><tr><th>#</th><th>Word</th><th>Flourish</th><th>Heart</th><th>Language</th><th>Penmanship</th><th>Points</th></tr></thead>
      <tbody>${breakdownRows}</tbody>
    </table>`;
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
