export function getOption(options, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      const value = options[name];
      if (Array.isArray(value)) {
        return value[value.length - 1];
      }
      return value;
    }
  }
  return undefined;
}

export function isOptionEnabled(options, ...names) {
  const value = getOption(options, ...names);
  if (value === undefined) {
    return false;
  }
  if (value === true) {
    return true;
  }
  if (typeof value === 'string') {
    return value === '' || value.toLowerCase() === 'true';
  }
  return Boolean(value);
}
