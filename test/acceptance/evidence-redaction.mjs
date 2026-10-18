/** Defense for diagnostic text, not a detector for arbitrary unlabelled secrets or a DTO normalizer. */
const marker = '<redacted>';
const fields = 'password|passwd|pwd|(?:access|refresh|id)[_-]?token|token|authorization|proxy-authorization|cookie|set-cookie|(?:x-)?api[_-]?key|client[_-]?secret|otp|_header|rawHeaders';
const sensitiveField = new RegExp(`^(?:${fields})$`, 'iu');
const quoted = String.raw`(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')`;
const quotedValue = new RegExp(`((?<![\\w-])["']?(?:${fields})["']?\\s*[:=]\\s*)(${quoted}(?:\\s*\\+\\s*${quoted})*|\\[(?:${quoted}|[\\s,])*\\])`, 'giu');
const bareValue = new RegExp(`((?<![\\w-])["']?(?:${fields})["']?[ \\t]*[:=][ \\t]*)([^\\s&|,;{}\\]"'<>]+)`, 'giu');
const queryValue = new RegExp(`([?&](?:${fields})=)[^&#\\s"'<>]+`, 'giu');

export function redactEvidence(value, secrets = []) {
  const known = [...new Set(secrets.filter((secret) => typeof secret === 'string' && secret.length > 0)
    .flatMap((secret) => {
      let encoded = secret;
      try { encoded = encodeURIComponent(secret); } catch { /* Literal/JSON variants still cover malformed Unicode. */ }
      return [secret, JSON.stringify(secret).slice(1, -1), encoded, encoded.replace(/%[A-F0-9]{2}/gu, (part) => part.toLowerCase())];
    }))].sort((left, right) => right.length - left.length);
  const redact = (input, depth = 0) => {
    let text = String(input ?? '');
    for (const secret of known) text = text.replaceAll(secret, marker);
    // Decode genuine JSON (including nested serialized HTTP diagnostics), preserving untouched JSON byte-for-byte.
    if (depth < 4 && /^\s*(?:\[|\{|")/u.test(text)) {
      try {
        const parsed = JSON.parse(text);
        let changed = false;
        const walk = (item) => {
          if (typeof item === 'string') {
            const safe = redact(item, depth + 1); changed ||= safe !== item; return safe;
          }
          if (Array.isArray(item)) return item.map(walk);
          if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, value]) => {
            if (sensitiveField.test(key) && value !== null) { changed ||= value !== marker; return [key, marker]; }
            return [key, walk(value)];
          }));
          return item;
        };
        const safe = walk(parsed);
        if (changed) text = JSON.stringify(safe);
      } catch { /* Node inspect / embedded fragments are handled below. */ }
    }
    return text
      .replace(queryValue, `$1${marker}`)
      .replace(/(\bhttps?:\/\/)[^\s/@]+@/giu, `$1${marker}@`)
      .replace(quotedValue, (_match, prefix, value) => `${prefix}${value.startsWith('"') ? `"${marker}"` : `'${marker}'`}`)
      // HTTP diagnostics may prefix a header with an error message. Remove its whole unquoted
      // value before bareValue can erase only "Bearer" or the first cookie segment.
      .replace(/(\b(?:cookie|set-cookie|authorization|proxy-authorization)[ \t]*:[ \t]*)([^\r\n]+)/giu,
        (match, prefix, rest) => /^(?:"|'|\[)/u.test(rest.trimStart()) ? match : `${prefix}${marker}`)
      .replace(/((?<![\w-])(?:authorization|proxy-authorization)[ \t]*=[ \t]*)(?:Bearer|Basic)[ \t]+[^\s"'`,;\]}<>]+/giu, `$1${marker}`)
      .replace(bareValue, `$1${marker}`)
      .replace(/(\bBearer\s+)[^\s"'`,;\]}<>]+/giu, `$1${marker}`);
  };
  return redact(value);
}
