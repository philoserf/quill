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
