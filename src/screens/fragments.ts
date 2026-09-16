import type { Scenario } from '../types';

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

export function renderLetterhead(title: string, startedAt: string): HTMLElement {
  const head = document.createElement('div');
  head.className = 'letterhead';
  const titleEl = document.createElement('p');
  titleEl.className = 'letterhead__title';
  titleEl.textContent = title;
  const date = document.createElement('p');
  date.className = 'letterhead__date';
  date.textContent = formatOrdinalDate(startedAt);
  head.append(titleEl, date);
  return head;
}

/** The scenario's profile and rules, rendered identically by the Setup screen's
 *  detail block and the play screen's recall panel. The options exist so both
 *  keep the appearance they already had; the structure is shared. */
export function renderScenarioDetail(
  scenario: Scenario,
  opts: { className: string; profileHeading?: string; headingClass?: string },
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = opts.className;

  const heading = (text: string): HTMLElement => {
    const h = document.createElement('h4');
    if (opts.headingClass) h.className = opts.headingClass;
    h.textContent = text;
    return h;
  };

  if (opts.profileHeading) wrap.appendChild(heading(opts.profileHeading));
  for (const p of scenario.profile) {
    const para = document.createElement('p');
    para.textContent = p;
    wrap.appendChild(para);
  }

  wrap.appendChild(heading('Rules of Correspondence'));
  if (scenario.rulesOfCorrespondence.length === 0) {
    const none = document.createElement('p');
    none.textContent = 'None.';
    wrap.appendChild(none);
  } else {
    for (const r of scenario.rulesOfCorrespondence) {
      const para = document.createElement('p');
      para.className = 'rule';
      para.textContent = r.description;
      wrap.appendChild(para);
    }
  }
  return wrap;
}
