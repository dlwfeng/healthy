// Keep unrelated facts and layout intact when repairing a reviewed candidate.
export function amendCandidate(
  candidate,
  { replacements = [], title, summary, suggestions },
) {
  if (
    !Array.isArray(replacements) ||
    replacements.length > 20 ||
    (!replacements.length &&
      title === undefined &&
      summary === undefined &&
      suggestions === undefined)
  )
    throw Error("invalid_amendment");
  let html = candidate.html;
  for (const [index, change] of replacements.entries()) {
    const matches =
      change && typeof change.before === "string"
        ? html.split(change.before).length - 1
        : 0;
    if (
      !change ||
      typeof change.before !== "string" ||
      change.before.length < 2 ||
      change.before.length > 24000 ||
      typeof change.after !== "string" ||
      change.after.length > 4000 ||
      matches !== 1
    )
      throw Error(
        `amendment_text_not_unique: replacements[${index}].before 在当前 HTML 中精确匹配 ${matches} 次，需匹配 1 次；请从 candidate.html 原样复制，包含标签和实体，或选更长的唯一片段`,
      );
    html = html.replace(change.before, () => change.after);
  }
  return {
    ...candidate,
    html,
    ...(title === undefined ? {} : { title }),
    ...(summary === undefined ? {} : { summary }),
    ...(suggestions === undefined ? {} : { suggestions }),
  };
}
