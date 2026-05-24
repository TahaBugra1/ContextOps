const payload = {
  mapping: {
    "A": { id: "A", parent: null, children: ["B"] },
    "B": { id: "B", parent: "A", children: ["C"] },
    "C": { id: "C", parent: "B", children: ["D"] },
    "D": { id: "D", parent: "C", children: ["E"] },
    "E": { id: "E", parent: "D", children: [], message: { author: { role: "user" }, content: { parts: ["Hello"] } } }
  },
  root: "A",
  current_node: "E"
};

function buildPath(mapping, currentNode) {
  const path = [];
  let id = currentNode;
  const guard = new Set();
  while (id && mapping[id] && !guard.has(id)) {
    guard.add(id);
    path.unshift(id);
    id = mapping[id].parent;
  }
  return path;
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function trimConversationPayload(payload, settings) {
  if (!payload || !payload.mapping || !payload.current_node) return null;

  const mapping = payload.mapping;
  const path = buildPath(mapping, payload.current_node);
  if (path.length === 0) return null;

  const visibleIds = path; // Assume all visible for mock
  const limit = settings.limit;

  const keptSet = new Set();
  path.slice(0, 2).forEach(id => keptSet.add(id));

  const targetSubset = visibleIds.slice(-limit);
  if (targetSubset.length > 0) {
    const firstId = targetSubset[0];
    let pathIdx = path.indexOf(firstId);
    if (pathIdx >= 0) {
      path.slice(pathIdx).forEach(id => keptSet.add(id));
    }
  }

  const starredIds = [];
  starredIds.forEach(starId => {
    if (mapping[starId]) keptSet.add(starId);
  });

  if (payload.current_node && !keptSet.has(payload.current_node)) {
    keptSet.add(payload.current_node);
  }

  let root = payload.root;
  if (!keptSet.has(root)) root = path.find(id => keptSet.has(id)) || Array.from(keptSet)[0];

  const newMapping = {};
  Object.keys(mapping).forEach(id => {
    if (keptSet.has(id)) {
      const node = cloneNode(mapping[id]);
      node.children = (node.children || []).filter(c => keptSet.has(c));
      newMapping[id] = node;
    }
  });

  Object.keys(newMapping).forEach(id => {
    const node = newMapping[id];
    if (id === root) {
      node.parent = null;
      return;
    }
    
    if (node.parent && !keptSet.has(node.parent)) {
      let p = node.parent;
      const cycleGuard = new Set();
      while (p && mapping[p] && !keptSet.has(p) && !cycleGuard.has(p)) {
        cycleGuard.add(p);
        p = mapping[p].parent;
      }
      
      let newParentId = p && !cycleGuard.has(p) ? p : null;
      if (!newParentId) newParentId = root;
      if (newParentId === id) newParentId = root !== id ? root : null;
      
      node.parent = newParentId;
      
      if (newParentId && newMapping[newParentId]) {
        const parentNode = newMapping[newParentId];
        if (!parentNode.children) parentNode.children = [];
        if (!parentNode.children.includes(id)) {
          parentNode.children.push(id);
        }
      }
    }
  });

  return {
    json: { ...payload, mapping: newMapping, root, current_node: payload.current_node }
  };
}

const trimmed = trimConversationPayload(payload, { limit: 2 });
console.log(JSON.stringify(trimmed.json, null, 2));
