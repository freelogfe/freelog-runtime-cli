import chalk from 'chalk';
import Table from 'cli-table3';

const COLOR_THEME = {
  info: chalk.cyan,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  headline: chalk.magenta.bold,
  muted: chalk.gray
};

export function createRenderer(options = {}) {
  const useJson = options.json === true;

  const renderLine = (level, message, target = process.stdout) => {
    if (useJson) {
      target.write(`${JSON.stringify({ level, message })}\n`);
      return;
    }
    const painter = COLOR_THEME[level] ?? ((text) => text);
    target.write(`${painter(message)}\n`);
  };

  return {
    info: (message) => renderLine('info', message),
    success: (message) => renderLine('success', message),
    warn: (message) => renderLine('warn', message),
    error: (message) => renderLine('error', message, process.stderr),
    headline: (message) => renderLine('headline', message),
    muted: (message) => renderLine('muted', message),
    divider: () => {
      if (!useJson) {
        process.stdout.write(`${chalk.gray('-'.repeat(64))}\n`);
      }
    },
    table: (rows, config = {}) => {
      if (useJson) {
        process.stdout.write(
          `${JSON.stringify({ table: { header: config.header ?? [], rows } }, null, 2)}\n`
        );
        return;
      }
      const head = config.header ? config.header.map((cell) => chalk.cyan(cell)) : undefined;
      const tableOptions = {
        head,
        wordWrap: true
      };
      if (Array.isArray(config.colWidths)) {
        tableOptions.colWidths = config.colWidths;
      }
      if (Array.isArray(config.rowHeights)) {
        tableOptions.rowHeights = config.rowHeights;
      }
      const table = new Table(tableOptions);
      rows.forEach((row) =>
        table.push(row.map((cell) => (cell === undefined || cell === null ? '' : String(cell))))
      );
      process.stdout.write(`${table.toString()}\n`);
    },
    list: (items) => {
      if (useJson) {
        process.stdout.write(`${JSON.stringify({ list: items }, null, 2)}\n`);
        return;
      }
      items.forEach((item) => process.stdout.write(`${chalk.gray('•')} ${item}\n`));
    },
    raw: (value) => {
      if (useJson && typeof value !== 'string') {
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
        return;
      }
      process.stdout.write(`${value}\n`);
    },
    json: (value) => {
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },
    newline: () => {
      process.stdout.write('\n');
    }
  };
}
