export function nowISO() {
  return new Date().toISOString();
}

export function formatDateTime(value) {
  if (!value) {
    return 'N/A';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().replace('T', ' ').replace('Z', 'Z');
}

export function addDays(value, days) {
  const date = value instanceof Date ? new Date(value) : new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function formatDuration(from, to) {
  const start = from instanceof Date ? from.getTime() : new Date(from).getTime();
  const end = to instanceof Date ? to.getTime() : new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 'unknown duration';
  }
  const diffMs = Math.max(0, end - start);
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays >= 1) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours >= 1) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  }
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes >= 1) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
  }
  const diffSeconds = Math.round(diffMs / 1000);
  return `${diffSeconds} second${diffSeconds === 1 ? '' : 's'}`;
}
