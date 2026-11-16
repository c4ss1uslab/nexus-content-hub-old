import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp,
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { Supertag, TagSubCluster } from '../types';
import { handleFirestoreError, OperationType } from './utils';

export const supertagService = {
  /**
   * Helper: Returns all unique tags belonging to a supertag (both top-level tags and tags inside sub-clusters)
   */
  getAllSupertagTags(st: Supertag): string[] {
    const set = new Set<string>();
    (st.tags || []).forEach(t => {
      const clean = t.trim().toLowerCase().replace(/^#+/, '');
      if (clean) set.add(clean);
    });
    (st.subClusters || []).forEach(sc => {
      (sc.tags || []).forEach(t => {
        const clean = t.trim().toLowerCase().replace(/^#+/, '');
        if (clean) set.add(clean);
      });
    });
    return Array.from(set);
  },

  subscribe(userId: string, callback: (supertags: Supertag[]) => void) {
    if (!userId) {
      callback([]);
      return () => {};
    }

    const q = query(
      collection(db, 'supertags'),
      where('userId', '==', userId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Supertag[];
        
        // Sort by order if set, otherwise fallback to alphabetical
        list.sort((a, b) => {
          if (typeof a.order === 'number' && typeof b.order === 'number') {
            return a.order - b.order;
          }
          if (typeof a.order === 'number') return -1;
          if (typeof b.order === 'number') return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(auth, error, OperationType.LIST, 'supertags');
      }
    );
  },

  async create(userId: string, data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    tags?: string[];
    subClusters?: TagSubCluster[];
    order?: number;
  }): Promise<string> {
    const cleanName = data.name.trim();
    if (!cleanName) throw new Error('Supertag name cannot be empty');

    // Clean tags
    const cleanTags = Array.from(
      new Set(
        (data.tags || [])
          .map(t => t.trim().toLowerCase().replace(/^#+/, ''))
          .filter(Boolean)
      )
    );

    try {
      const docRef = await addDoc(collection(db, 'supertags'), {
        userId,
        name: cleanName,
        description: data.description || '',
        color: data.color || '#6366F1',
        icon: data.icon || 'folder',
        tags: cleanTags,
        subClusters: data.subClusters || [],
        order: typeof data.order === 'number' ? data.order : Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.CREATE, 'supertags');
      throw error;
    }
  },

  async update(id: string, changes: Partial<Omit<Supertag, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) {
    const payload: any = {
      ...changes,
      updatedAt: serverTimestamp(),
    };
    if (changes.name) {
      payload.name = changes.name.trim();
    }
    if (changes.tags) {
      payload.tags = Array.from(new Set(changes.tags.map(t => t.trim().toLowerCase().replace(/^#+/, '')).filter(Boolean)));
    }

    try {
      await updateDoc(doc(db, 'supertags', id), payload);
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, `supertags/${id}`);
    }
  },

  async rename(id: string, newName: string) {
    const cleanName = newName.trim();
    if (!cleanName) throw new Error('Supertag name cannot be empty');
    return this.update(id, { name: cleanName });
  },

  async reorderSupertags(userId: string, orderedIds: string[]) {
    if (!orderedIds || orderedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'supertags', id), {
          order: index,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, 'supertags/reorder');
      throw error;
    }
  },

  async delete(id: string) {
    try {
      await deleteDoc(doc(db, 'supertags', id));
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.DELETE, `supertags/${id}`);
    }
  },

  async addTagToSupertag(supertagId: string, tag: string, allSupertags: Supertag[]) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    const targetSupertag = allSupertags.find(s => s.id === supertagId);
    if (!targetSupertag) return;

    const existingTags = targetSupertag.tags || [];
    const allTags = this.getAllSupertagTags(targetSupertag);
    if (allTags.includes(cleanTag)) return;

    await updateDoc(doc(db, 'supertags', supertagId), {
      tags: [...existingTags, cleanTag],
      updatedAt: serverTimestamp(),
    });
  },

  async removeTagFromSupertag(supertagId: string, tag: string, allSupertags: Supertag[]) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    const targetSupertag = allSupertags.find(s => s.id === supertagId);
    if (!targetSupertag) return;

    const updatedTags = (targetSupertag.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag);
    const updatedSubClusters = (targetSupertag.subClusters || []).map(sc => ({
      ...sc,
      tags: (sc.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag)
    }));

    await updateDoc(doc(db, 'supertags', supertagId), {
      tags: updatedTags,
      subClusters: updatedSubClusters,
      updatedAt: serverTimestamp(),
    });
  },

  async setTagSupertags(tag: string, targetSupertagIds: string[], allSupertags: Supertag[]) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    const targetSet = new Set(targetSupertagIds);
    const batch = writeBatch(db);
    let hasChanges = false;

    for (const st of allSupertags) {
      const allTags = this.getAllSupertagTags(st);
      const hasTag = allTags.includes(cleanTag);
      const shouldHaveTag = targetSet.has(st.id);

      if (hasTag && !shouldHaveTag) {
        const updatedTags = (st.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag);
        const updatedSubClusters = (st.subClusters || []).map(sc => ({
          ...sc,
          tags: (sc.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag)
        }));
        batch.update(doc(db, 'supertags', st.id), {
          tags: updatedTags,
          subClusters: updatedSubClusters,
          updatedAt: serverTimestamp(),
        });
        hasChanges = true;
      } else if (!hasTag && shouldHaveTag) {
        const updated = [...(st.tags || []), cleanTag];
        batch.update(doc(db, 'supertags', st.id), {
          tags: updated,
          updatedAt: serverTimestamp(),
        });
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await batch.commit();
    }
  },

  async moveTag(fromSupertagId: string | null, toSupertagId: string, tag: string, allSupertags: Supertag[]) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    const batch = writeBatch(db);

    // Remove from previous supertag if applicable
    if (fromSupertagId) {
      const fromSupertag = allSupertags.find(s => s.id === fromSupertagId);
      if (fromSupertag) {
        const remainingTags = (fromSupertag.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag);
        const remainingSubClusters = (fromSupertag.subClusters || []).map(sc => ({
          ...sc,
          tags: (sc.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag)
        }));
        batch.update(doc(db, 'supertags', fromSupertagId), {
          tags: remainingTags,
          subClusters: remainingSubClusters,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Add to new supertag
    const toSupertag = allSupertags.find(s => s.id === toSupertagId);
    if (toSupertag) {
      const allToTags = this.getAllSupertagTags(toSupertag);
      if (!allToTags.includes(cleanTag)) {
        batch.update(doc(db, 'supertags', toSupertagId), {
          tags: [...(toSupertag.tags || []), cleanTag],
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  },

  async copyTagToSupertag(toSupertagId: string, tag: string, allSupertags: Supertag[]) {
    return this.addTagToSupertag(toSupertagId, tag, allSupertags);
  },

  async batchAssignTags(
    assignments: Array<{ supertagId: string; tag: string }>,
    allSupertags: Supertag[]
  ) {
    if (assignments.length === 0) return;

    const supertagMap = new Map<string, Set<string>>();
    allSupertags.forEach(s => {
      supertagMap.set(s.id, new Set(this.getAllSupertagTags(s)));
    });

    for (const item of assignments) {
      const cleanTag = item.tag.trim().toLowerCase().replace(/^#+/, '');
      if (!cleanTag) continue;

      if (supertagMap.has(item.supertagId)) {
        supertagMap.get(item.supertagId)!.add(cleanTag);
      }
    }

    const batch = writeBatch(db);
    let changed = false;

    for (const [sId, tagSet] of supertagMap.entries()) {
      const st = allSupertags.find(s => s.id === sId);
      if (!st) continue;
      const originalAll = new Set(this.getAllSupertagTags(st));
      const newTagsToAdd = Array.from(tagSet).filter(t => !originalAll.has(t));

      if (newTagsToAdd.length > 0) {
        batch.update(doc(db, 'supertags', sId), {
          tags: Array.from(new Set([...(st.tags || []), ...newTagsToAdd])),
          updatedAt: serverTimestamp(),
        });
        changed = true;
      }
    }

    if (changed) {
      await batch.commit();
    }
  },

  // ==========================================
  // SUB-CLUSTER MANAGEMENT
  // ==========================================

  /**
   * Create a new sub-cluster within a supertag.
   * If initialTags are in top-level st.tags, they are moved into the sub-cluster.
   */
  async createSubCluster(
    supertagId: string,
    name: string,
    initialTags: string[],
    allSupertags: Supertag[],
    color?: string
  ): Promise<string> {
    const cleanName = name.trim().replace(/^#+/, '');
    if (!cleanName) throw new Error('Sub-cluster name cannot be empty');

    const st = allSupertags.find(s => s.id === supertagId);
    if (!st) throw new Error('Supertag not found');

    const cleanInitialTags = Array.from(
      new Set(initialTags.map(t => t.trim().toLowerCase().replace(/^#+/, '')).filter(Boolean))
    );

    const subClusterId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubCluster: TagSubCluster = {
      id: subClusterId,
      name: cleanName,
      tags: cleanInitialTags,
      color: color || st.color || '#6366F1',
      order: (st.subClusters?.length || 0)
    };

    // Remove the initial tags from top-level st.tags so they reside cleanly inside the sub-cluster
    const remainingTopTags = (st.tags || []).filter(t => !cleanInitialTags.includes(t.toLowerCase().trim()));
    const existingSubClusters = st.subClusters || [];

    await updateDoc(doc(db, 'supertags', supertagId), {
      tags: remainingTopTags,
      subClusters: [...existingSubClusters, newSubCluster],
      updatedAt: serverTimestamp(),
    });

    return subClusterId;
  },

  /**
   * Rename a sub-cluster within a supertag
   */
  async renameSubCluster(
    supertagId: string,
    subClusterId: string,
    newName: string,
    allSupertags: Supertag[]
  ) {
    const cleanName = newName.trim().replace(/^#+/, '');
    if (!cleanName) throw new Error('Sub-cluster name cannot be empty');

    const st = allSupertags.find(s => s.id === supertagId);
    if (!st || !st.subClusters) return;

    const updatedSubClusters = st.subClusters.map(sc => {
      if (sc.id === subClusterId) {
        return { ...sc, name: cleanName };
      }
      return sc;
    });

    await updateDoc(doc(db, 'supertags', supertagId), {
      subClusters: updatedSubClusters,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Delete a sub-cluster within a supertag.
   * If dissolveTagsToParent is true, all tags in the sub-cluster are returned to top-level st.tags.
   */
  async deleteSubCluster(
    supertagId: string,
    subClusterId: string,
    dissolveTagsToParent: boolean,
    allSupertags: Supertag[]
  ) {
    const st = allSupertags.find(s => s.id === supertagId);
    if (!st || !st.subClusters) return;

    const targetSc = st.subClusters.find(sc => sc.id === subClusterId);
    if (!targetSc) return;

    const remainingSubClusters = st.subClusters.filter(sc => sc.id !== subClusterId);
    let updatedTopTags = st.tags || [];

    if (dissolveTagsToParent && targetSc.tags && targetSc.tags.length > 0) {
      updatedTopTags = Array.from(new Set([...updatedTopTags, ...targetSc.tags]));
    }

    await updateDoc(doc(db, 'supertags', supertagId), {
      tags: updatedTopTags,
      subClusters: remainingSubClusters,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Move a tag into a target sub-cluster within a supertag
   * (Removes the tag from top-level tags or other sub-clusters in the supertag)
   */
  async moveTagToSubCluster(
    supertagId: string,
    tag: string,
    targetSubClusterId: string,
    allSupertags: Supertag[]
  ) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    const st = allSupertags.find(s => s.id === supertagId);
    if (!st) return;

    // Remove from top-level tags
    const remainingTopTags = (st.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag);

    // Update subclusters: remove from other subclusters and add to target
    const updatedSubClusters = (st.subClusters || []).map(sc => {
      if (sc.id === targetSubClusterId) {
        const scTags = (sc.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag);
        return { ...sc, tags: [...scTags, cleanTag] };
      } else {
        return {
          ...sc,
          tags: (sc.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag)
        };
      }
    });

    await updateDoc(doc(db, 'supertags', supertagId), {
      tags: remainingTopTags,
      subClusters: updatedSubClusters,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Move a tag out of a sub-cluster back to the top-level supertag area
   */
  async moveTagFromSubClusterToTopLevel(
    supertagId: string,
    subClusterId: string,
    tag: string,
    allSupertags: Supertag[]
  ) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    const st = allSupertags.find(s => s.id === supertagId);
    if (!st) return;

    const updatedSubClusters = (st.subClusters || []).map(sc => {
      if (sc.id === subClusterId) {
        return {
          ...sc,
          tags: (sc.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag)
        };
      }
      return sc;
    });

    const updatedTopTags = Array.from(new Set([...(st.tags || []), cleanTag]));

    await updateDoc(doc(db, 'supertags', supertagId), {
      tags: updatedTopTags,
      subClusters: updatedSubClusters,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Remove a tag from a specific sub-cluster
   */
  async removeTagFromSubCluster(
    supertagId: string,
    subClusterId: string,
    tag: string,
    allSupertags: Supertag[]
  ) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    const st = allSupertags.find(s => s.id === supertagId);
    if (!st || !st.subClusters) return;

    const updatedSubClusters = st.subClusters.map(sc => {
      if (sc.id === subClusterId) {
        return {
          ...sc,
          tags: (sc.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag)
        };
      }
      return sc;
    });

    await updateDoc(doc(db, 'supertags', supertagId), {
      subClusters: updatedSubClusters,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Add a new tag directly to a sub-cluster
   */
  async addTagToSubCluster(
    supertagId: string,
    subClusterId: string,
    tag: string,
    allSupertags: Supertag[]
  ) {
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    const st = allSupertags.find(s => s.id === supertagId);
    if (!st) return;

    const updatedSubClusters = (st.subClusters || []).map(sc => {
      if (sc.id === subClusterId) {
        const scTags = sc.tags || [];
        if (!scTags.some(t => t.toLowerCase().trim() === cleanTag)) {
          return { ...sc, tags: [...scTags, cleanTag] };
        }
      }
      return sc;
    });

    // Also ensure removed from top-level if it was there
    const remainingTopTags = (st.tags || []).filter(t => t.toLowerCase().trim() !== cleanTag);

    await updateDoc(doc(db, 'supertags', supertagId), {
      tags: remainingTopTags,
      subClusters: updatedSubClusters,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Replicates folders and sub-folders from the Nested Tree View into Supertags and Sub-Clusters.
   * - Root folder nodes become Supertags (or enrich existing matching Supertags).
   * - Child folders with sub-folders or descendant tags become Sub-Clusters within that Supertag.
   * - Leaf child folders or direct tags without sub-folders become direct tags in the Supertag.
   * - Existing supertags and sub-clusters are preserved and enriched with missing tags!
   */
  async replicateNestedTreeToSupertags(
    userId: string,
    rootNodes: Array<{
      id: string;
      name: string;
      isFolder: boolean;
      tags: string[];
      nodeTag?: string;
      children?: Array<{
        id: string;
        name: string;
        isFolder: boolean;
        tags: string[];
        nodeTag?: string;
        children?: any[];
      }>;
    }>,
    existingSupertags: Supertag[]
  ): Promise<{
    createdCount: number;
    updatedCount: number;
    subClustersCreatedCount: number;
    subClustersUpdatedCount: number;
    tagsAddedCount: number;
    details: Array<{ supertagName: string; status: 'created' | 'updated'; subClustersCount: number; tagsCount: number }>;
  }> {
    if (!userId || !rootNodes || rootNodes.length === 0) {
      return {
        createdCount: 0,
        updatedCount: 0,
        subClustersCreatedCount: 0,
        subClustersUpdatedCount: 0,
        tagsAddedCount: 0,
        details: []
      };
    }

    let createdCount = 0;
    let updatedCount = 0;
    let subClustersCreatedCount = 0;
    let subClustersUpdatedCount = 0;
    let tagsAddedCount = 0;
    const details: Array<{ supertagName: string; status: 'created' | 'updated'; subClustersCount: number; tagsCount: number }> = [];

    // Helper to clean tag strings
    const cleanStr = (s: string) => s.trim().toLowerCase().replace(/^#+/, '');

    // Helper to strip emoji/special characters for robust matching
    const stripEmoji = (str: string) => {
      return str
        .toLowerCase()
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[#@_./\-+\s]+/g, '')
        .trim();
    };

    // Filter out unfiled/virtual nodes
    const realRootNodes = rootNodes.filter(node => node.id !== 'folder:unfiled-tags-root' && node.name !== 'other-standalone-tags');

    // Color palette for newly generated supertags
    const COLOR_PALETTE = ['#6366F1', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#14B8A6', '#F97316'];

    for (let index = 0; index < realRootNodes.length; index++) {
      const rootNode = realRootNodes[index];
      const rootNameClean = rootNode.name.trim();
      const rootNameLower = rootNameClean.toLowerCase();
      const rootNameStripped = stripEmoji(rootNameClean);

      // Find if an existing supertag matches this root node
      const matchedSupertag = existingSupertags.find(st => {
        const stNameClean = st.name.trim();
        const stNameLower = stNameClean.toLowerCase();
        const stNameStripped = stripEmoji(stNameClean);

        if (stNameLower === rootNameLower) return true;
        if (rootNameStripped && stNameStripped && (rootNameStripped === stNameStripped)) return true;
        if (stNameClean.includes(rootNameClean) || rootNameClean.includes(stNameClean)) return true;
        if ((st.tags || []).some(t => cleanStr(t) === rootNameLower)) return true;
        return false;
      });

      // Prepare existing or initial data
      const supertagId = matchedSupertag ? matchedSupertag.id : null;
      const initialTags = matchedSupertag ? [...(matchedSupertag.tags || [])] : [];
      const initialSubClusters: TagSubCluster[] = matchedSupertag ? [...(matchedSupertag.subClusters || [])] : [];

      const topLevelTagsSet = new Set<string>(initialTags.map(cleanStr).filter(Boolean));
      const subClustersMap = new Map<string, TagSubCluster>();

      // Index existing subclusters by stripped name and lower name
      initialSubClusters.forEach(sc => {
        const key = sc.name.trim().toLowerCase();
        subClustersMap.set(key, { ...sc, tags: [...(sc.tags || [])] });
      });

      const children = rootNode.children || [];

      for (const child of children) {
        const childNameClean = child.name.trim();
        const childNameLower = childNameClean.toLowerCase();
        const childNameStripped = stripEmoji(childNameClean);
        const hasGrandChildren = child.children && child.children.length > 0;

        // Collect all descendant tags within this child branch
        const collectedChildTags = new Set<string>();

        // Add child's direct tag if valid
        const childTagClean = cleanStr(child.nodeTag || childNameClean);
        if (childTagClean) {
          collectedChildTags.add(childTagClean);
        }

        // Add all node tags represented in child.tags
        (child.tags || []).forEach(t => {
          const c = cleanStr(t);
          if (c) collectedChildTags.add(c);
        });

        // Add tags from any sub-children
        function collectNestedTags(n: any) {
          if (n.nodeTag) {
            const c = cleanStr(n.nodeTag);
            if (c) collectedChildTags.add(c);
          }
          if (n.name) {
            const c = cleanStr(n.name);
            if (c) collectedChildTags.add(c);
          }
          if (n.tags && Array.isArray(n.tags)) {
            n.tags.forEach((t: string) => {
              const c = cleanStr(t);
              if (c) collectedChildTags.add(c);
            });
          }
          if (n.children && Array.isArray(n.children)) {
            n.children.forEach(collectNestedTags);
          }
        }

        if (child.children && Array.isArray(child.children)) {
          child.children.forEach(collectNestedTags);
        }

        // Check if this child represents a sub-cluster (has sub-folders or is marked as folder with children)
        if (hasGrandChildren || (child.isFolder && collectedChildTags.size > 1)) {
          // Find matching existing sub-cluster
          let existingScKey: string | null = null;
          for (const [key, sc] of subClustersMap.entries()) {
            const scLower = sc.name.trim().toLowerCase();
            const scStripped = stripEmoji(sc.name);
            if (scLower === childNameLower || (childNameStripped && scStripped && scStripped === childNameStripped)) {
              existingScKey = key;
              break;
            }
          }

          if (existingScKey) {
            // Update existing sub-cluster: merge newly collected tags
            const existingSc = subClustersMap.get(existingScKey)!;
            const existingTagsSet = new Set((existingSc.tags || []).map(cleanStr).filter(Boolean));
            let addedToSc = 0;

            collectedChildTags.forEach(t => {
              if (!existingTagsSet.has(t)) {
                existingTagsSet.add(t);
                addedToSc++;
              }
            });

            existingSc.tags = Array.from(existingTagsSet);
            if (addedToSc > 0) {
              subClustersUpdatedCount++;
              tagsAddedCount += addedToSc;
            }
          } else {
            // Create a new sub-cluster inside this supertag
            const newScId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const scColor = matchedSupertag?.color || COLOR_PALETTE[index % COLOR_PALETTE.length];
            const newSc: TagSubCluster = {
              id: newScId,
              name: childNameClean,
              tags: Array.from(collectedChildTags),
              color: scColor,
              order: subClustersMap.size
            };
            subClustersMap.set(childNameLower, newSc);
            subClustersCreatedCount++;
            tagsAddedCount += collectedChildTags.size;
          }
        } else {
          // Leaf node / folder without sub-folders (e.g. 🧪 or 🛠)
          // Add to top-level supertag tags
          collectedChildTags.forEach(t => {
            if (!topLevelTagsSet.has(t)) {
              topLevelTagsSet.add(t);
              tagsAddedCount++;
            }
          });
        }
      }

      // Prepare final list of sub-clusters
      const finalSubClusters = Array.from(subClustersMap.values());

      // Ensure that any tag that belongs to a sub-cluster is not duplicated in top-level tags
      const allSubClusterTagsSet = new Set<string>();
      finalSubClusters.forEach(sc => {
        (sc.tags || []).forEach(t => allSubClusterTagsSet.add(cleanStr(t)));
      });

      const finalTopLevelTags = Array.from(topLevelTagsSet).filter(t => !allSubClusterTagsSet.has(t));

      // Also ensure root node tag itself is represented if no tags exist
      if (finalTopLevelTags.length === 0 && finalSubClusters.length === 0) {
        const rootTag = cleanStr(rootNode.nodeTag || rootNameClean);
        if (rootTag) finalTopLevelTags.push(rootTag);
      }

      if (matchedSupertag) {
        // Update existing supertag
        await updateDoc(doc(db, 'supertags', matchedSupertag.id), {
          tags: finalTopLevelTags,
          subClusters: finalSubClusters,
          updatedAt: serverTimestamp(),
        });
        updatedCount++;
        details.push({
          supertagName: matchedSupertag.name,
          status: 'updated',
          subClustersCount: finalSubClusters.length,
          tagsCount: finalTopLevelTags.length + allSubClusterTagsSet.size
        });
      } else {
        // Create new supertag
        const newColor = COLOR_PALETTE[(existingSupertags.length + createdCount) % COLOR_PALETTE.length];
        await addDoc(collection(db, 'supertags'), {
          userId,
          name: rootNameClean,
          description: `Imported from nested folder structure: ${rootNameClean}`,
          color: newColor,
          icon: 'folder',
          tags: finalTopLevelTags,
          subClusters: finalSubClusters,
          order: existingSupertags.length + createdCount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        createdCount++;
        details.push({
          supertagName: rootNameClean,
          status: 'created',
          subClustersCount: finalSubClusters.length,
          tagsCount: finalTopLevelTags.length + allSubClusterTagsSet.size
        });
      }
    }

    return {
      createdCount,
      updatedCount,
      subClustersCreatedCount,
      subClustersUpdatedCount,
      tagsAddedCount,
      details
    };
  },

  /**
   * Replicates a single nested folder node (and its child branches) into a Supertag.
   */
  async replicateSingleNodeToSupertag(
    userId: string,
    node: {
      id: string;
      name: string;
      isFolder: boolean;
      tags: string[];
      nodeTag?: string;
      children?: any[];
    },
    existingSupertags: Supertag[]
  ): Promise<{ supertagId: string; supertagName: string; subClustersCount: number; tagsCount: number }> {
    const res = await this.replicateNestedTreeToSupertags(userId, [node], existingSupertags);
    const detail = res.details[0];
    const cleanNodeName = node.name.trim();
    const found = existingSupertags.find(st => st.name.trim().toLowerCase() === cleanNodeName.toLowerCase());
    return {
      supertagId: found?.id || '',
      supertagName: detail?.supertagName || cleanNodeName,
      subClustersCount: detail?.subClustersCount || 0,
      tagsCount: detail?.tagsCount || 0
    };
  }
};


