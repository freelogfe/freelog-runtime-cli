export function renderTable(rows, { padding = 1, header = null } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }
  const columnCount = Math.max(...rows.map((row) => row.length));
  const columnWidths = Array.from({ length: columnCount }, (_, index) =>
    Math.max(
      header && header[index] ? String(header[index]).length : 0,
      ...rows.map((row) => (row[index] ? String(row[index]).length : 0))
    )
  );

  const border = '+' + columnWidths.map((width) => '-'.repeat(width + padding * 2)).join('+') + '+';
  const topBorder = border;
  const midBorder = border;
  const bottomBorder = border;

  const renderRow = (cells) => {
    const padded = cells.map((value, index) => {
      const text = value === undefined || value === null ? '' : String(value);
      return `${' '.repeat(padding)}${text.padEnd(columnWidths[index], ' ')}${' '.repeat(padding)}`;
    });
    return `|${padded.join('|')}|`;
  };

  const lines = [topBorder];
  if (header) {
    lines.push(renderRow(header));
    lines.push(midBorder);
  }
  for (const row of rows) {
    lines.push(renderRow(row));
  }
  lines.push(bottomBorder);
  return lines.join('\n');
}
