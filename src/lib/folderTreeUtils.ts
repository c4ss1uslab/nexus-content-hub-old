import { ContentItem } from '../types';

export interface FolderTreeNode {
  id: string;
  name: string;
  fullPath: string[];
  pathKey: string;
  isFolder: boolean;
  tags: string[]; // all tags represented by this node and its descendants
  directTags?: string[];
  nodeTag?: string; // the specific tag matching this node name if any
  itemCount: number; // total unique items in this subtree
  directItemCount: number; // items directly at this exact path
  matchingItemIds: Set<string>;
  children: FolderTreeNode[];
  level: number;
}

/**
 * Extracts folder path segments from a ContentItem.
 * Checks in order:
 * 1. item.folderPath (explicit array)
 * 2. item.notes (regex for bookmark folder markers like "📁 Folder1 > Folder2" or "Imported from bookmark folders:\n📁 ...")
 * 3. Hierarchical tags containing slashes or chevrons (e.g. "dev/frontend/react")
 */
export function extractItemFolderPath(item: ContentItem): string[] {
  // 1. Explicit folderPath array
  if (item.folderPath && Array.isArray(item.folderPath) && item.folderPath.length > 0) {
    const cleaned = item.folderPath
      .map(p => typeof p === 'string' ? p.trim() : '')
      .filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }

  // 2. Parse from notes
  if (item.notes && typeof item.notes === 'string') {
    const noteLines = item.notes.split('\n');
    for (const line of noteLines) {
      // Look for 📁 folder marker
      const folderMatch = line.match(/(?:Imported from bookmark folders:)?\s*📁\s*([^\r\n]+)/i);
      if (folderMatch && folderMatch[1]) {
        const rawPath = folderMatch[1].trim();
        // Split by >, /, ›, →, or \
        const segments = rawPath
          .split(/\s*(?:>|\/|›|→|\\)\s*/)
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);
        if (segments.length > 0) {
          return segments;
        }
      }
    }
  }

  // 3. Look for hierarchical tags with slashes or chevrons (e.g., "tech/web/react" or "tech > web > react")
  if (item.tags && Array.isArray(item.tags)) {
    for (const tag of item.tags) {
      if (tag.includes('/') || tag.includes('>') || tag.includes('›') || tag.includes('→')) {
        const segments = tag
          .split(/\s*(?:\/|>|›|→)\s*/)
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);
        if (segments.length > 1) {
          return segments;
        }
      }
    }
  }

  return [];
}

/**
 * Builds a hierarchical tree of folder tags ("tags within tags within tags...")
 * from the content items and their tags / bookmark folder structures.
 */
