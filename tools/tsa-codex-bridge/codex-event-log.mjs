const DIAGNOSTIC_PATTERN = /browser security check|permission request|auto[- ]?review|strict auto review|review rejected|declin(?:e|ed)|dismiss(?:ed)?|unavailable|timed? out|timeout|filechooser|mcp error|tool error/i;

export function redactSensitiveEventText(text) {
  return String(text || "")
    .replace(/https:\/\/[^"\\\s]*amazonaws\.com\/[^?"\\\s]+\?[^"\\\s]*/gi, (url) => `${url.split("?")[0]}?[REDACTED]`)
    .replace(/(X-Amz-(?:Security-Token|Credential|Signature)=)[^&"\\\s]*/gi, "$1[REDACTED]");
}

function boundedDiagnosticText(value, limit = 1_600) {
  const matches = [];
  const visit = (current, key = "", depth = 0) => {
    if (depth > 8 || matches.join("\n").length >= limit) return;
    if (typeof current === "string") {
      if (!DIAGNOSTIC_PATTERN.test(current) && !/^(error|message|status|failure_reason)$/i.test(key)) return;
      const match = current.match(DIAGNOSTIC_PATTERN);
      const start = match ? match.index || 0 : 0;
      matches.push(current.slice(start, start + 520));
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current.slice(0, 12)) visit(item, key, depth + 1);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [childKey, child] of Object.entries(current).slice(0, 40)) visit(child, childKey, depth + 1);
  };
  visit(value);
  return redactSensitiveEventText(matches.join("\n")).slice(0, limit) || null;
}

function compactItem(item) {
  if (!item || typeof item !== "object") return null;
  const result = {};
  for (const key of ["id", "type", "status", "server", "tool", "name"]) {
    if (["string", "number", "boolean"].includes(typeof item[key])) result[key] = item[key];
  }
  const diagnostic = boundedDiagnosticText(item);
  if (diagnostic) result.diagnostic = diagnostic;
  return Object.keys(result).length > 0 ? result : null;
}

export function compactCodexEventLine(line, maxLength = 4_000) {
  const source = redactSensitiveEventText(String(line || "").trim());
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    const serialized = JSON.stringify(parsed);
    if (serialized.length <= maxLength) return serialized;
    const compact = {
      type: typeof parsed?.type === "string" ? parsed.type : "codex.event",
      ...(parsed?.thread_id ? { thread_id: String(parsed.thread_id).slice(0, 200) } : {}),
      ...(parsed?.item ? { item: compactItem(parsed.item) } : {}),
      ...(parsed?.usage && typeof parsed.usage === "object" ? { usage: parsed.usage } : {}),
      diagnostic: boundedDiagnosticText(parsed),
      truncated: true,
    };
    let compactSerialized = JSON.stringify(compact);
    if (compactSerialized.length <= maxLength) return compactSerialized;
    delete compact.usage;
    if (compact.diagnostic) compact.diagnostic = compact.diagnostic.slice(0, 600);
    compactSerialized = JSON.stringify(compact);
    if (compactSerialized.length <= maxLength) return compactSerialized;
    return JSON.stringify({ type: compact.type, item: compactItem(parsed?.item), truncated: true });
  } catch {
    let summaryLength = Math.max(0, maxLength - 140);
    let serialized = "";
    do {
      serialized = JSON.stringify({ type: "codex.unparsed", summary: source.slice(0, summaryLength), truncated: source.length > summaryLength });
      summaryLength = Math.max(0, summaryLength - 100);
    } while (serialized.length > maxLength && summaryLength > 0);
    return serialized;
  }
}
