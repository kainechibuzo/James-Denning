// Receive only navigation already filtered by the shell's role/permission checks.
// Never search a separate unrestricted catalogue or add routes to these results.
export function searchNavigation(entries, query = "") {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  const groups = new Map(entries.filter((entry) => entry.group).map((entry) => [entry.id, entry.group]));
  const matches = new Set(entries.filter((entry) => {
    if (entry.group) return false;
    const searchable = `${entry.label || ""} ${groups.get(entry.gid) || ""}`.toLowerCase();
    return words.every((word) => searchable.includes(word));
  }).map((entry) => entry.id));
  const parentIds = new Set(entries.filter((entry) => matches.has(entry.id)).map((entry) => entry.gid));
  return entries.filter((entry) => entry.group ? parentIds.has(entry.id) : matches.has(entry.id));
}

export function isNavGroupCollapsed(groupId, collapsedGroups, query, expandedSidebar) {
  // Searching temporarily expands matches without changing collapse preferences.
  // Icon-rail mode must still expose the children of previously collapsed groups.
  return Boolean(expandedSidebar && !query.trim() && collapsedGroups.has(groupId));
}
