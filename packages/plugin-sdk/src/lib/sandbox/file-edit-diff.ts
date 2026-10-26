// Embedded in the existing sandbox Node process; no Git, subprocess, or temporary files.
export const FILE_EDIT_DIFF_SCRIPT = String.raw`
function inspectLineDiff(before, after) {
  if (before === after) return { diff: { removed: 0, added: 0 } };
  // Include line terminators so a missing final newline is an actual line change.
  const oldLines = before.match(/[^\n]*\n|[^\n]+$/g) || [];
  const newLines = after.match(/[^\n]*\n|[^\n]+$/g) || [];
  let start = 0, oldEnd = oldLines.length, newEnd = newLines.length;
  while (start < oldEnd && start < newEnd && oldLines[start] === newLines[start]) start++;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const removed = oldEnd - start, added = newEnd - start;
  if (!removed || !added) return { diff: { removed, added } };

  // Myers shortest edit distance needs only a frontier when reporting counts, not a patch.
  // Bound the optional quadratic search on broad rewrites; never limit the edit itself.
  const maxDistance = Math.min(removed + added, 2000);
  const offset = maxDistance + 1;
  const frontier = new Int32Array(2 * maxDistance + 3);
  let work = 0;
  for (let distance = 0; distance <= maxDistance; distance++) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      if (++work > 1000000) return { diffUnavailable: 'comparison_budget_exceeded' };
      const index = offset + diagonal;
      let x = diagonal === -distance || (diagonal !== distance && frontier[index - 1] < frontier[index + 1])
        ? frontier[index + 1]
        : frontier[index - 1] + 1;
      let y = x - diagonal;
      while (x < removed && y < added && oldLines[start + x] === newLines[start + y]) {
        if (++work > 1000000) return { diffUnavailable: 'comparison_budget_exceeded' };
        x++;
        y++;
      }
      if (x >= removed && y >= added) {
        return { diff: { removed: (distance + removed - added) / 2, added: (distance + added - removed) / 2 } };
      }
      frontier[index] = x;
    }
  }
  return { diffUnavailable: 'comparison_budget_exceeded' };
}
`
