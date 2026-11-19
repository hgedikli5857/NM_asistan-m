// Sponsor ilişkisinden ağaç kurar. Sponsoru ekipte olmayanlar kök olur; döngülere karşı korumalı.
export function buildTree(members) {
  const byId = new Map(members.map(m => [m.user_id, { ...m, children: [] }]));
  const roots = [];
  for (const n of byId.values()) {
    const parent = n.sponsor_user_id && n.sponsor_user_id !== n.user_id ? byId.get(n.sponsor_user_id) : null;
    if (parent && !isAncestor(n, parent, byId)) parent.children.push(n);
    else roots.push(n);
  }
  // Sahip her zaman en üstte
  roots.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
  return roots;
}

function isAncestor(node, candidateParent, byId) {
  // candidateParent'ın sponsor zincirinde node varsa döngü olur
  let cur = candidateParent; const seen = new Set();
  while (cur && cur.sponsor_user_id && !seen.has(cur.user_id)) {
    seen.add(cur.user_id);
    if (cur.sponsor_user_id === node.user_id) return true;
    cur = byId.get(cur.sponsor_user_id);
  }
  return false;
}
