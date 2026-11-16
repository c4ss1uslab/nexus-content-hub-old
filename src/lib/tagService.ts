import { db, auth } from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  serverTimestamp,
  writeBatch,
  collection
} from 'firebase/firestore';
import { ContentItem, TagScore, TagScoreMap } from '../types';
import { handleFirestoreError, OperationType } from './utils';

export const tagService = {
  /**
   * Subscribe to real-time tag scores stored in tagMappings/{userId}
   */
  subscribeTagScores(userId: string, callback: (scores: TagScoreMap) => void) {
    if (!userId) {
      callback({});
      return () => {};
    }

    const docRef = doc(db, 'tagMappings', userId);

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          callback(data.tagScores || {});
        } else {
          callback({});
        }
      },
      (error) => {
        handleFirestoreError(auth, error, OperationType.GET, `tagMappings/${userId}`);
      }
    );
  },

  /**
   * Fetch current tag scores once
   */
  async getTagScores(userId: string): Promise<TagScoreMap> {
    if (!userId) return {};
    try {
      const docRef = doc(db, 'tagMappings', userId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data().tagScores || {};
      }
      return {};
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.GET, `tagMappings/${userId}`);
      return {};
    }
  },

  /**
   * Save or update score for a single tag
   */
  async saveTagScore(
    userId: string,
    tag: string,
    scores: { relevanceScore?: number | null; alivenessScore?: number | null }
  ) {
    if (!userId) return;
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    try {
      const docRef = doc(db, 'tagMappings', userId);
      const current = await this.getTagScores(userId);
      
      const existing = current[cleanTag] || {};
      const updatedEntry: TagScore = {
        relevanceScore: scores.relevanceScore !== undefined ? scores.relevanceScore : existing.relevanceScore,
        alivenessScore: scores.alivenessScore !== undefined ? scores.alivenessScore : existing.alivenessScore,
        updatedAt: new Date().toISOString()
      };

      const updatedScores = {
        ...current,
        [cleanTag]: updatedEntry
      };

      await setDoc(docRef, { tagScores: updatedScores }, { merge: true });
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, `tagMappings/${userId}`);
      throw error;
    }
  },

  /**
   * Batch save scores for multiple tags
   */
  async batchSaveTagScores(
    userId: string,
    updates: Record<string, { relevanceScore?: number | null; alivenessScore?: number | null }>
  ) {
    if (!userId) return;
    try {
      const docRef = doc(db, 'tagMappings', userId);
      const current = await this.getTagScores(userId);
      const nextScores: TagScoreMap = { ...current };

      const timestamp = new Date().toISOString();

      Object.entries(updates).forEach(([rawTag, sc]) => {
        const cleanTag = rawTag.trim().toLowerCase().replace(/^#+/, '');
        if (!cleanTag) return;

        const existing = nextScores[cleanTag] || {};
        nextScores[cleanTag] = {
          relevanceScore: sc.relevanceScore !== undefined ? sc.relevanceScore : existing.relevanceScore,
          alivenessScore: sc.alivenessScore !== undefined ? sc.alivenessScore : existing.alivenessScore,
          updatedAt: timestamp
        };
      });

      await setDoc(docRef, { tagScores: nextScores }, { merge: true });
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, `tagMappings/${userId}`);
      throw error;
    }
  },

  /**
   * Remove score record for a tag
   */
  async removeTagScore(userId: string, tag: string) {
    if (!userId) return;
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanTag) return;

    try {
      const docRef = doc(db, 'tagMappings', userId);
      const current = await this.getTagScores(userId);
      const next = { ...current };
      delete next[cleanTag];
      await setDoc(docRef, { tagScores: next }, { merge: true });
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, `tagMappings/${userId}`);
      throw error;
    }
  },

  /**
   * Compute inherited relevance and aliveness scores for an item based on its tags and tag scores.
   * Returns highest relevance & highest aliveness found among the tags.
   */
  computeItemScoresFromTags(
    itemTags: string[],
    tagScores: TagScoreMap
  ): { relevanceScore: number | null; alivenessScore: number | null } {
    if (!itemTags || itemTags.length === 0) {
      return { relevanceScore: null, alivenessScore: null };
    }

    let maxRel: number | null = null;
    let maxAli: number | null = null;

    for (const rawTag of itemTags) {
      const clean = rawTag.trim().toLowerCase().replace(/^#+/, '');
      const scoreObj = tagScores[clean];
      if (scoreObj) {
        if (typeof scoreObj.relevanceScore === 'number') {
          if (maxRel === null || scoreObj.relevanceScore > maxRel) {
            maxRel = scoreObj.relevanceScore;
          }
        }
        if (typeof scoreObj.alivenessScore === 'number') {
          if (maxAli === null || scoreObj.alivenessScore > maxAli) {
            maxAli = scoreObj.alivenessScore;
          }
        }
      }
    }

    return { relevanceScore: maxRel, alivenessScore: maxAli };
  },

  /**
   * Updates content items in Firestore inheriting scores from tags.
   * By default, skips items that have manually assigned scores (unless overrideManual is true).
   */
  async syncItemsScoreInheritance(
    targetTags: string[],
    tagScores: TagScoreMap,
    allItems: ContentItem[],
    overrideManual: boolean = false
  ): Promise<{ updatedCount: number }> {
    const targetTagSet = new Set(targetTags.map(t => t.trim().toLowerCase().replace(/^#+/, '')));
    const itemsToUpdate: Array<{
      id: string;
      newRelevance?: number;
      newAliveness?: number;
    }> = [];

    for (const item of allItems) {
      if (!item.tags || item.tags.length === 0) continue;
      
      const itemHasTargetTag = item.tags.some(t => targetTagSet.has(t.trim().toLowerCase().replace(/^#+/, '')));
      if (!itemHasTargetTag) continue;

      const { relevanceScore: tagRel, alivenessScore: tagAli } = this.computeItemScoresFromTags(item.tags, tagScores);

      let needsUpdate = false;
      let newRelevance = item.relevanceScore;
      let newAliveness = item.alivenessScore;

      if (tagRel !== null) {
        const canUpdateRel = overrideManual || !item.manualRelevanceScore;
        if (canUpdateRel && item.relevanceScore !== tagRel) {
          newRelevance = tagRel;
          needsUpdate = true;
        }
      }

      if (tagAli !== null) {
        const canUpdateAli = overrideManual || !item.manualAlivenessScore;
        if (canUpdateAli && item.alivenessScore !== tagAli) {
          newAliveness = tagAli;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        itemsToUpdate.push({
          id: item.id,
          newRelevance,
          newAliveness
        });
      }
    }

    if (itemsToUpdate.length === 0) {
      return { updatedCount: 0 };
    }

    const chunkSize = 400;
    for (let i = 0; i < itemsToUpdate.length; i += chunkSize) {
      const chunk = itemsToUpdate.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const update of chunk) {
        const itemRef = doc(db, 'contentItems', update.id);
        const patch: any = {
          updatedAt: serverTimestamp()
        };
        if (update.newRelevance !== undefined) {
          patch.relevanceScore = update.newRelevance;
        }
        if (update.newAliveness !== undefined) {
          patch.alivenessScore = update.newAliveness;
        }
        batch.update(itemRef, patch);
      }

      await batch.commit();
    }

    return { updatedCount: itemsToUpdate.length };
  }
};
