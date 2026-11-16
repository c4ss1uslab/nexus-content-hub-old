import { Supertag, ContentItem } from '../types';
import { extractItemFolderPath } from './folderTreeUtils';

export interface TagCluster {
  id: string;
  targetTag: string;
  sourceTags: string[];
  totalItemCount: number;
  reason: string;
  suggestedSupertagId?: string | null;
  suggestedSupertagName?: string | null;
  supertagReason?: string;
}

export interface SupertagTagSuggestion {
  tag: string;
  count: number;
  score: number;
  reason: string;
  affinityType: 'folder_match' | 'name_match' | 'member_similarity' | 'co_occurrence' | 'thematic';
  coOccurredTag?: string;
  folderPath?: string;
}

export interface SupertagSubClusterSuggestion {
  id: string; // Unique signature ID (e.g., `${supertagId}::subcluster::${folderKey}`)
  supertagId: string;
  name: string; // Polished, editable sub-cluster name (e.g. "Prompt Engineering")
  originalName: string;
  folderPath: string[]; // e.g. ["Tech", "AI", "Prompt Engineering"]
  folderPathDisplay: string; // e.g. "AI > Prompt Engineering"
  tags: string[]; // Member tags suggested for this sub-cluster
  itemCount: number; // Number of items in this sub-folder branch
  score: number; // Confidence score
  reason: string; // Descriptive explanation
  sourceType: 'bookmark_folder' | 'hierarchical_tag' | 'co_occurrence_group';
}

export interface SupertagRecommendationGroup {
  supertag: Supertag;
  suggestions: SupertagTagSuggestion[];
  subClusters: SupertagSubClusterSuggestion[];
}

/**
 * Checks if a tag begins with or contains an emoji/pictograph
 */
export const isEmojiTag = (str: string): boolean => {
  if (!str) return false;
  return /^\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(str.trim());
};

/**
 * Sorts tags so emoji-prefixed tags appear at the top,
 * followed by standard alphanumeric tags in natural order.
 */
export const sortTagsEmojiFirst = (tags: string[]): string[] => {
  return [...tags].sort((a, b) => {
    const aEmoji = isEmojiTag(a);
    const bEmoji = isEmojiTag(b);
    if (aEmoji && !bEmoji) return -1;
    if (!aEmoji && bEmoji) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  });
};

/**
 * Strips symbols, emoji, whitespace, and hyphens to find the semantic core of a tag
 */
