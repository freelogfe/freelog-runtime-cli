/** Select before writes. Unsupported parameters and failed samples must not silently disappear. */
export class SampleUnavailableError extends Error {}

export function fixedTemplateSamples(templates, variation, valueFor, count = 2) {
  const candidates = templates.filter((template) => Array.isArray(template.parameters) && template.parameters.length >= 2)
    .sort((left, right) => right.parameters.length - left.parameters.length
      || String(left.title).localeCompare(String(right.title)));
  if (candidates.length < count) throw new SampleUnavailableError(`Only ${candidates.length} multi-parameter templates available; need ${count}.`);
  return candidates.slice(0, count).map((template) => ({ template, values: template.parameters.map((parameter) => valueFor(parameter, variation)) }));
}
