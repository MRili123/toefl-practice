export type DiffPart = { text: string; op: "same" | "add" | "del" };

/**
 * Word-level differences between two texts (longest common subsequence of words, case and punctuation kept).
 * Whitespace and line breaks of the new text are preserved, so paragraphs still read as paragraphs.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const wa = a.filter((t) => !/^\s+$/.test(t));
  const wb = b.filter((t) => !/^\s+$/.test(t));
  const n = wa.length, m = wb.length;
  // lcs[i][j] = length of the common subsequence of wa[i..] and wb[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = wa[i] === wb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  // Walk both texts; whitespace comes from the new text.
  const out: DiffPart[] = [];
  const push = (text: string, op: DiffPart["op"]) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ text, op });
  };
  let i = 0, j = 0, k = 0; // k walks b including whitespace
  const nextSpace = () => {
    while (k < b.length && /^\s+$/.test(b[k])) push(b[k++], "same");
  };
  while (i < n || j < m) {
    nextSpace();
    if (i < n && j < m && wa[i] === wb[j]) {
      push(b[k++], "same");
      i++;
      j++;
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      push(b[k++], "add");
      j++;
    } else {
      push(`${wa[i]} `, "del");
      i++;
    }
  }
  nextSpace();
  return groupChanges(out);
}

/**
 * Turns word-by-word changes into readable phrases: each changed stretch (words that changed, with only spaces
 * between them) becomes the removed phrase followed by the added phrase.
 */
function groupChanges(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  let i = 0;
  while (i < parts.length) {
    if (parts[i].op === "same") {
      out.push(parts[i++]);
      continue;
    }
    let del = "", add = "";
    let j = i;
    while (j < parts.length && (parts[j].op !== "same" || (/^\s+$/.test(parts[j].text) && parts[j + 1] && parts[j + 1].op !== "same"))) {
      const p = parts[j++];
      if (p.op === "del") del += p.text;
      else if (p.op === "add") add += p.text;
      else add += p.text; // a space inside the new phrase
    }
    if (del.trim()) out.push({ text: del, op: "del" });
    if (add.trim()) out.push({ text: add, op: "add" });
    else if (add) out.push({ text: add, op: "same" });
    i = j;
  }
  return out;
}