export const simplifyTag = (tag: string): string => {
  let cleaned = tag
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[#@_./\-+\s]+/g, '')
    .trim();

  // Basic English stemmer for common plural endings
  if (cleaned.endsWith('ies') && cleaned.length > 4) {
    cleaned = cleaned.slice(0, -3) + 'y';
  } else if (cleaned.endsWith('es') && cleaned.length > 4 && (cleaned.endsWith('shes') || cleaned.endsWith('ches') || cleaned.endsWith('xes') || cleaned.endsWith('sses'))) {
    cleaned = cleaned.slice(0, -2);
  } else if (cleaned.endsWith('s') && !cleaned.endsWith('ss') && !cleaned.endsWith('us') && !cleaned.endsWith('is') && cleaned.length > 3) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned;
};

/**
 * Formats a raw folder name into a human-readable, title-cased sub-cluster title
 */
export const formatSubClusterTitle = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw
    .replace(/^📁\s*/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  
  if (!trimmed) return raw;
  
  // Title Case words
  return trimmed
    .split(/\s+/)
    .map(word => {
      if (word.length <= 3 && /^[A-Z0-9]+$/i.test(word)) {
        return word.toUpperCase(); // Preserve acronyms like AI, API, CSS, UI, UX, LLM
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

/**
 * Computes Levenshtein edit distance between two strings
 */
export const getLevenshteinDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const matrix: number[][] = [];

  for (let i = 0; i <= m; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[m][n];
};

/**
 * Heuristic semantic dictionary for common supertag categorizations
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'ai': ['ai', 'ml', 'machine-learning', 'machinelearning', 'deep-learning', 'deeplearning', 'llm', 'gpt', 'neural', 'prompt', 'transformer', 'rag', 'genai', 'claude', 'gemini', 'openai', 'agent', 'nlp', 'embedding', 'diffusion', 'chatgpt', 'anthropic', 'langchain', 'vision', 'mistral', 'llama'],
  'tech': ['code', 'coding', 'dev', 'developer', 'frontend', 'backend', 'fullstack', 'react', 'reactjs', 'typescript', 'javascript', 'python', 'rust', 'golang', 'api', 'database', 'css', 'html', 'node', 'nodejs', 'web', 'software', 'git', 'linux', 'cloud', 'aws', 'docker', 'kubernetes', 'sql', 'postgres', 'graphql', 'tailwind', 'vue', 'nextjs', 'angular', 'svelte'],
  'reading': ['book', 'books', 'audiobook', 'audiobooks', 'reading', 'read', 'literature', 'nonfiction', 'fiction', 'novel', 'biography', 'paper', 'essay', 'article', 'summary', 'highlights', 'kindle', 'author', 'chapter', 'philosophy'],
  'design': ['design', 'ui', 'ux', 'typography', 'figma', 'layout', 'graphic', 'aesthetic', 'color', 'animation', 'tailwind', 'css', 'branding', 'visual', 'prototype', 'interface', 'interaction', 'component'],
  'research': ['research', 'paper', 'arxiv', 'study', 'science', 'academic', 'theory', 'notes', 'thesis', 'experiment', 'survey', 'analysis', 'methodology', 'discovery'],
  'productivity': ['productivity', 'workflow', 'tools', 'habits', 'focus', 'management', 'notion', 'obsidian', 'knowledge', 'pkm', 'zettelkasten', 'system', 'efficiency', 'routine', 'time-management', 'organization'],
  'career': ['career', 'interview', 'resume', 'job', 'business', 'startup', 'finance', 'investing', 'strategy', 'management', 'leadership', 'marketing', 'sales', 'growth', 'economics', 'entrepreneurship'],
  'media': ['podcast', 'video', 'youtube', 'audio', 'music', 'talk', 'movie', 'show', 'newsletter', 'blog', 'stream', 'broadcast', 'interview', 'creator', 'content'],
  'health': ['health', 'fitness', 'workout', 'diet', 'nutrition', 'wellness', 'mental-health', 'sleep', 'exercise', 'longevity', 'meditation', 'psychology'],
  'finance': ['money', 'finance', 'investing', 'crypto', 'bitcoin', 'ethereum', 'stocks', 'trading', 'wealth', 'budget', 'real-estate', 'economy']
};

const GENERIC_ROOT_FOLDERS = new Set([
  'bookmarks',
  'bookmarks bar',
  'bookmarks toolbar',
  'bookmarks menu',
  'other bookmarks',
  'mobile bookmarks',
  'imported',
  'quick access',
  'unfiled bookmarks',
  'favorites bar',
  'favorites',
  'all bookmarks'
]);

/**
 * Computes suggested standalone tags and sub-clusters for each supertag by analyzing:
 * 1. Bookmark folder hierarchies of imported bookmarks (parent vs sub-folders)
 * 2. Supertag name & semantic core
 * 3. Tags already assigned within the supertag (shared prefixes, root forms, variations)
 * 4. Co-occurrence in user items
 * 5. Thematic keyword alignment
 */
export const getSupertagTagRecommendations = (
  supertags: Supertag[],
  standaloneTags: string[],
  tagCounts: Record<string, number> = {},
  items: ContentItem[] = [],
  dismissedSuggestions?: Set<string>,
  rejectedSubClusters?: Set<string>
): SupertagRecommendationGroup[] => {
  if (!supertags || supertags.length === 0) {
    return [];
  }

  const activeItems = (items || []).filter(item => !item.archived);
  const standaloneSet = new Set((standaloneTags || []).map(t => t.toLowerCase().trim()));

  // Pre-index items by folder path and tags
  interface ItemFolderInfo {
    item: ContentItem;
    folderPath: string[]; // Filtered, non-generic folder segments
    cleanTags: string[];
  }

  const itemFolderList: ItemFolderInfo[] = activeItems.map(item => {
    const rawPath = extractItemFolderPath(item);
    const folderPath = rawPath.filter(seg => {
      const clean = seg.toLowerCase().trim();
      return clean && !GENERIC_ROOT_FOLDERS.has(clean);
    });
    const cleanTags = (item.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean);
    return { item, folderPath, cleanTags };
  });

  // Pre-calculate item co-occurrences for standalone tags
  const coOccurrenceMap = new Map<string, Map<string, { count: number; coOccurringWith: string }>>();
  supertags.forEach(st => {
    coOccurrenceMap.set(st.id, new Map());
  });

  for (const { cleanTags } of itemFolderList) {
    if (cleanTags.length < 2) continue;
    const itemStandaloneTags = cleanTags.filter(t => standaloneSet.has(t));
    if (itemStandaloneTags.length === 0) continue;

    for (const st of supertags) {
      const stTagSet = new Set((st.tags || []).map(t => t.toLowerCase().trim()));
      stTagSet.add(st.name.toLowerCase().trim());
      stTagSet.add(simplifyTag(st.name));

      const matchedMemberTags = cleanTags.filter(t => stTagSet.has(t) || stTagSet.has(simplifyTag(t)));
      if (matchedMemberTags.length > 0) {
        const primeMember = matchedMemberTags[0];
        const stCoMap = coOccurrenceMap.get(st.id)!;

        for (const stTag of itemStandaloneTags) {
          if (!stTagSet.has(stTag)) {
            const existing = stCoMap.get(stTag) || { count: 0, coOccurringWith: primeMember };
            existing.count += 1;
            stCoMap.set(stTag, existing);
          }
        }
      }
    }
  }

  // Calculate suggestions & sub-clusters for each supertag
  return supertags.map(st => {
    const stNameClean = simplifyTag(st.name);
    const stNameLower = st.name.toLowerCase().trim();
    const memberTags = st.tags || [];
    const memberCleanList = memberTags.map(t => ({
      original: t,
      clean: simplifyTag(t),
      lower: t.toLowerCase().trim()
    }));

    const stTagSet = new Set(memberCleanList.map(m => m.lower));
    stTagSet.add(stNameLower);
    stTagSet.add(stNameClean);

    // Identify thematic categories matching this supertag
    const activeCategories: string[] = [];
    for (const [catKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const matchesName = stNameLower.includes(catKey) || keywords.some(k => stNameLower.includes(k));
      const matchesMembers = memberCleanList.some(m => keywords.includes(m.clean) || keywords.some(k => m.lower.includes(k)));
      if (matchesName || matchesMembers) {
        activeCategories.push(catKey);
      }
    }

    // =========================================================================
    // 1. ANALYZE BOOKMARK FOLDER STRUCTURE & SUB-CLUSTERS
    // =========================================================================
    // Map: subClusterKey -> { name, folderPath, folderPathDisplay, items: Set<string>, tags: Set<string>, score: number }
    interface SubClusterDraft {
      name: string;
      originalName: string;
      folderPath: string[];
      folderPathDisplay: string;
      itemIds: Set<string>;
      tags: Set<string>;
      sourceType: 'bookmark_folder' | 'hierarchical_tag' | 'co_occurrence_group';
      score: number;
      reason: string;
    }

    const subClusterDraftMap = new Map<string, SubClusterDraft>();

    // Scan all items that align with this supertag
    for (const { item, folderPath, cleanTags } of itemFolderList) {
      if (folderPath.length === 0 && cleanTags.length === 0) continue;

      // Check if this item belongs to this supertag by tag or folder
      const tagMatch = cleanTags.some(t => stTagSet.has(t) || stTagSet.has(simplifyTag(t)));
      
      // Check if any folder segment matches this supertag name, stem, or category
      let matchedFolderIndex = -1;
      for (let i = 0; i < folderPath.length; i++) {
        const segClean = simplifyTag(folderPath[i]);
        const segLower = folderPath[i].toLowerCase().trim();
        if (
          segClean === stNameClean || 
          segLower === stNameLower ||
          stNameLower.includes(segLower) || 
          segLower.includes(stNameLower) ||
          memberCleanList.some(m => m.clean === segClean || m.lower === segLower) ||
          activeCategories.some(cat => (CATEGORY_KEYWORDS[cat] || []).some(k => k === segClean || segLower.includes(k)))
        ) {
          matchedFolderIndex = i;
          break;
        }
      }

      // If the item belongs to this supertag domain:
      if (tagMatch || matchedFolderIndex >= 0) {
        // Look for sub-folder branches (segments below the matched parent, or sub-segments in folder path)
        const subFolderStartIndex = matchedFolderIndex >= 0 ? matchedFolderIndex + 1 : (folderPath.length > 1 ? 1 : 0);

        if (subFolderStartIndex < folderPath.length) {
          // Iterate over child and descendant sub-folders
          for (let i = subFolderStartIndex; i < folderPath.length; i++) {
            const subSeg = folderPath[i].trim();
            const subSegClean = simplifyTag(subSeg);
            if (!subSeg || subSeg.length < 2 || stTagSet.has(subSeg.toLowerCase())) continue;

            const pathUpToSub = folderPath.slice(0, i + 1);
            const pathKey = pathUpToSub.join(' > ');
            const subClusterId = `${st.id}::subcluster::${pathKey.toLowerCase()}`;

            // Check if user rejected this sub-cluster
            if (rejectedSubClusters && rejectedSubClusters.has(subClusterId)) {
              continue;
            }

            if (!subClusterDraftMap.has(subClusterId)) {
              const formattedName = formatSubClusterTitle(subSeg);
              subClusterDraftMap.set(subClusterId, {
                name: formattedName,
                originalName: subSeg,
                folderPath: pathUpToSub,
                folderPathDisplay: pathUpToSub.join(' > '),
                itemIds: new Set(),
                tags: new Set(),
                sourceType: 'bookmark_folder',
                score: 70 + (matchedFolderIndex >= 0 ? 15 : 0),
                reason: `Detected from bookmark folder path "${pathUpToSub.join(' > ')}"`
              });
            }

            const draft = subClusterDraftMap.get(subClusterId)!;
            draft.itemIds.add(item.id);

            // Add the sub-folder name itself as a tag candidate
            const folderTag = subSeg.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            if (folderTag && !stTagSet.has(folderTag)) {
              draft.tags.add(folderTag);
            }

            // Add item's tags that appear in this sub-folder
            cleanTags.forEach(t => {
              if (t && !stTagSet.has(t) && t.length >= 2) {
                draft.tags.add(t);
              }
            });
          }
        }

        // Also check hierarchical tags within this item (e.g. "ai/prompting/few-shot" or "react/hooks")
        for (const rawTag of item.tags || []) {
          if (rawTag.includes('/') || rawTag.includes('>') || rawTag.includes('›') || rawTag.includes('→')) {
            const segs = rawTag.split(/\s*(?:\/|>|›|→)\s*/).map(s => s.trim()).filter(Boolean);
            if (segs.length > 1) {
              const subTag = segs[segs.length - 1];
              const subTagKey = segs.join(' > ');
              const subId = `${st.id}::subcluster::hierarchical_${subTagKey.toLowerCase()}`;
              if (!rejectedSubClusters || !rejectedSubClusters.has(subId)) {
                if (!subClusterDraftMap.has(subId)) {
                  subClusterDraftMap.set(subId, {
                    name: formatSubClusterTitle(subTag),
                    originalName: subTag,
                    folderPath: segs,
                    folderPathDisplay: segs.join(' > '),
                    itemIds: new Set(),
                    tags: new Set([subTag.toLowerCase()]),
                    sourceType: 'hierarchical_tag',
                    score: 75,
                    reason: `Derived from hierarchical tag structure "${segs.join(' > ')}"`
                  });
                }
                const hDraft = subClusterDraftMap.get(subId)!;
                hDraft.itemIds.add(item.id);
                cleanTags.forEach(t => {
                  if (t && !stTagSet.has(t)) hDraft.tags.add(t);
                });
              }
            }
          }
        }
      }
    }

    // Convert sub-cluster drafts into list and calculate final confidence scores
    const subClusters: SupertagSubClusterSuggestion[] = Array.from(subClusterDraftMap.entries())
      .map(([id, draft]) => {
        const itemCount = draft.itemIds.size;
        const tagList = Array.from(draft.tags).filter(Boolean);
        
        // Dynamic scoring based on item count, folder specificity, and tag richness
        let finalScore = draft.score;
        finalScore += Math.min(25, itemCount * 5);
        if (tagList.length >= 2) finalScore += 10;
        if (tagList.length >= 4) finalScore += 5;

        return {
          id,
          supertagId: st.id,
          name: draft.name,
          originalName: draft.originalName,
          folderPath: draft.folderPath,
          folderPathDisplay: draft.folderPathDisplay,
          tags: tagList,
          itemCount,
          score: finalScore,
          reason: `${draft.reason} (${itemCount} item${itemCount === 1 ? '' : 's'})`,
          sourceType: draft.sourceType
        };
      })
      .filter(sc => sc.tags.length > 0 || sc.itemCount > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.itemCount - a.itemCount;
      })
      .slice(0, 10); // Top 10 high-confidence sub-clusters per supercluster

    // =========================================================================
    // 2. INDIVIDUAL STANDALONE TAG RECOMMENDATIONS (ENHANCED BY FOLDER STRUCTURE)
    // =========================================================================
    const stCoMap = coOccurrenceMap.get(st.id) || new Map();
    const suggestions: SupertagTagSuggestion[] = [];

    // Pre-calculate folder path tags for this supertag
    const folderPathTagsMap = new Map<string, { count: number; path: string }>();
    for (const { folderPath, cleanTags } of itemFolderList) {
      if (folderPath.length === 0) continue;
      const matchesSupertag = folderPath.some(seg => {
        const sClean = simplifyTag(seg);
        const sLower = seg.toLowerCase().trim();
        return sClean === stNameClean || sLower === stNameLower || memberCleanList.some(m => m.clean === sClean);
      }) || cleanTags.some(t => stTagSet.has(t));

      if (matchesSupertag) {
        // Collect tags from this folder path and item
        folderPath.forEach(seg => {
          const segLower = seg.toLowerCase().trim();
          if (standaloneSet.has(segLower)) {
            const existing = folderPathTagsMap.get(segLower) || { count: 0, path: folderPath.join(' > ') };
            existing.count += 1;
            folderPathTagsMap.set(segLower, existing);
          }
        });
        cleanTags.forEach(t => {
          if (standaloneSet.has(t)) {
            const existing = folderPathTagsMap.get(t) || { count: 0, path: folderPath.join(' > ') };
            existing.count += 1;
            folderPathTagsMap.set(t, existing);
          }
        });
      }
    }

    for (const rawTag of standaloneTags) {
      const tagLower = rawTag.toLowerCase().trim();
      const tagClean = simplifyTag(rawTag);
      if (!tagClean) continue;

      // Check if user previously dismissed this tag suggestion for this supertag
      if (dismissedSuggestions && dismissedSuggestions.has(`${st.id}::${tagLower}`)) {
        continue;
      }

      let score = 0;
      let reason = '';
      let affinityType: SupertagTagSuggestion['affinityType'] = 'thematic';
      let coOccurredTag: string | undefined = undefined;
      let folderPathStr: string | undefined = undefined;

      // A. Bookmark Folder Match (Highest structural relevance)
      const folderInfo = folderPathTagsMap.get(tagLower);
      if (folderInfo && folderInfo.count > 0) {
        score += 85 + Math.min(20, folderInfo.count * 5);
        reason = `Appears in bookmark folder path "${folderInfo.path}" (${folderInfo.count} items)`;
        affinityType = 'folder_match';
        folderPathStr = folderInfo.path;
      }

      // B. Supertag Name Match
      if (tagClean === stNameClean || tagLower === stNameLower) {
        score += 100;
        reason = `Matches supertag name "${st.name}"`;
        affinityType = 'name_match';
      } else if (stNameLower.includes(tagLower) && tagLower.length >= 3) {
        score += 65;
        if (!reason || affinityType === 'thematic') {
          reason = `Contained in supertag name "${st.name}"`;
          affinityType = 'name_match';
        }
      } else if (tagLower.includes(stNameLower) && stNameLower.length >= 3) {
        score += 60;
        if (!reason || affinityType === 'thematic') {
          reason = `Contains supertag keyword "${st.name}"`;
          affinityType = 'name_match';
        }
      } else if (stNameClean.length >= 4 && tagClean.length >= 4 && (tagClean.startsWith(stNameClean) || stNameClean.startsWith(tagClean))) {
        score += 55;
        if (!reason || affinityType === 'thematic') {
          reason = `Shares root with supertag "${st.name}"`;
          affinityType = 'name_match';
        }
      }

      // C. Similarity with Member Tags Already Assigned Inside this Supertag
      for (const m of memberCleanList) {
        if (tagClean === m.clean) {
          score += 90;
          if (!reason || affinityType === 'thematic') {
            reason = `Variant/stem of member #${m.original}`;
            affinityType = 'member_similarity';
          }
          break;
        }
        if (m.clean.length >= 3 && (tagClean.startsWith(m.clean) || m.clean.startsWith(tagClean))) {
          score += 65;
          if (!reason || affinityType === 'thematic') {
            reason = `Extension of member #${m.original}`;
            affinityType = 'member_similarity';
          }
          break;
        }
        if (tagLower.includes(m.lower) || m.lower.includes(tagLower)) {
          score += 50;
          if (!reason || affinityType === 'thematic') {
            reason = `Shares keyword with member #${m.original}`;
            affinityType = 'member_similarity';
          }
          break;
        }
        if (tagClean.length >= 5 && m.clean.length >= 5 && getLevenshteinDistance(tagClean, m.clean) <= 2) {
          score += 45;
          if (!reason || affinityType === 'thematic') {
            reason = `Close spelling to member #${m.original}`;
            affinityType = 'member_similarity';
          }
          break;
        }
      }

      // D. Co-occurrence in User's Content Items
      const coInfo = stCoMap.get(tagLower);
      if (coInfo && coInfo.count > 0) {
        const coScore = Math.min(80, coInfo.count * 25);
        score += coScore;
        if (!reason || score <= 70) {
          reason = `Co-occurs in ${coInfo.count} item${coInfo.count > 1 ? 's' : ''} with #${coInfo.coOccurringWith}`;
          affinityType = 'co_occurrence';
          coOccurredTag = coInfo.coOccurringWith;
        }
      }

      // E. Thematic Category Overlap
      if (activeCategories.length > 0) {
        for (const catKey of activeCategories) {
          const keywords = CATEGORY_KEYWORDS[catKey] || [];
          if (keywords.includes(tagClean) || keywords.some(k => tagLower.includes(k))) {
            score += 40;
            if (!reason) {
              reason = `Thematic category match (${catKey.toUpperCase()})`;
              affinityType = 'thematic';
            }
            break;
          }
        }
      }

      // Filter threshold
      if (score >= 35) {
        suggestions.push({
          tag: rawTag,
          count: tagCounts[rawTag] || 0,
          score,
          reason: reason || `Relevant to supertag "${st.name}"`,
          affinityType,
          coOccurredTag,
          folderPath: folderPathStr
        });
      }
    }

    // Sort by highest confidence score, then frequency
    suggestions.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.count || 0) - (a.count || 0);
    });

    return {
      supertag: st,
      suggestions: suggestions.slice(0, 16),
      subClusters
    };
  });
};

/**
 * Suggests the best matching supertag for a given tag/cluster
 */
export const suggestSupertagForTag = (
  targetTag: string,
  sourceTags: string[] = [],
  supertags: Supertag[],
  items: ContentItem[] = []
): { supertagId: string | null; supertagName: string | null; reason: string } => {
  if (!supertags || supertags.length === 0) {
    return { supertagId: null, supertagName: null, reason: 'No supertags created yet' };
  }

  const allCandidateTags = [targetTag, ...sourceTags].map(t => t.toLowerCase().trim());
  const cleanTarget = simplifyTag(targetTag);

  // 1. Direct membership match: check if any source tag is already in a supertag
  for (const st of supertags) {
    const stTags = (st.tags || []).map(t => t.toLowerCase().trim());
    for (const cand of allCandidateTags) {
      if (stTags.includes(cand)) {
        return {
          supertagId: st.id,
          supertagName: st.name,
          reason: `Tag already registered in supertag "${st.name}"`
        };
      }
    }
  }

  // 2. Folder Hierarchy Matching across Items
  if (items && items.length > 0) {
    const matchingItems = items.filter(item => {
      if (item.archived || !item.tags) return false;
      return item.tags.some(t => allCandidateTags.includes(t.toLowerCase().trim()));
    });

    for (const item of matchingItems) {
      const folderPath = extractItemFolderPath(item);
      for (const seg of folderPath) {
        const segClean = simplifyTag(seg);
        const segLower = seg.toLowerCase().trim();
        for (const st of supertags) {
          const stNameClean = simplifyTag(st.name);
          const stNameLower = st.name.toLowerCase().trim();
          if (segClean === stNameClean || segLower === stNameLower || (st.tags || []).some(t => t.toLowerCase() === segLower)) {
            return {
              supertagId: st.id,
              supertagName: st.name,
              reason: `Found in bookmark folder "${folderPath.join(' > ')}" under "${st.name}"`
            };
          }
        }
      }
    }
  }

  // 3. Name & Token Overlap Match
  let bestSupertag: Supertag | null = null;
  let highestScore = 0;
  let matchReason = '';

  for (const st of supertags) {
    let score = 0;
    const stNameClean = simplifyTag(st.name);
    const stNameLower = st.name.toLowerCase();

    // Exact name match or contains
    if (stNameClean === cleanTarget || stNameLower === targetTag.toLowerCase()) {
      score += 100;
      matchReason = `Exact match with supertag name "${st.name}"`;
    } else if (stNameLower.includes(targetTag.toLowerCase()) || targetTag.toLowerCase().includes(stNameLower)) {
      score += 50;
      matchReason = `Keyword overlap with "${st.name}"`;
    }

    // Check similarity against existing tags in this supertag
    const existingTags = st.tags || [];
    for (const ex of existingTags) {
      const exClean = simplifyTag(ex);
      if (exClean === cleanTarget) {
        score += 80;
        matchReason = `Shares root form with member #${ex}`;
        break;
      }
      if (exClean.length >= 3 && (cleanTarget.startsWith(exClean) || exClean.startsWith(cleanTarget))) {
        score += 65;
        matchReason = `Extension of member #${ex}`;
        break;
      }
      if (getLevenshteinDistance(exClean, cleanTarget) <= 2 && cleanTarget.length >= 5) {
        score += 40;
        matchReason = `Close match with member #${ex}`;
      }
    }

    // Check keyword taxonomy
    for (const [catKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const supertagMatchesCategory = stNameLower.includes(catKey) || keywords.some(k => stNameLower.includes(k));
      const tagMatchesCategory = allCandidateTags.some(t => keywords.includes(simplifyTag(t)) || keywords.includes(t));

      if (supertagMatchesCategory && tagMatchesCategory) {
        score += 35;
        if (!matchReason) {
          matchReason = `Thematic category alignment with "${st.name}"`;
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestSupertag = st;
    }
  }

  if (bestSupertag && highestScore >= 30) {
    return {
      supertagId: bestSupertag.id,
      supertagName: bestSupertag.name,
      reason: matchReason || `Suggested grouping into "${bestSupertag.name}"`
    };
  }

  return {
    supertagId: null,
    supertagName: null,
    reason: 'Standalone tag (no close supertag affinity)'
  };
};

/**
 * Generates a stable unique signature for a cluster based on its sorted source tags
 */
export const getClusterSignature = (sourceTags: string[]): string => {
  return [...sourceTags]
    .map(t => t.toLowerCase().trim().replace(/^#+/, ''))
    .filter(Boolean)
    .sort()
    .join('::');
};

const REJECTED_STORAGE_KEY_PREFIX = 'nexus_rejected_tag_clusters_';
const DISMISSED_SUPERTAG_SUGGESTIONS_KEY_PREFIX = 'nexus_dismissed_supertag_suggestions_';
const REJECTED_SUBCLUSTERS_KEY_PREFIX = 'nexus_rejected_subclusters_';

export const getRejectedClusterSignatures = (userId: string): Set<string> => {
  if (typeof window === 'undefined' || !userId) return new Set();
  try {
    const raw = localStorage.getItem(`${REJECTED_STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.error('Failed to read rejected cluster signatures:', err);
    return new Set();
  }
};

export const addRejectedClusterSignature = (userId: string, signature: string): void => {
  if (typeof window === 'undefined' || !userId || !signature) return;
  try {
    const current = getRejectedClusterSignatures(userId);
    current.add(signature);
    localStorage.setItem(`${REJECTED_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(current)));
  } catch (err) {
    console.error('Failed to save rejected cluster signature:', err);
  }
};

export const removeRejectedClusterSignature = (userId: string, signature: string): void => {
  if (typeof window === 'undefined' || !userId || !signature) return;
  try {
    const current = getRejectedClusterSignatures(userId);
    current.delete(signature);
    localStorage.setItem(`${REJECTED_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(current)));
  } catch (err) {
    console.error('Failed to remove rejected cluster signature:', err);
  }
};

export const clearAllRejectedClusterSignatures = (userId: string): void => {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(`${REJECTED_STORAGE_KEY_PREFIX}${userId}`);
  } catch (err) {
    console.error('Failed to clear rejected cluster signatures:', err);
  }
};

export const getDismissedSupertagSuggestions = (userId: string): Set<string> => {
  if (typeof window === 'undefined' || !userId) return new Set();
  try {
    const raw = localStorage.getItem(`${DISMISSED_SUPERTAG_SUGGESTIONS_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.error('Failed to read dismissed supertag suggestions:', err);
    return new Set();
  }
};

export const addDismissedSupertagSuggestion = (userId: string, signature: string): void => {
  if (typeof window === 'undefined' || !userId || !signature) return;
  try {
    const current = getDismissedSupertagSuggestions(userId);
    current.add(signature);
    localStorage.setItem(`${DISMISSED_SUPERTAG_SUGGESTIONS_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(current)));
  } catch (err) {
    console.error('Failed to save dismissed supertag suggestion:', err);
  }
};

export const removeDismissedSupertagSuggestion = (userId: string, signature: string): void => {
  if (typeof window === 'undefined' || !userId || !signature) return;
  try {
    const current = getDismissedSupertagSuggestions(userId);
    current.delete(signature);
    localStorage.setItem(`${DISMISSED_SUPERTAG_SUGGESTIONS_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(current)));
  } catch (err) {
    console.error('Failed to remove dismissed supertag suggestion:', err);
  }
};

export const clearAllDismissedSupertagSuggestions = (userId: string): void => {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(`${DISMISSED_SUPERTAG_SUGGESTIONS_KEY_PREFIX}${userId}`);
  } catch (err) {
    console.error('Failed to clear dismissed supertag suggestions:', err);
  }
};

// =========================================================================
// SUB-CLUSTER REJECTION STORAGE HELPERS
// =========================================================================
export const getRejectedSubClusterSignatures = (userId: string): Set<string> => {
  if (typeof window === 'undefined' || !userId) return new Set();
  try {
    const raw = localStorage.getItem(`${REJECTED_SUBCLUSTERS_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.error('Failed to read rejected sub-clusters:', err);
    return new Set();
  }
};

export const addRejectedSubClusterSignature = (userId: string, signature: string): void => {
  if (typeof window === 'undefined' || !userId || !signature) return;
  try {
    const current = getRejectedSubClusterSignatures(userId);
    current.add(signature);
    localStorage.setItem(`${REJECTED_SUBCLUSTERS_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(current)));
  } catch (err) {
    console.error('Failed to save rejected sub-cluster:', err);
  }
};

export const removeRejectedSubClusterSignature = (userId: string, signature: string): void => {
  if (typeof window === 'undefined' || !userId || !signature) return;
  try {
    const current = getRejectedSubClusterSignatures(userId);
    current.delete(signature);
    localStorage.setItem(`${REJECTED_SUBCLUSTERS_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(current)));
  } catch (err) {
    console.error('Failed to remove rejected sub-cluster:', err);
  }
};

export const clearAllRejectedSubClusterSignatures = (userId: string): void => {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(`${REJECTED_SUBCLUSTERS_KEY_PREFIX}${userId}`);
  } catch (err) {
    console.error('Failed to clear rejected sub-clusters:', err);
  }
};

/**
 * Groups tags into redundant clusters based on:
 * 1. Normalized stem/casing/symbols equality (e.g., "AI", "ai", "a.i.", "#ai")
 * 2. Singular vs plural forms ("book" vs "books", "article" vs "articles")
 * 3. Hyphenation / whitespace variations ("deep-learning" vs "deep learning" vs "deeplearning")
 * 4. Close typo / Levenshtein distance (e.g., "javascript" vs "javscript")
 * And provides intelligent supertag assignment suggestion for each cluster.
 */
export const findRedundantTagClusters = (
  allTags: string[],
  tagCounts: Record<string, number>,
  supertags: Supertag[] = [],
  rejectedSignatures?: Set<string>
): TagCluster[] => {
  const clusters: TagCluster[] = [];
  const assigned = new Set<string>();

  // Pass 1: Semantic simplification (stems, spacing, casing, punctuation)
  const simplifiedMap = new Map<string, string[]>();

  for (const tag of allTags) {
    const key = simplifyTag(tag);
    if (!key) continue; // Skip completely empty symbols
    if (!simplifiedMap.has(key)) {
      simplifiedMap.set(key, []);
    }
    simplifiedMap.get(key)!.push(tag);
  }

  for (const [key, group] of simplifiedMap.entries()) {
    if (group.length > 1) {
      const signature = getClusterSignature(group);
      if (rejectedSignatures && rejectedSignatures.has(signature)) {
        continue;
      }

      // Pick the tag with highest item count or most readable casing as canonical default
      const sortedByCount = [...group].sort((a, b) => {
        const countA = tagCounts[a] || 0;
        const countB = tagCounts[b] || 0;
        if (countB !== countA) return countB - countA;
        return a.localeCompare(b);
      });

      const targetTag = sortedByCount[0];
      const totalCount = group.reduce((sum, t) => sum + (tagCounts[t] || 0), 0);

      group.forEach(t => assigned.add(t));

      const stSuggestion = suggestSupertagForTag(targetTag, group, supertags);

      clusters.push({
        id: `stem-${key}`,
        targetTag,
        sourceTags: group,
        totalItemCount: totalCount,
        reason: 'Variation in casing, punctuation, symbols, or singular/plural',
        suggestedSupertagId: stSuggestion.supertagId,
        suggestedSupertagName: stSuggestion.supertagName,
        supertagReason: stSuggestion.reason
      });
    }
  }

  // Pass 2: Levenshtein distance for remaining unassigned tags (typos)
  const remainingTags = allTags.filter(t => !assigned.has(t));
  const typoClusters: string[][] = [];

  for (let i = 0; i < remainingTags.length; i++) {
    const tagA = remainingTags[i];
    if (assigned.has(tagA)) continue;

    const currentCluster = [tagA];
    const cleanA = tagA.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanA.length < 5) continue; // only check typos for words >= 5 chars to avoid false positives

    for (let j = i + 1; j < remainingTags.length; j++) {
      const tagB = remainingTags[j];
      if (assigned.has(tagB)) continue;

      const cleanB = tagB.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanB.length < 5) continue;

      // Distance of 1 for words 5-8 chars, distance <= 2 for words > 8 chars
      const maxDistance = cleanA.length > 8 && cleanB.length > 8 ? 2 : 1;
      const dist = getLevenshteinDistance(cleanA, cleanB);

      if (dist > 0 && dist <= maxDistance) {
        currentCluster.push(tagB);
        assigned.add(tagB);
      }
    }

    if (currentCluster.length > 1) {
      assigned.add(tagA);
      typoClusters.push(currentCluster);
    }
  }

  for (const group of typoClusters) {
    const signature = getClusterSignature(group);
    if (rejectedSignatures && rejectedSignatures.has(signature)) {
      continue;
    }

    const sortedByCount = [...group].sort((a, b) => {
      const countA = tagCounts[a] || 0;
      const countB = tagCounts[b] || 0;
      if (countB !== countA) return countB - countA;
      return a.localeCompare(b);
    });

    const targetTag = sortedByCount[0];
    const totalCount = group.reduce((sum, t) => sum + (tagCounts[t] || 0), 0);

    const stSuggestion = suggestSupertagForTag(targetTag, group, supertags);

    clusters.push({
      id: `typo-${targetTag}`,
      targetTag,
      sourceTags: group,
      totalItemCount: totalCount,
      reason: 'Probable typo or character spelling variation',
      suggestedSupertagId: stSuggestion.supertagId,
      suggestedSupertagName: stSuggestion.supertagName,
      supertagReason: stSuggestion.reason
    });
  }

  // Sort clusters by highest affected item count
  return clusters.sort((a, b) => b.totalItemCount - a.totalItemCount);
};