export function buildFolderTree(
  items: ContentItem[],
  standaloneTagsOnly: boolean = false,
  tagToSupertagMap?: Map<string, string[]>
): FolderTreeNode[] {
  // Helper internal node structure for tree construction
  interface MutableNode {
    id: string;
    name: string;
    fullPath: string[];
    pathKey: string;
    isFolder: boolean;
    nodeTag?: string;
    directItemIds: Set<string>;
    allItemIds: Set<string>;
    tagsSet: Set<string>;
    childrenMap: Map<string, MutableNode>;
    level: number;
  }

  const rootChildren = new Map<string, MutableNode>();
  const unfiledTagNodes = new Map<string, MutableNode>();

  const activeItems = items.filter(item => !item.archived);

  for (const item of activeItems) {
    const folderPath = extractItemFolderPath(item);
    const itemTags = (item.tags || []).map(t => t.trim().toLowerCase()).filter(Boolean);

    if (folderPath.length > 0) {
      // Traverse down the tree branch for this item's folder path
      let currentMap = rootChildren;
      const currentPath: string[] = [];

      for (let i = 0; i < folderPath.length; i++) {
        const seg = folderPath[i];
        const isLeaf = i === folderPath.length - 1;
        currentPath.push(seg);
        const pathKey = currentPath.join(' > ');
        const nodeId = `folder:${pathKey}`;

        if (!currentMap.has(seg)) {
          currentMap.set(seg, {
            id: nodeId,
            name: seg,
            fullPath: [...currentPath],
            pathKey,
            isFolder: true,
            nodeTag: seg,
            directItemIds: new Set(),
            allItemIds: new Set(),
            tagsSet: new Set([seg]),
            childrenMap: new Map(),
            level: i
          });
        }

        const node = currentMap.get(seg)!;
        node.allItemIds.add(item.id);
        node.tagsSet.add(seg);

        if (isLeaf) {
          node.directItemIds.add(item.id);

          // If the item has additional tags that weren't in the folder path,
          // attach them as child tags under this leaf folder!
          for (const t of itemTags) {
            if (!currentPath.includes(t)) {
              if (standaloneTagsOnly && tagToSupertagMap && tagToSupertagMap.has(t)) {
                continue; // Skip if it's already in a supertag when standaloneOnly is true
              }
              const childTagPath = [...currentPath, t];
              const childKey = childTagPath.join(' > ');
              const childId = `tag:${childKey}#${t}`;

              if (!node.childrenMap.has(t)) {
                node.childrenMap.set(t, {
                  id: childId,
                  name: t,
                  fullPath: childTagPath,
                  pathKey: childKey,
                  isFolder: false,
                  nodeTag: t,
                  directItemIds: new Set(),
                  allItemIds: new Set(),
                  tagsSet: new Set([t]),
                  childrenMap: new Map(),
                  level: i + 1
                });
              }
              const childNode = node.childrenMap.get(t)!;
              childNode.directItemIds.add(item.id);
              childNode.allItemIds.add(item.id);
            }
          }
        }

        currentMap = node.childrenMap;
      }
    } else {
      // Item has no explicit folder path — its tags go into root/unfiled tags
      for (const t of itemTags) {
        if (standaloneTagsOnly && tagToSupertagMap && tagToSupertagMap.has(t)) {
          continue;
        }

        if (!unfiledTagNodes.has(t)) {
          unfiledTagNodes.set(t, {
            id: `tag:root#${t}`,
            name: t,
            fullPath: [t],
            pathKey: t,
            isFolder: false,
            nodeTag: t,
            directItemIds: new Set(),
            allItemIds: new Set(),
            tagsSet: new Set([t]),
            childrenMap: new Map(),
            level: 0
          });
        }
        const tagNode = unfiledTagNodes.get(t)!;
        tagNode.directItemIds.add(item.id);
        tagNode.allItemIds.add(item.id);
      }
    }
  }

  // Convert mutable tree to FolderTreeNode
  function convertNode(mutable: MutableNode): FolderTreeNode {
    const childrenList = Array.from(mutable.childrenMap.values()).map(convertNode);

    // Sort children: folders first, then alphabetically
    childrenList.sort((a, b) => {
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Accumulate all descendant tags
    const allTags = new Set(mutable.tagsSet);
    childrenList.forEach(child => {
      child.tags.forEach(t => allTags.add(t));
      child.matchingItemIds.forEach(id => mutable.allItemIds.add(id));
    });

    return {
      id: mutable.id,
      name: mutable.name,
      fullPath: mutable.fullPath,
      pathKey: mutable.pathKey,
      isFolder: mutable.isFolder,
      nodeTag: mutable.nodeTag,
      tags: Array.from(allTags),
      directTags: mutable.nodeTag ? [mutable.nodeTag] : [],
      itemCount: mutable.allItemIds.size,
      directItemCount: mutable.directItemIds.size,
      matchingItemIds: mutable.allItemIds,
      children: childrenList,
      level: mutable.level
    };
  }

  const result: FolderTreeNode[] = [];

  // 1. Add folder hierarchy nodes
  const folderNodes = Array.from(rootChildren.values()).map(convertNode);
  folderNodes.sort((a, b) => {
    // Sort by item count descending, then name
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
    return a.name.localeCompare(b.name);
  });
  result.push(...folderNodes);

  // 2. Add unfiled/standalone tags if any exist and aren't in folder trees
  const unfiledList = Array.from(unfiledTagNodes.values())
    .map(convertNode)
    .filter(node => !rootChildren.has(node.name)); // Avoid duplicate root tags if already a folder

  if (unfiledList.length > 0) {
    unfiledList.sort((a, b) => {
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
      return a.name.localeCompare(b.name);
    });

    // Create a virtual container for unfiled/standalone tags if there are folder trees,
    // or include directly if there are no folder trees
    if (folderNodes.length > 0) {
      const allUnfiledItemIds = new Set<string>();
      const allUnfiledTags = new Set<string>();
      unfiledList.forEach(node => {
        node.matchingItemIds.forEach(id => allUnfiledItemIds.add(id));
        node.tags.forEach(t => allUnfiledTags.add(t));
      });

      result.push({
        id: 'folder:unfiled-tags-root',
        name: 'other-standalone-tags',
        fullPath: ['other-standalone-tags'],
        pathKey: 'other-standalone-tags',
        isFolder: true,
        nodeTag: undefined,
        tags: Array.from(allUnfiledTags),
        directTags: [],
        itemCount: allUnfiledItemIds.size,
        directItemCount: 0,
        matchingItemIds: allUnfiledItemIds,
        children: unfiledList,
        level: 0
      });
    } else {
      result.push(...unfiledList);
    }
  }

  return result;
}

/**
 * Filter tree by a search term (matches node names or child node names)
 */
export function filterTreeBySearch(nodes: FolderTreeNode[], query: string): FolderTreeNode[] {
  if (!query.trim()) return nodes;
  const q = query.toLowerCase().trim();

  function filterNode(node: FolderTreeNode): FolderTreeNode | null {
    const nameMatches = node.name.toLowerCase().includes(q);
    const pathMatches = node.pathKey.toLowerCase().includes(q);

    const filteredChildren: FolderTreeNode[] = [];
    for (const child of node.children) {
      const filteredChild = filterNode(child);
      if (filteredChild) {
        filteredChildren.push(filteredChild);
      }
    }

    if (nameMatches || pathMatches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren
      };
    }
    return null;
  }

  return nodes.map(filterNode).filter(Boolean) as FolderTreeNode[];
}

/**
 * Checks if a ContentItem matches any of the active selected tags or folder filters.
 * Supports:
 * - Direct tag matching (exact match, case-insensitive)
 * - Hierarchical tag segment matching (e.g., tag "tech/react" matches "react" or "tech")
 * - Folder path matching from item.folderPath or parsed bookmark notes
 */
export function itemMatchesTags(item: ContentItem, selectedTags: string[]): boolean {
  if (!selectedTags || selectedTags.length === 0) return true;

  const normalizedSelected = selectedTags
    .map(t => typeof t === 'string' ? t.trim().toLowerCase() : '')
    .filter(Boolean);

  if (normalizedSelected.length === 0) return true;

  // 1. Direct item tags matching
  if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
    for (const rawTag of item.tags) {
      if (typeof rawTag !== 'string') continue;
      const cleanTag = rawTag.trim().toLowerCase();
      if (normalizedSelected.includes(cleanTag)) {
        return true;
      }
      // If tag is hierarchical like "tech/web/react" or "tech > web > react"
      if (cleanTag.includes('/') || cleanTag.includes('>') || cleanTag.includes('›') || cleanTag.includes('→') || cleanTag.includes('\\')) {
        const segments = cleanTag
          .split(/\s*(?:\/|>|›|→|\\)\s*/)
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);
        if (segments.some(seg => normalizedSelected.includes(seg))) {
          return true;
        }
      }
    }
  }

  // 2. Explicit folderPath array
  if (item.folderPath && Array.isArray(item.folderPath) && item.folderPath.length > 0) {
    for (const folder of item.folderPath) {
      if (typeof folder === 'string' && normalizedSelected.includes(folder.trim().toLowerCase())) {
        return true;
      }
    }
  }

  // 3. Extracted folder path from notes (e.g. bookmark imported items)
  const extractedPath = extractItemFolderPath(item);
  if (extractedPath.some(seg => normalizedSelected.includes(seg.toLowerCase()))) {
    return true;
  }

  return false;
}

