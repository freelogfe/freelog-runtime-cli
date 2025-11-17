import ora from 'ora';

export function withSpinner(text, action) {
  if (process.env.FREELOG_CLI_NO_SPINNER === '1' || !process.stdout.isTTY) {
    return action();
  }
  const spinner = ora(text).start();
  const finalize = (status, message) => {
    if (status === 'success') {
      spinner.succeed(message);
    } else if (status === 'warn') {
      spinner.warn(message);
    } else {
      spinner.fail(message);
    }
  };
  return Promise.resolve()
    .then(action)
    .then((result) => {
      finalize('success', text);
      return result;
    })
    .catch((error) => {
      finalize('fail', error.message ?? text);
      throw error;
    });
}
