function decodeCursor(cursor) {
  if (!cursor) {
    return { index: 0 };
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed.index !== "number" || parsed.index < 0) {
      return { index: 0 };
    }
    return parsed;
  } catch {
    return { index: 0 };
  }
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function normalizeLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit || "25", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25;
  }
  return Math.min(parsed, 100);
}

function paginate(items, rawCursor, rawLimit) {
  const { index } = decodeCursor(rawCursor);
  const limit = normalizeLimit(rawLimit);
  const data = items.slice(index, index + limit);
  const nextIndex = index + data.length;
  const hasMore = nextIndex < items.length;
  return {
    data,
    hasMore,
    nextCursor: hasMore ? encodeCursor({ index: nextIndex }) : null,
  };
}

module.exports = { paginate, normalizeLimit };
