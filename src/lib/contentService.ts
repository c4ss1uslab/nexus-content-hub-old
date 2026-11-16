import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  writeBatch,
  Timestamp 
} from 'firebase/firestore';
import { ContentItem, Supertag } from '../types';

export const contentService = {
  async save(data: Omit<ContentItem, 'id' | 'updatedAt'> & { createdAt?: any }) {
    const payload: any = {
      ...data,
      createdAt: data.createdAt ? (data.createdAt instanceof Date ? Timestamp.fromDate(data.createdAt) : data.createdAt) : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, 'contentItems'), payload);
    return docRef;
  },

  async batchCreate(items: Array<Omit<ContentItem, 'id' | 'updatedAt'> & { createdAt?: any }>, onProgress?: (completed: number, total: number) => void) {
    const chunkSize = 400;
    let completed = 0;
    
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const docRef = doc(collection(db, 'contentItems'));
        const payload: any = {
          ...item,
          createdAt: item.createdAt 
            ? (item.createdAt instanceof Date ? Timestamp.fromDate(item.createdAt) : item.createdAt) 
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        batch.set(docRef, payload);
      }

      await batch.commit();
      completed += chunk.length;
      if (onProgress) {
        onProgress(completed, items.length);
      }
    }

    return completed;
  },

  async update(id: string, changes: Partial<Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>>) {
    await updateDoc(doc(db, 'contentItems', id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  },

  async archive(id: string, tags: string[]) {
    const updatedTags = tags.includes('done') ? tags : [...tags, 'done'];
    await updateDoc(doc(db, 'contentItems', id), {
      archived: true,
      progress: 100,
      tags: updatedTags,
      updatedAt: serverTimestamp(),
    });
  },

  async restore(id: string) {
    await updateDoc(doc(db, 'contentItems', id), {
      archived: false,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string) {
    await deleteDoc(doc(db, 'contentItems', id));
  },

  async updatePosition(id: string, x: number, y: number) {
    await updateDoc(doc(db, 'contentItems', id), {
      canvasPosition: { x, y },
      onCanvas: true,
      updatedAt: serverTimestamp(),
    });
  },

  async placeOnCanvas(id: string, x: number = 100, y: number = 100) {
    await updateDoc(doc(db, 'contentItems', id), {
      canvasPosition: { x, y },
      onCanvas: true,
      updatedAt: serverTimestamp(),
    });
  },

  async removeFromCanvas(id: string) {
    await updateDoc(doc(db, 'contentItems', id), {
      canvasPosition: null,
      onCanvas: false,
      updatedAt: serverTimestamp(),
    });
  },

  async updateDimensions(id: string, width: number, height: number) {
    await updateDoc(doc(db, 'contentItems', id), {
      canvasDimensions: { width, height },
      updatedAt: serverTimestamp(),
    });
  },

  async batchMergeTags(
    merges: Array<{ sourceTags: string[]; targetTag: string }>,
    allItems: ContentItem[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ updatedCount: number; mergedClustersCount: number }> {
    // Build a quick lookup map of source tag -> target tag
    const tagReplacementMap = new Map<string, string>();
    for (const merge of merges) {
      for (const source of merge.sourceTags) {
        if (source !== merge.targetTag) {
          tagReplacementMap.set(source, merge.targetTag);
        }
      }
    }

    if (tagReplacementMap.size === 0) {
      return { updatedCount: 0, mergedClustersCount: 0 };
    }

    // Find all items that contain at least one of the source tags that need replacement
    const affectedItems: Array<{ id: string; newTags: string[] }> = [];

    for (const item of allItems) {
      if (!item.tags || item.tags.length === 0) continue;

      let changed = false;
      const newTagSet = new Set<string>();

      for (const tag of item.tags) {
        if (tagReplacementMap.has(tag)) {
          newTagSet.add(tagReplacementMap.get(tag)!);
          changed = true;
        } else {
          newTagSet.add(tag);
        }
      }

      if (changed) {
        affectedItems.push({
          id: item.id,
          newTags: Array.from(newTagSet)
        });
      }
    }

    const totalToUpdate = affectedItems.length;
    let completed = 0;
    const chunkSize = 400;

    for (let i = 0; i < totalToUpdate; i += chunkSize) {
      const chunk = affectedItems.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const update of chunk) {
        const itemRef = doc(db, 'contentItems', update.id);
        batch.update(itemRef, {
          tags: update.newTags,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      completed += chunk.length;
      if (onProgress) {
        onProgress(completed, totalToUpdate);
      }
    }

    return {
      updatedCount: totalToUpdate,
      mergedClustersCount: merges.length
    };
  },

  async renameTag(
    oldTag: string,
    newTag: string,
    allItems: ContentItem[],
    allSupertags: Supertag[] = [],
    userId?: string
  ): Promise<{ updatedItemsCount: number; updatedSupertagsCount: number }> {
    const cleanOld = oldTag.trim().toLowerCase().replace(/^#+/, '');
    const cleanNew = newTag.trim().toLowerCase().replace(/^#+/, '');

    if (!cleanOld || !cleanNew || cleanOld === cleanNew) {
      return { updatedItemsCount: 0, updatedSupertagsCount: 0 };
    }

    // 1. Update contentItems that contain oldTag
    const affectedItems: Array<{ id: string; newTags: string[] }> = [];

    for (const item of allItems) {
      if (!item.tags || item.tags.length === 0) continue;
      let hasOld = false;
      const tagSet = new Set<string>();

      for (const t of item.tags) {
        if (t.toLowerCase().trim() === cleanOld) {
          hasOld = true;
          tagSet.add(cleanNew);
        } else {
          tagSet.add(t);
        }
      }

      if (hasOld) {
        affectedItems.push({
          id: item.id,
          newTags: Array.from(tagSet)
        });
      }
    }

    const chunkSize = 400;
    for (let i = 0; i < affectedItems.length; i += chunkSize) {
      const chunk = affectedItems.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const update of chunk) {
        const itemRef = doc(db, 'contentItems', update.id);
        batch.update(itemRef, {
          tags: update.newTags,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    }

    // 2. Update supertags if they reference oldTag
    let updatedSupertagsCount = 0;
    if (allSupertags && allSupertags.length > 0) {
      const batch = writeBatch(db);
      let hasSupertagChange = false;

      for (const st of allSupertags) {
        const stTags = st.tags || [];
        const stSubClusters = st.subClusters || [];
        let stChanged = false;

        let newStTags = stTags;
        if (stTags.some(t => t.toLowerCase().trim() === cleanOld)) {
          newStTags = Array.from(new Set(
            stTags.map(t => (t.toLowerCase().trim() === cleanOld ? cleanNew : t))
          ));
          stChanged = true;
        }

        let newSubClusters = stSubClusters;
        if (stSubClusters.some(sc => (sc.tags || []).some(t => t.toLowerCase().trim() === cleanOld))) {
          newSubClusters = stSubClusters.map(sc => ({
            ...sc,
            tags: Array.from(new Set(
              (sc.tags || []).map(t => (t.toLowerCase().trim() === cleanOld ? cleanNew : t))
            ))
          }));
          stChanged = true;
        }

        if (stChanged) {
          batch.update(doc(db, 'supertags', st.id), {
            tags: newStTags,
            subClusters: newSubClusters,
            updatedAt: serverTimestamp(),
          });
          hasSupertagChange = true;
          updatedSupertagsCount++;
        }
      }

      if (hasSupertagChange) {
        await batch.commit();
      }
    }

    // 3. Transfer tag scores if userId provided
    if (userId) {
      try {
        const { getDoc, setDoc } = await import('firebase/firestore');
        const mappingRef = doc(db, 'tagMappings', userId);
        const snap = await getDoc(mappingRef);
        if (snap.exists()) {
          const data = snap.data();
          const scores = data.tagScores || {};
          if (scores[cleanOld]) {
            scores[cleanNew] = { ...scores[cleanOld] };
            delete scores[cleanOld];
            await setDoc(mappingRef, { tagScores: scores }, { merge: true });
          }
        }
      } catch (e) {
        console.error('Error migrating tag scores on rename:', e);
      }
    }

    return {
      updatedItemsCount: affectedItems.length,
      updatedSupertagsCount
    };
  }
};

