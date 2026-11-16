import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, Sparkles, Check, Layers, ArrowRight, Loader2, Plus, Minus,
  CheckSquare, Square, FolderPlus, Tag, ChevronDown, 
  FolderTree, Info, ShieldCheck, Edit2, Ban, RotateCcw,
  RotateCw, RefreshCw, Zap, Search, ChevronRight,
  Sliders, Star, Flame, SlidersHorizontal, CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ContentItem, Supertag, TagScore, TagScoreMap } from '../types';
import { 
  TagCluster, 
  findRedundantTagClusters, 
  sortTagsEmojiFirst, 
  suggestSupertagForTag,
  getSupertagTagRecommendations,
  SupertagRecommendationGroup,
  SupertagTagSuggestion,
  SupertagSubClusterSuggestion,
  getClusterSignature,
  getRejectedClusterSignatures,
  addRejectedClusterSignature,
  removeRejectedClusterSignature,
  clearAllRejectedClusterSignatures,
  getDismissedSupertagSuggestions,
  addDismissedSupertagSuggestion,
  removeDismissedSupertagSuggestion,
  clearAllDismissedSupertagSuggestions,
  getRejectedSubClusterSignatures,
  addRejectedSubClusterSignature,
  removeRejectedSubClusterSignature,
  clearAllRejectedSubClusterSignatures
} from '../lib/tagNormalization';
import { contentService } from '../lib/contentService';
import { supertagService } from '../lib/supertagService';
import { tagService } from '../lib/tagService';
import RenameTagModal from './RenameTagModal';
import RenameSupertagModal from './RenameSupertagModal';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface NormalizeTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ContentItem[];
  allTags: string[];
  tagCounts: Record<string, number>;
  supertags: Supertag[];
  userId: string;
}

export default function NormalizeTagsModal({
  isOpen,
  onClose,
  items,
  allTags,
  tagCounts,
  supertags,
  userId
}: NormalizeTagsModalProps) {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'manual' | 'organize'>('suggestions');
  const [rejectedSignatures, setRejectedSignatures] = useState<Set<string>>(() => getRejectedClusterSignatures(userId));
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => getDismissedSupertagSuggestions(userId));
  const [rejectedSubClusters, setRejectedSubClusters] = useState<Set<string>>(() => getRejectedSubClusterSignatures(userId));
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [renamingSupertag, setRenamingSupertag] = useState<Supertag | null>(null);

  // Sub-clusters state per supertag
  const [displayedSubClusters, setDisplayedSubClusters] = useState<Record<string, SupertagSubClusterSuggestion[]>>({});
  const [editingSubCluster, setEditingSubCluster] = useState<{ supertagId: string; subClusterId: string; name: string } | null>(null);
  const [subClusterNewTagInputs, setSubClusterNewTagInputs] = useState<Record<string, string>>({});

  // Tag Scores live subscription
  const [tagScores, setTagScores] = useState<TagScoreMap>({});

  useEffect(() => {
    if (!userId) {
      setTagScores({});
      return;
    }
    const unsub = tagService.subscribeTagScores(userId, setTagScores);
    return () => unsub();
  }, [userId]);

  // Collapsible sections state for Organize tab
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('nexus_organize_modal_collapsed');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      supertagsOverview: false,
      supertagSuggestions: false,
      bulkTagScores: false,
      standaloneMatrix: false
    };
  });

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [sectionKey]: !prev[sectionKey] };
      try {
        localStorage.setItem('nexus_organize_modal_collapsed', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Bulk Edit Tag Scores state
  const [bulkSelectedTags, setBulkSelectedTags] = useState<Set<string>>(new Set());
  const [bulkTagSearch, setBulkTagSearch] = useState('');
  const [bulkFilterMode, setBulkFilterMode] = useState<'all' | 'standalone' | 'scored' | 'unscored'>('all');
  const [bulkRelevanceScore, setBulkRelevanceScore] = useState<number>(50);
  const [bulkApplyRelevance, setBulkApplyRelevance] = useState<boolean>(true);
  const [bulkAlivenessScore, setBulkAlivenessScore] = useState<number>(50);
  const [bulkApplyAliveness, setBulkApplyAliveness] = useState<boolean>(true);
  const [bulkPropagateToItems, setBulkPropagateToItems] = useState<boolean>(true);
  const [bulkOverrideManualScores, setBulkOverrideManualScores] = useState<boolean>(false);
  const [isBulkUpdatingScores, setIsBulkUpdatingScores] = useState(false);
  
  // Track open transition so we only initialize on open, preventing background Firestore updates from re-triggering new recommendations
  const prevIsOpenRef = useRef(false);

  // Suggested clusters state (filtering rejected signatures)
  const rawClusters = useMemo(() => {
    if (!isOpen) return [];
    return findRedundantTagClusters(allTags, tagCounts, supertags, rejectedSignatures);
  }, [isOpen, allTags, tagCounts, supertags, rejectedSignatures]);

  const [clusterConfigs, setClusterConfigs] = useState<Array<TagCluster & { assignedSupertagId: string }>>([]);
  const [selectedClusterIds, setSelectedClusterIds] = useState<Set<string>>(new Set());

  // Manual merger state
  const [manualSelectedTags, setManualSelectedTags] = useState<string[]>([]);
  const [manualTargetTag, setManualTargetTag] = useState('');
  const [manualTargetSupertagId, setManualTargetSupertagId] = useState<string>('none');
  const [manualTagSearch, setManualTagSearch] = useState('');

  // Quick inline new supertag creation state
  const [newSupertagName, setNewSupertagName] = useState('');
  const [isCreatingSupertag, setIsCreatingSupertag] = useState(false);

  // Organize tab state (assign standalone tags to supertags)
  const [organizeAssignments, setOrganizeAssignments] = useState<Record<string, string[]>>({});
  const [selectedOrganizeTags, setSelectedOrganizeTags] = useState<Set<string>>(new Set());
  const [organizeTagSearch, setOrganizeTagSearch] = useState('');
  const [isRefreshingRecs, setIsRefreshingRecs] = useState(false);
  const [refreshingSupertagId, setRefreshingSupertagId] = useState<string | null>(null);
  const [displayedSuggestions, setDisplayedSuggestions] = useState<Record<string, SupertagTagSuggestion[]>>({});

  // Progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // Standalone tags (tags not currently in any supertag)
  const standaloneTags = useMemo(() => {
    const assignedTagsSet = new Set<string>();
    supertags.forEach(st => {
      (st.tags || []).forEach(t => assignedTagsSet.add(t.toLowerCase().trim()));
    });
    return allTags.filter(t => !assignedTagsSet.has(t.toLowerCase().trim()));
  }, [allTags, supertags]);

  // Helper to compute recommendations and sub-clusters map for supertags
  const computeRecommendationsMap = (
    stList: Supertag[],
    stStandalone: string[],
    stDismissed: Set<string>,
    stRejectedSubs: Set<string>
  ): { 
    suggestionsMap: Record<string, SupertagTagSuggestion[]>;
    subClustersMap: Record<string, SupertagSubClusterSuggestion[]>;
  } => {
    const groups = getSupertagTagRecommendations(stList, stStandalone, tagCounts, items, stDismissed, stRejectedSubs);
    const suggestionsMap: Record<string, SupertagTagSuggestion[]> = {};
    const subClustersMap: Record<string, SupertagSubClusterSuggestion[]> = {};
    groups.forEach(g => {
      suggestionsMap[g.supertag.id] = g.suggestions;
      subClustersMap[g.supertag.id] = g.subClusters;
    });
    return { suggestionsMap, subClustersMap };
  };

  // Total count of suggestions across all supertags
  const totalSuggestedTagsCount = useMemo(() => {
    const uniqueTags = new Set<string>();
    Object.values(displayedSuggestions).forEach(sugList => {
      (sugList || []).forEach(s => uniqueTags.add(s.tag));
    });
    return uniqueTags.size;
  }, [displayedSuggestions]);

  // Total count of sub-clusters across all supertags
  const totalSubClustersCount = useMemo(() => {
    let count = 0;
    Object.values(displayedSubClusters).forEach(list => {
      count += (list || []).length;
    });
    return count;
  }, [displayedSubClusters]);

  // Sync clusters and organize assignments on modal open ONLY (when transitioning from closed to open)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const storedRejected = getRejectedClusterSignatures(userId);
      setRejectedSignatures(storedRejected);
      const storedDismissed = getDismissedSupertagSuggestions(userId);
      setDismissedSuggestions(storedDismissed);
      const storedRejectedSubs = getRejectedSubClusterSignatures(userId);
      setRejectedSubClusters(storedRejectedSubs);

      // Compute initial recommendations and sub-clusters on open
      const { suggestionsMap, subClustersMap } = computeRecommendationsMap(supertags, standaloneTags, storedDismissed, storedRejectedSubs);
      setDisplayedSuggestions(suggestionsMap);
      setDisplayedSubClusters(subClustersMap);

      const filteredRaw = findRedundantTagClusters(allTags, tagCounts, supertags, storedRejected);

      const initialized = filteredRaw.map(c => ({
        ...c,
        assignedSupertagId: c.suggestedSupertagId || 'none'
      }));
      setClusterConfigs(initialized);
      setSelectedClusterIds(new Set(initialized.map(c => c.id)));
      setManualSelectedTags([]);
      setManualTargetTag('');
      setManualTargetSupertagId('none');
      setManualTagSearch('');
      setOrganizeTagSearch('');
      setProgress(null);

      // Auto-suggest supertags for standalone tags in the organize tab
      const autoOrg: Record<string, string[]> = {};
      const autoSelected = new Set<string>();
      standaloneTags.forEach(tag => {
        const suggestion = suggestSupertagForTag(tag, [], supertags, items);
        if (suggestion.supertagId) {
          autoOrg[tag] = [suggestion.supertagId];
          autoSelected.add(tag);
        } else {
          autoOrg[tag] = [];
        }
      });
      setOrganizeAssignments(autoOrg);
      setSelectedOrganizeTags(autoSelected);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, allTags, tagCounts, supertags, standaloneTags, userId, items]);

  // Refresh recommendations handler according to supertag name and member tags (Global Refresh)
  const handleRefreshRecommendations = () => {
    setIsRefreshingRecs(true);

    const { suggestionsMap, subClustersMap } = computeRecommendationsMap(supertags, standaloneTags, dismissedSuggestions, rejectedSubClusters);
    setDisplayedSuggestions(suggestionsMap);
    setDisplayedSubClusters(subClustersMap);

    // Recalculate auto-organize assignments as well
    const autoOrg: Record<string, string[]> = {};
    const autoSelected = new Set<string>();
    standaloneTags.forEach(tag => {
      const suggestion = suggestSupertagForTag(tag, [], supertags, items);
      if (suggestion.supertagId) {
        autoOrg[tag] = [suggestion.supertagId];
        autoSelected.add(tag);
      } else {
        autoOrg[tag] = organizeAssignments[tag] || [];
      }
    });
    setOrganizeAssignments(autoOrg);

    setTimeout(() => {
      setIsRefreshingRecs(false);
      const totalAssignedInSupertags = supertags.reduce((sum, s) => sum + (s.tags?.length || 0), 0);
      toast.success(`Recommendations & sub-clusters updated`, {
        description: `Refreshed analysis across bookmark folders, tag branches, and ${supertags.length} supertags.`
      });
    }, 450);
  };

  // Refresh recommendations for a specific supertag on demand
  const handleRefreshSuggestionsForSupertag = (supertagId: string, supertagName: string) => {
    setRefreshingSupertagId(supertagId);
    const targetSt = supertags.find(s => s.id === supertagId);
    if (!targetSt) {
      setRefreshingSupertagId(null);
      return;
    }

    const recGroups = getSupertagTagRecommendations([targetSt], standaloneTags, tagCounts, items, dismissedSuggestions, rejectedSubClusters);
    const freshSuggestions = recGroups[0]?.suggestions || [];
    const freshSubClusters = recGroups[0]?.subClusters || [];

    setTimeout(() => {
      setDisplayedSuggestions(prev => ({
        ...prev,
        [supertagId]: freshSuggestions
      }));
      setDisplayedSubClusters(prev => ({
        ...prev,
        [supertagId]: freshSubClusters
      }));
      setRefreshingSupertagId(null);
      toast.success(`Refreshed suggestions for "${supertagName}" (${freshSubClusters.length} sub-clusters, ${freshSuggestions.length} tags)`);
    }, 350);
  };

  // =========================================================================
  // SUB-CLUSTER ACTION HANDLERS (APPROVE / REJECT / RENAME / EDIT TAGS)
  // =========================================================================
  
  // 1. Approve sub-cluster: Create real sub-cluster and assign its member tags into this supertag
  const handleApproveSubCluster = async (supertagId: string, supertagName: string, subCluster: SupertagSubClusterSuggestion) => {
    const tagsToAssign = Array.from(new Set(subCluster.tags.map(t => t.toLowerCase().trim()))).filter(Boolean);
    if (tagsToAssign.length === 0) {
      toast.error('No tags in sub-cluster to assign');
      return;
    }

    try {
      await supertagService.createSubCluster(
        supertagId,
        subCluster.name,
        tagsToAssign,
        supertags,
        supertags.find(s => s.id === supertagId)?.color || '#6366F1'
      );

      toast.success(`Approved sub-cluster "${subCluster.name}" into "${supertagName}"`, {
        description: `Created sub-cluster with ${tagsToAssign.length} tags across ${subCluster.itemCount} item${subCluster.itemCount === 1 ? '' : 's'}.`
      });

      // Remove approved sub-cluster from state
      setDisplayedSubClusters(prev => ({
        ...prev,
        [supertagId]: (prev[supertagId] || []).filter(sc => sc.id !== subCluster.id)
      }));

      // Remove assigned tags from suggestions across all supertags
      const assignedSet = new Set(tagsToAssign);
      setDisplayedSuggestions(prev => {
        const next: Record<string, SupertagTagSuggestion[]> = {};
        Object.keys(prev).forEach(stId => {
          next[stId] = (prev[stId] || []).filter(s => !assignedSet.has(s.tag.toLowerCase().trim()));
        });
        return next;
      });

      // Stage in organize assignments
      setOrganizeAssignments(prev => {
        const next = { ...prev };
        tagsToAssign.forEach(t => { 
          next[t] = Array.from(new Set([...(next[t] || []), supertagId])); 
        });
        return next;
      });
      setSelectedOrganizeTags(prev => {
        const next = new Set(prev);
        tagsToAssign.forEach(t => next.add(t));
        return next;
      });
    } catch (err: any) {
      toast.error('Failed to approve sub-cluster: ' + err.message);
    }
  };

  // 2. Create child sub-supertag from sub-cluster
  const handleCreateSubSupertagFromCluster = async (parentSupertag: Supertag, subCluster: SupertagSubClusterSuggestion) => {
    const clusterName = subCluster.name.trim();
    if (!clusterName) return;

    const tagsToAssign = Array.from(new Set(subCluster.tags.map(t => t.toLowerCase().trim()))).filter(Boolean);

    try {
      const parentBaseName = parentSupertag.name.split('/')[0].trim();
      const newSupertagTitle = `${parentBaseName} / ${clusterName}`;
      
      await supertagService.create(userId, {
        name: newSupertagTitle,
        color: parentSupertag.color || '#6366F1',
        description: `Sub-cluster for ${parentSupertag.name} (from bookmark folder "${subCluster.folderPathDisplay}")`,
        tags: tagsToAssign
      });

      toast.success(`Created sub-supercluster "${newSupertagTitle}"`, {
        description: `Pre-assigned ${tagsToAssign.length} member tags from bookmark hierarchy.`
      });

      // Remove this sub-cluster from suggestions
      setDisplayedSubClusters(prev => ({
        ...prev,
        [parentSupertag.id]: (prev[parentSupertag.id] || []).filter(sc => sc.id !== subCluster.id)
      }));
    } catch (err: any) {
      toast.error('Failed to create sub-supercluster: ' + err.message);
    }
  };

  // 3. Reject / Dismiss sub-cluster
  const handleRejectSubCluster = (supertagId: string, supertagName: string, subCluster: SupertagSubClusterSuggestion) => {
    addRejectedSubClusterSignature(userId, subCluster.id);
    setRejectedSubClusters(prev => new Set(prev).add(subCluster.id));

    // Remove from UI immediately
    setDisplayedSubClusters(prev => ({
      ...prev,
      [supertagId]: (prev[supertagId] || []).filter(sc => sc.id !== subCluster.id)
    }));

    toast.info(`Dismissed sub-cluster "${subCluster.name}"`, {
      action: {
        label: 'Undo',
        onClick: () => {
          removeRejectedSubClusterSignature(userId, subCluster.id);
          setRejectedSubClusters(prev => {
            const next = new Set(prev);
            next.delete(subCluster.id);
            return next;
          });
          setDisplayedSubClusters(prev => ({
            ...prev,
            [supertagId]: [...(prev[supertagId] || []), subCluster]
          }));
        }
      }
    });
  };

  // 4. Restore all rejected sub-clusters
  const handleRestoreAllRejectedSubClusters = () => {
    clearAllRejectedSubClusterSignatures(userId);
    setRejectedSubClusters(new Set());
    const { suggestionsMap, subClustersMap } = computeRecommendationsMap(supertags, standaloneTags, dismissedSuggestions, new Set());
    setDisplayedSuggestions(suggestionsMap);
    setDisplayedSubClusters(subClustersMap);
    toast.success('Restored all dismissed sub-cluster suggestions');
  };

  // 5. Start / Save Rename for Sub-Cluster
  const handleStartRenameSubCluster = (supertagId: string, subCluster: SupertagSubClusterSuggestion) => {
    setEditingSubCluster({
      supertagId,
      subClusterId: subCluster.id,
      name: subCluster.name
    });
  };

  const handleSaveRenameSubCluster = (supertagId: string, subClusterId: string) => {
    if (!editingSubCluster || editingSubCluster.subClusterId !== subClusterId) return;
    const newName = editingSubCluster.name.trim();
    if (!newName) {
      toast.error('Sub-cluster name cannot be empty');
      return;
    }

    setDisplayedSubClusters(prev => ({
      ...prev,
      [supertagId]: (prev[supertagId] || []).map(sc => {
        if (sc.id === subClusterId) {
          return { ...sc, name: newName };
        }
        return sc;
      })
    }));

    setEditingSubCluster(null);
    toast.success(`Renamed sub-cluster to "${newName}"`);
  };

  // 6. Remove tag from sub-cluster before approving
  const handleRemoveTagFromSubCluster = (supertagId: string, subClusterId: string, tagToRemove: string) => {
    setDisplayedSubClusters(prev => ({
      ...prev,
      [supertagId]: (prev[supertagId] || []).map(sc => {
        if (sc.id === subClusterId) {
          return { ...sc, tags: sc.tags.filter(t => t.toLowerCase().trim() !== tagToRemove.toLowerCase().trim()) };
        }
        return sc;
      })
    }));
  };

  // 7. Add tag to sub-cluster before approving
  const handleAddTagToSubCluster = (supertagId: string, subClusterId: string, tagToAdd: string) => {
    const cleanTag = tagToAdd.toLowerCase().trim().replace(/^#+/, '');
    if (!cleanTag) return;

    setDisplayedSubClusters(prev => ({
      ...prev,
      [supertagId]: (prev[supertagId] || []).map(sc => {
        if (sc.id === subClusterId) {
          if (sc.tags.includes(cleanTag)) return sc;
          return { ...sc, tags: [...sc.tags, cleanTag] };
        }
        return sc;
      })
    }));

    setSubClusterNewTagInputs(prev => ({ ...prev, [subClusterId]: '' }));
  };

  // Quick 1-click add suggested tag to a supertag (DO NOT pull in new recommendations immediately)
  const handleQuickAssignTagToSupertag = async (supertagId: string, supertagName: string, tag: string) => {
    const cleanTag = tag.toLowerCase().trim();
    try {
      await supertagService.addTagToSupertag(supertagId, cleanTag, supertags);
      toast.success(`Assigned #${cleanTag} to supertag "${supertagName}"`);

      // Remove this tag from displayed suggestions across all supertags without pulling in any new recommendations
      setDisplayedSuggestions(prev => {
        const next: Record<string, SupertagTagSuggestion[]> = {};
        Object.keys(prev).forEach(stId => {
          next[stId] = (prev[stId] || []).filter(s => s.tag.toLowerCase().trim() !== cleanTag);
        });
        return next;
      });

      // Update local staged mapping
      setOrganizeAssignments(prev => ({
        ...prev,
        [tag]: Array.from(new Set([...(prev[tag] || []), supertagId]))
      }));
      setSelectedOrganizeTags(prev => new Set(prev).add(tag));
    } catch (err: any) {
      toast.error('Failed to assign tag: ' + err.message);
    }
  };

  // Quick 1-click dismiss/remove suggested tag from supertag recommendations (WITHOUT auto-replacing with new items)
  const handleDismissSupertagSuggestion = (supertagId: string, supertagName: string, tag: string, sugObj?: SupertagTagSuggestion) => {
    const tagLower = tag.toLowerCase().trim();
    const signature = `${supertagId}::${tagLower}`;
    addDismissedSupertagSuggestion(userId, signature);
    setDismissedSuggestions(prev => new Set(prev).add(signature));

    // Remove ONLY this tag from displayed suggestions without pulling replacements
    setDisplayedSuggestions(prev => ({
      ...prev,
      [supertagId]: (prev[supertagId] || []).filter(s => s.tag.toLowerCase().trim() !== tagLower)
    }));

    // If this tag was staged specifically for this supertag, unstage it
    if ((organizeAssignments[tag] || []).includes(supertagId)) {
      setOrganizeAssignments(prev => ({
        ...prev,
        [tag]: (prev[tag] || []).filter(id => id !== supertagId)
      }));
      if ((organizeAssignments[tag] || []).length <= 1) {
        setSelectedOrganizeTags(prev => {
          const next = new Set(prev);
          next.delete(tag);
          return next;
        });
      }
    }

    toast.info(`Removed #${tag} from "${supertagName}" suggestions`, {
      action: {
        label: 'Undo',
        onClick: () => {
          removeDismissedSupertagSuggestion(userId, signature);
          setDismissedSuggestions(prev => {
            const next = new Set(prev);
            next.delete(signature);
            return next;
          });
          if (sugObj) {
            setDisplayedSuggestions(prev => ({
              ...prev,
              [supertagId]: [...(prev[supertagId] || []), sugObj]
            }));
          }
        }
      }
    });
  };

  // Restore all dismissed suggestions across all supertags
  const handleRestoreAllDismissedSuggestions = () => {
    clearAllDismissedSupertagSuggestions(userId);
    setDismissedSuggestions(new Set());
    const { suggestionsMap, subClustersMap } = computeRecommendationsMap(supertags, standaloneTags, new Set(), rejectedSubClusters);
    setDisplayedSuggestions(suggestionsMap);
    setDisplayedSubClusters(subClustersMap);
    toast.success('Restored all dismissed tag recommendations');
  };

  // 1-click add all suggested tags for a specific supertag, and then recompute recommendations for that supertag
  const handleAssignAllSuggestedForSupertag = async (supertagId: string, supertagName: string, tagsToAssign: string[]) => {
    if (tagsToAssign.length === 0) return;
    try {
      await supertagService.batchAssignTags(
        tagsToAssign.map(t => ({ supertagId, tag: t })),
        supertags
      );
      toast.success(`Assigned ${tagsToAssign.length} tags to "${supertagName}"`);
      setOrganizeAssignments(prev => {
        const next = { ...prev };
        tagsToAssign.forEach(t => { 
          next[t] = Array.from(new Set([...(next[t] || []), supertagId])); 
        });
        return next;
      });
      setSelectedOrganizeTags(prev => {
        const next = new Set(prev);
        tagsToAssign.forEach(t => next.add(t));
        return next;
      });

      // Refresh recommendations for this supertag after "Add All"
      const targetSt = supertags.find(s => s.id === supertagId);
      if (targetSt) {
        const updatedSt: Supertag = {
          ...targetSt,
          tags: Array.from(new Set([...(targetSt.tags || []), ...tagsToAssign]))
        };
        const assignedSet = new Set(tagsToAssign.map(t => t.toLowerCase().trim()));
        const remainingStandalone = standaloneTags.filter(t => !assignedSet.has(t.toLowerCase().trim()));
        const recGroups = getSupertagTagRecommendations([updatedSt], remainingStandalone, tagCounts, items, dismissedSuggestions, rejectedSubClusters);
        setDisplayedSuggestions(prev => {
          const next = { ...prev };
          // Remove assigned tags from all other supertags
          Object.keys(next).forEach(stId => {
            next[stId] = (next[stId] || []).filter(s => !assignedSet.has(s.tag.toLowerCase().trim()));
          });
          // Update target supertag with fresh recommendations
          next[supertagId] = recGroups[0]?.suggestions || [];
          return next;
        });
        setDisplayedSubClusters(prev => ({
          ...prev,
          [supertagId]: recGroups[0]?.subClusters || []
        }));
      }
    } catch (err: any) {
      toast.error('Failed to assign suggestions: ' + err.message);
    }
  };

  // Auto-fill all standalone tags with their best suggested supertag
  const handleAutoFillAllRecommendations = () => {
    const newOrg: Record<string, string[]> = { ...organizeAssignments };
    const newSelected = new Set(selectedOrganizeTags);
    let matchedCount = 0;

    standaloneTags.forEach(tag => {
      const suggestion = suggestSupertagForTag(tag, [], supertags, items);
      if (suggestion.supertagId) {
        newOrg[tag] = Array.from(new Set([...(newOrg[tag] || []), suggestion.supertagId]));
        newSelected.add(tag);
        matchedCount++;
      }
    });

    setOrganizeAssignments(newOrg);
    setSelectedOrganizeTags(newSelected);
    toast.success(`Auto-matched ${matchedCount} standalone tags to supertags!`);
  };

  // Reject a smart normalization suggestion and make it vanish immediately
  const handleRejectCluster = (cluster: TagCluster) => {
    const signature = getClusterSignature(cluster.sourceTags);
    addRejectedClusterSignature(userId, signature);
    setRejectedSignatures(prev => new Set(prev).add(signature));

    // Remove immediately from UI state
    setClusterConfigs(prev => prev.filter(c => c.id !== cluster.id));
    setSelectedClusterIds(prev => {
      const next = new Set(prev);
      next.delete(cluster.id);
      return next;
    });

    toast.info(`Dismissed suggestion for "${cluster.targetTag}"`, {
      action: {
        label: 'Undo',
        onClick: () => {
          removeRejectedClusterSignature(userId, signature);
          setRejectedSignatures(prev => {
            const next = new Set(prev);
            next.delete(signature);
            return next;
          });
          setClusterConfigs(prev => [
            {
              ...cluster,
              assignedSupertagId: cluster.suggestedSupertagId || 'none'
            },
            ...prev
          ]);
          setSelectedClusterIds(prev => new Set(prev).add(cluster.id));
        }
      }
    });
  };

  // Restore all rejected suggestions
  const handleRestoreAllRejectedSuggestions = () => {
    clearAllRejectedClusterSignatures(userId);
    setRejectedSignatures(new Set());
    const restored = findRedundantTagClusters(allTags, tagCounts, supertags, new Set());
    const initialized = restored.map(c => ({
      ...c,
      assignedSupertagId: c.suggestedSupertagId || 'none'
    }));
    setClusterConfigs(initialized);
    setSelectedClusterIds(new Set(initialized.map(c => c.id)));
    toast.success('Restored all dismissed suggestions');
  };

  const toggleClusterSelection = (id: string) => {
    setSelectedClusterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllClusters = () => {
    if (selectedClusterIds.size === clusterConfigs.length) {
      setSelectedClusterIds(new Set());
    } else {
      setSelectedClusterIds(new Set(clusterConfigs.map(c => c.id)));
    }
  };

  const handleUpdateTargetTag = (clusterId: string, newTarget: string) => {
    setClusterConfigs(prev => prev.map(c => {
      if (c.id === clusterId) {
        const trimmed = newTarget.trim();
        const newSuggestion = suggestSupertagForTag(trimmed, c.sourceTags, supertags, items);
        return { 
          ...c, 
          targetTag: trimmed,
          suggestedSupertagId: newSuggestion.supertagId,
          suggestedSupertagName: newSuggestion.supertagName,
          supertagReason: newSuggestion.reason,
          // Only auto-update assignedSupertagId if user hasn't explicitly set another
          assignedSupertagId: c.assignedSupertagId === 'none' || c.assignedSupertagId === c.suggestedSupertagId 
            ? (newSuggestion.supertagId || 'none') 
            : c.assignedSupertagId
        };
      }
      return c;
    }));
  };

  const handleUpdateSupertagForCluster = (clusterId: string, supertagId: string) => {
    setClusterConfigs(prev => prev.map(c => {
      if (c.id === clusterId) {
        return { ...c, assignedSupertagId: supertagId };
      }
      return c;
    }));
  };

  const handleRemoveSourceTag = (clusterId: string, tagToRemove: string) => {
    setClusterConfigs(prev => prev.map(c => {
      if (c.id === clusterId) {
        const remaining = c.sourceTags.filter(t => t !== tagToRemove);
        const newTarget = c.targetTag === tagToRemove ? (remaining[0] || '') : c.targetTag;
        const newTotal = remaining.reduce((sum, t) => sum + (tagCounts[t] || 0), 0);
        return { ...c, sourceTags: remaining, targetTag: newTarget, totalItemCount: newTotal };
      }
      return c;
    }).filter(c => c.sourceTags.length > 1));
  };

  const calculateAffectedItemsCount = useMemo(() => {
    const selectedClusters = clusterConfigs.filter(c => selectedClusterIds.has(c.id));
    const targetSourceTags = new Set(selectedClusters.flatMap(c => c.sourceTags.filter(t => t !== c.targetTag)));
    
    let count = 0;
    for (const item of items) {
      if (item.tags && item.tags.some(t => targetSourceTags.has(t))) {
        count++;
      }
    }
    return count;
  }, [clusterConfigs, selectedClusterIds, items]);

  const handleCreateQuickSupertag = async () => {
    if (!newSupertagName.trim()) return;
    try {
      const id = await supertagService.create(userId, {
        name: newSupertagName.trim(),
        color: '#6366F1',
        icon: 'folder',
        tags: []
      });
      toast.success(`Created supertag "${newSupertagName.trim()}"`);
      setNewSupertagName('');
      setIsCreatingSupertag(false);
      
      // Auto-assign to active manual or organize
      if (activeTab === 'manual') {
        setManualTargetSupertagId(id);
      }
    } catch (err: any) {
      toast.error('Failed to create supertag: ' + err.message);
    }
  };

  const handleExecuteMergeSuggestions = async () => {
    const selected = clusterConfigs.filter(c => selectedClusterIds.has(c.id) && c.targetTag.trim() !== '');
    if (selected.length === 0) {
      toast.error('Please select at least one cluster to merge.');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading(`Normalizing tags and organizing supertags...`);

    try {
      // 1. Merge item tags across the library
      const result = await contentService.batchMergeTags(
        selected.map(c => ({
          sourceTags: c.sourceTags,
          targetTag: c.targetTag
        })),
        items,
        (completed, total) => {
          setProgress({ current: completed, total });
        }
      );

      // 2. Assign canonical tags to their selected supertags
      const supertagAssignments: Array<{ supertagId: string; tag: string }> = [];
      selected.forEach(c => {
        if (c.assignedSupertagId && c.assignedSupertagId !== 'none') {
          supertagAssignments.push({
            supertagId: c.assignedSupertagId,
            tag: c.targetTag.toLowerCase().trim()
          });
        }
      });

      if (supertagAssignments.length > 0) {
        await supertagService.batchAssignTags(supertagAssignments, supertags);
      }

      toast.dismiss(toastId);
      toast.success(
        `Normalized ${result.mergedClustersCount} tag clusters across ${result.updatedCount} items!` +
        (supertagAssignments.length > 0 ? ` (${supertagAssignments.length} tags assigned to supertags)` : '')
      );
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error('Failed to normalize tags: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleExecuteManualMerge = async () => {
    if (manualSelectedTags.length < 2) {
      toast.error('Please select at least 2 tags to merge.');
      return;
    }
    if (!manualTargetTag.trim()) {
      toast.error('Please specify the destination canonical tag name.');
      return;
    }

    const cleanTarget = manualTargetTag.trim().toLowerCase();
    setIsProcessing(true);
    const toastId = toast.loading(`Merging ${manualSelectedTags.length} tags into "#${cleanTarget}"...`);

    try {
      const result = await contentService.batchMergeTags(
        [{
          sourceTags: manualSelectedTags,
          targetTag: cleanTarget
        }],
        items,
        (completed, total) => {
          setProgress({ current: completed, total });
        }
      );

      if (manualTargetSupertagId && manualTargetSupertagId !== 'none') {
        await supertagService.batchAssignTags(
          [{ supertagId: manualTargetSupertagId, tag: cleanTarget }],
          supertags
        );
      }

      toast.dismiss(toastId);
      toast.success(`Merged ${manualSelectedTags.length} tags into "#${cleanTarget}" (${result.updatedCount} items updated)!`);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error('Manual merge failed: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleExecuteOrganizeStandalone = async () => {
    const assignmentsToApply: Array<{ supertagId: string; tag: string }> = [];
    selectedOrganizeTags.forEach(tag => {
      const sIds = organizeAssignments[tag] || [];
      sIds.forEach(sId => {
        if (sId && sId !== 'none') {
          assignmentsToApply.push({ supertagId: sId, tag });
        }
      });
    });

    if (assignmentsToApply.length === 0) {
      toast.error('Please select at least one tag with an assigned supertag.');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading(`Placing ${assignmentsToApply.length} tag memberships into supertag folders...`);

    try {
      await supertagService.batchAssignTags(assignmentsToApply, supertags);
      toast.dismiss(toastId);
      toast.success(`Successfully assigned ${assignmentsToApply.length} tag memberships across supertags!`);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error('Organization failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const sortedTagsForManual = useMemo(() => {
    const sorted = sortTagsEmojiFirst(allTags);
    if (!manualTagSearch) return sorted;
    const q = manualTagSearch.toLowerCase();
    return sorted.filter(t => t.toLowerCase().includes(q));
  }, [allTags, manualTagSearch]);

  const filteredStandaloneTags = useMemo(() => {
    if (!organizeTagSearch) return standaloneTags;
    const q = organizeTagSearch.toLowerCase();
    return standaloneTags.filter(t => t.toLowerCase().includes(q));
  }, [standaloneTags, organizeTagSearch]);

  // Tags filtered for Bulk Score Editor
  const filteredTagsForBulkScores = useMemo(() => {
    let list = allTags;
    if (bulkFilterMode === 'standalone') {
      const standaloneSet = new Set(standaloneTags);
      list = list.filter(t => standaloneSet.has(t));
    } else if (bulkFilterMode === 'scored') {
      list = list.filter(t => {
        const clean = t.toLowerCase().trim();
        const sc = tagScores[clean];
        return sc && (typeof sc.relevanceScore === 'number' || typeof sc.alivenessScore === 'number');
      });
    } else if (bulkFilterMode === 'unscored') {
      list = list.filter(t => {
        const clean = t.toLowerCase().trim();
        const sc = tagScores[clean];
        return !sc || (typeof sc.relevanceScore !== 'number' && typeof sc.alivenessScore !== 'number');
      });
    }

    if (bulkTagSearch.trim()) {
      const q = bulkTagSearch.trim().toLowerCase().replace(/^#+/, '');
      list = list.filter(t => t.toLowerCase().includes(q));
    }

    return list;
  }, [allTags, standaloneTags, tagScores, bulkFilterMode, bulkTagSearch]);

  // Total scored tags count
  const scoredTagsCount = useMemo(() => {
    return allTags.filter(t => {
      const clean = t.toLowerCase().trim();
      const sc = tagScores[clean];
      return sc && (typeof sc.relevanceScore === 'number' || typeof sc.alivenessScore === 'number');
    }).length;
  }, [allTags, tagScores]);

  // Bulk Apply Scores handler
  const handleExecuteBulkSaveTagScores = async () => {
    if (bulkSelectedTags.size === 0) {
      toast.error('Select at least one tag to update scores');
      return;
    }
    if (!bulkApplyRelevance && !bulkApplyAliveness) {
      toast.error('Enable at least one score (Relevance or Aliveness) to apply');
      return;
    }

    setIsBulkUpdatingScores(true);
    const toastId = toast.loading(`Updating scores for ${bulkSelectedTags.size} tags...`);
    try {
      const selectedTagsList = Array.from(bulkSelectedTags);
      const updates: Record<string, { relevanceScore?: number | null; alivenessScore?: number | null }> = {};
      
      selectedTagsList.forEach(t => {
        const clean = t.toLowerCase().trim();
        const existing = tagScores[clean] || {};
        updates[clean] = {
          relevanceScore: bulkApplyRelevance ? bulkRelevanceScore : (existing.relevanceScore ?? null),
          alivenessScore: bulkApplyAliveness ? bulkAlivenessScore : (existing.alivenessScore ?? null)
        };
      });

      await tagService.batchSaveTagScores(userId, updates);

      let updatedItemsCount = 0;
      if (bulkPropagateToItems) {
        const nextScoreMap: TagScoreMap = { ...tagScores };
        Object.keys(updates).forEach(k => {
          nextScoreMap[k] = { ...updates[k] };
        });
        const syncRes = await tagService.syncItemsScoreInheritance(
          selectedTagsList,
          nextScoreMap,
          items,
          bulkOverrideManualScores
        );
        updatedItemsCount = syncRes.updatedCount;
      }

      toast.dismiss(toastId);
      toast.success(`Updated scores for ${bulkSelectedTags.size} tags (${updatedItemsCount} items updated)`);
      setBulkSelectedTags(new Set());
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error('Failed to update scores: ' + err.message);
    } finally {
      setIsBulkUpdatingScores(false);
    }
  };

  // Clear scores for selected tags
  const handleClearBulkScores = async () => {
    if (bulkSelectedTags.size === 0) return;
    setIsBulkUpdatingScores(true);
    const toastId = toast.loading(`Clearing scores for ${bulkSelectedTags.size} tags...`);
    try {
      const selectedTagsList = Array.from(bulkSelectedTags);
      const updates: Record<string, { relevanceScore?: number | null; alivenessScore?: number | null }> = {};
      selectedTagsList.forEach(t => {
        const clean = t.toLowerCase().trim();
        updates[clean] = { relevanceScore: null, alivenessScore: null };
      });
      await tagService.batchSaveTagScores(userId, updates);
      toast.dismiss(toastId);
      toast.success(`Cleared scores for ${bulkSelectedTags.size} tags`);
      setBulkSelectedTags(new Set());
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error('Failed to clear scores: ' + err.message);
    } finally {
      setIsBulkUpdatingScores(false);
    }
  };

  // Single tag inline score update
  const handleSaveSingleTagScore = async (
    tag: string,
    scoreUpdate: { relevanceScore?: number | null; alivenessScore?: number | null }
  ) => {
    const clean = tag.toLowerCase().trim();
    try {
      await tagService.saveTagScore(userId, clean, scoreUpdate);
      const nextMap: TagScoreMap = { ...tagScores, [clean]: scoreUpdate };
      await tagService.syncItemsScoreInheritance([clean], nextMap, items, false);
      toast.success(`Updated #${clean} scores`);
    } catch (e: any) {
      toast.error('Failed to save score: ' + e.message);
    }
  };

  const toggleManualTagSelection = (tag: string) => {
    setManualSelectedTags(prev => {
      const exists = prev.includes(tag);
      const next = exists ? prev.filter(t => t !== tag) : [...prev, tag];
      if (!manualTargetTag && next.length > 0) {
        setManualTargetTag(next[0]);
        const stSugg = suggestSupertagForTag(next[0], [], supertags, items);
        if (stSugg.supertagId) {
          setManualTargetSupertagId(stSugg.supertagId);
        }
      }
      return next;
    });
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-[#141416] w-full max-w-4xl rounded-lg border border-white/10 overflow-hidden relative z-10 shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1A1A1D] shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded text-indigo-400">
                  <FolderTree size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white flex items-center gap-2">
                    TAXONOMY_NORMALIZER & SUPERTAG_ROUTER
                  </h2>
                  <p className="text-[10px] font-mono text-white/40">
                    Eliminate redundant tags, standardize spelling, and route tags into supertag folders/clusters
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                disabled={isProcessing}
                className="text-white/40 hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between px-6 pt-3 border-b border-white/5 bg-[#141416] shrink-0">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('suggestions')}
                  className={cn(
                    "px-3 py-2 text-[11px] font-mono uppercase font-bold tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                    activeTab === 'suggestions'
                      ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                      : "border-transparent text-white/40 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Sparkles size={12} />
                  <span>SMART_NORMALIZATION ({clusterConfigs.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('organize')}
                  className={cn(
                    "px-3 py-2 text-[11px] font-mono uppercase font-bold tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                    activeTab === 'organize'
                      ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                      : "border-transparent text-white/40 hover:text-white hover:bg-white/5"
                  )}
                >
                  <FolderTree size={12} />
                  <span>ORGANIZE_STANDALONE ({standaloneTags.length})</span>
                  {totalSuggestedTagsCount > 0 && (
                    <span className="size-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center font-bold">
                      {totalSuggestedTagsCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={cn(
                    "px-3 py-2 text-[11px] font-mono uppercase font-bold tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                    activeTab === 'manual'
                      ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                      : "border-transparent text-white/40 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Layers size={12} />
                  <span>CUSTOM_MERGE ({manualSelectedTags.length} SELECTED)</span>
                </button>
              </div>

              {activeTab === 'suggestions' && clusterConfigs.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllClusters}
                  className="text-[10px] font-mono text-white/50 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {selectedClusterIds.size === clusterConfigs.length ? (
                    <>
                      <CheckSquare size={12} className="text-indigo-400" />
                      <span>DESELECT_ALL</span>
                    </>
                  ) : (
                    <>
                      <Square size={12} />
                      <span>SELECT_ALL</span>
                    </>
                  )}
                </button>
              )}

              {activeTab === 'organize' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshRecommendations}
                    disabled={isRefreshingRecs}
                    className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded cursor-pointer active:scale-95"
                    title="Recalculate tag recommendations based on supertag names and assigned tags"
                  >
                    <RefreshCw size={11} className={cn(isRefreshingRecs ? "animate-spin text-indigo-300" : "")} />
                    <span>REFRESH_RECOMMENDATIONS</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              {/* Processing Progress Bar */}
              {isProcessing && progress && (
                <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded mb-4 space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-indigo-300 font-bold flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin text-indigo-400" />
                      SYNCHRONIZING_TAXONOMY_TREE...
                    </span>
                    <span className="text-white/60">
                      {progress.current} / {progress.total} items
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-200"
                      style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Create new supertag quick inline bar */}
              {isCreatingSupertag && (
                <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded flex items-center gap-3">
                  <FolderPlus size={16} className="text-indigo-400 shrink-0" />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newSupertagName}
                      onChange={e => setNewSupertagName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateQuickSupertag()}
                      placeholder="e.g. 🤖 AI & Machine Learning, 📚 Books, 💻 Web Dev..."
                      className="w-full bg-black/60 border border-indigo-500/40 rounded px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-indigo-400"
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateQuickSupertag}
                    disabled={!newSupertagName.trim()}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer"
                  >
                    SAVE
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsCreatingSupertag(false); setNewSupertagName(''); }}
                    className="px-2 py-1 text-white/40 hover:text-white text-[10px] font-mono cursor-pointer"
                  >
                    CANCEL
                  </button>
                </div>
              )}

              {activeTab === 'suggestions' ? (
                <div>
                      {clusterConfigs.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                          <div className="size-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <Check size={22} />
                          </div>
                          <div>
                            <h3 className="text-xs font-bold font-mono uppercase text-white tracking-wider">
                              NO_REDUNDANT_TAGS_DETECTED
                            </h3>
                            <p className="text-[11px] text-white/40 max-w-md mt-1">
                              All tags appear distinct! You can route standalone tags into supertags using the <strong className="text-indigo-400">ORGANIZE_STANDALONE</strong> tab above.
                            </p>
                          </div>
                          {rejectedSignatures.size > 0 && (
                            <button
                              type="button"
                              onClick={handleRestoreAllRejectedSuggestions}
                              className="mt-2 text-[10px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 cursor-pointer underline"
                            >
                              <RotateCcw size={11} />
                              <span>Restore {rejectedSignatures.size} dismissed suggestions</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <p className="text-[10px] text-white/40 font-mono uppercase">
                                Review redundancies. Click Reject (✕) to dismiss suggestions.
                              </p>
                              {rejectedSignatures.size > 0 && (
                                <button
                                  type="button"
                                  onClick={handleRestoreAllRejectedSuggestions}
                                  className="text-[9px] font-mono text-indigo-400/80 hover:text-indigo-300 flex items-center gap-1 cursor-pointer underline"
                                  title="Unhide previously dismissed suggestions"
                                >
                                  <RotateCcw size={10} />
                                  <span>{rejectedSignatures.size} dismissed (Restore)</span>
                                </button>
                              )}
                            </div>
                            {!isCreatingSupertag && (
                              <button
                                type="button"
                                onClick={() => setIsCreatingSupertag(true)}
                                className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                <Plus size={11} />
                                <span>+ NEW_SUPERTAG</span>
                              </button>
                            )}
                          </div>

                          {clusterConfigs.map((cluster) => {
                            const isSelected = selectedClusterIds.has(cluster.id);
                            const assignedSupertag = supertags.find(s => s.id === cluster.assignedSupertagId);

                            return (
                              <div
                                key={cluster.id}
                                className={cn(
                                  "p-3.5 rounded border transition-all flex flex-col gap-3 group/clustercard",
                                  isSelected
                                    ? "bg-indigo-950/20 border-indigo-500/40"
                                    : "bg-white/[0.02] border-white/5 opacity-60"
                                )}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  {/* Left: Source Tags */}
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleClusterSelection(cluster.id)}
                                      className="size-4 accent-indigo-500 rounded border border-white/20 bg-black cursor-pointer shrink-0 mt-1"
                                    />

                                    <div className="space-y-1.5 flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[9px] font-mono uppercase text-white/40 font-bold mr-1">
                                          MERGE:
                                        </span>
                                        {cluster.sourceTags.map((sourceTag) => (
                                          <span
                                            key={sourceTag}
                                            className={cn(
                                              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border",
                                              sourceTag === cluster.targetTag
                                                ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200 font-bold"
                                                : "bg-white/5 border-white/10 text-white/60"
                                            )}
                                          >
                                            <span>#{sourceTag}</span>
                                            <span className="text-[8px] opacity-60">({tagCounts[sourceTag] || 0})</span>
                                            {cluster.sourceTags.length > 2 && (
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveSourceTag(cluster.id, sourceTag)}
                                                className="text-white/20 hover:text-red-400 transition-colors ml-0.5 cursor-pointer"
                                                title="Exclude from this group"
                                              >
                                                <X size={10} />
                                              </button>
                                            )}
                                          </span>
                                        ))}
                                      </div>

                                      <p className="text-[9px] text-white/40 font-mono italic">
                                        {cluster.reason}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Right: Target Canonical Tag + Supertag Folder Selector + Reject Action */}
                                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2.5 shrink-0">
                                    {/* Canonical input */}
                                    <div className="flex items-center gap-1.5">
                                      <ArrowRight size={13} className="text-indigo-400 shrink-0" />
                                      <div>
                                        <input
                                          type="text"
                                          value={cluster.targetTag}
                                          onChange={(e) => handleUpdateTargetTag(cluster.id, e.target.value)}
                                          className="bg-black/60 border border-indigo-500/40 rounded px-2.5 py-1 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-400 w-32 sm:w-36"
                                          placeholder="canonical-tag"
                                          title="Canonical Tag Name"
                                        />
                                      </div>
                                    </div>

                                    {/* Supertag Router selector */}
                                    <div className="flex flex-col items-end gap-1">
                                      <div className="relative">
                                        <select
                                          value={cluster.assignedSupertagId}
                                          onChange={(e) => {
                                            if (e.target.value === '__new__') {
                                              setIsCreatingSupertag(true);
                                            } else {
                                              handleUpdateSupertagForCluster(cluster.id, e.target.value);
                                            }
                                          }}
                                          className={cn(
                                            "appearance-none bg-black/70 border rounded px-2.5 py-1 pr-6 text-[10px] font-mono cursor-pointer transition-all focus:outline-none",
                                            cluster.assignedSupertagId !== 'none'
                                              ? "border-indigo-500/60 text-indigo-300 bg-indigo-950/30"
                                              : "border-white/10 text-white/50"
                                          )}
                                        >
                                          <option value="none">📁 No Supertag (Standalone)</option>
                                          {supertags.map(st => (
                                            <option key={st.id} value={st.id}>
                                              📂 Supertag: {st.name} ({st.tags?.length || 0} tags)
                                            </option>
                                          ))}
                                          <option value="__new__">+ Create New Supertag...</option>
                                        </select>
                                        <ChevronDown size={11} className="absolute right-2 top-2 pointer-events-none opacity-40 text-white" />
                                      </div>

                                      {cluster.suggestedSupertagId && cluster.assignedSupertagId === cluster.suggestedSupertagId && (
                                        <span className="text-[8px] font-mono text-indigo-400/80 flex items-center gap-1">
                                          <Sparkles size={8} /> Auto-suggested
                                        </span>
                                      )}
                                    </div>

                                    <span className="text-[9px] font-mono text-indigo-300/70 bg-indigo-500/10 px-1.5 py-0.5 rounded shrink-0">
                                      {cluster.totalItemCount} items
                                    </span>

                                    {/* Reject Suggestion Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleRejectCluster(cluster)}
                                      className="px-2 py-1 bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-300 border border-white/10 hover:border-rose-500/40 rounded text-[9px] font-mono uppercase font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 ml-1"
                                      title="Reject this suggestion and remove it"
                                    >
                                      <Ban size={10} />
                                      <span>Reject</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                </div>
              ) : activeTab === 'organize' ? (
                /* ORGANIZE STANDALONE TAGS TAB */
                <div className="space-y-4">
                  {/* Top Bar / SECTION 1: SUPERTAG CLUSTERS OVERVIEW */}
                  <div className="bg-white/[0.02] border border-white/10 rounded overflow-hidden">
                    <div
                      onClick={() => toggleSection('supertagsOverview')}
                      className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        {collapsedSections.supertagsOverview ? (
                          <ChevronRight size={14} className="text-white/40" />
                        ) : (
                          <ChevronDown size={14} className="text-white/40" />
                        )}
                        <FolderTree size={14} className="text-indigo-400" />
                        <h4 className="text-xs font-bold font-mono uppercase text-white tracking-wider">
                          ACTIVE_SUPERTAG_CLUSTERS ({supertags.length})
                        </h4>
                        <span className="text-[10px] font-mono text-white/40 hidden sm:inline">
                          — Cluster folders for organizing member tags
                        </span>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={handleRefreshRecommendations}
                          disabled={isRefreshingRecs}
                          className="px-2 py-0.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:border-indigo-400 rounded text-[9px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-sm"
                          title="Refresh tag recommendations using latest supertag names and member tags"
                        >
                          <RefreshCw size={10} className={cn(isRefreshingRecs ? "animate-spin text-white" : "text-indigo-300")} />
                          <span>{isRefreshingRecs ? 'REFRESHING...' : 'REFRESH_RECS'}</span>
                        </button>

                        {!isCreatingSupertag && (
                          <button
                            type="button"
                            onClick={() => setIsCreatingSupertag(true)}
                            className="px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded text-[9px] font-mono text-white/80 hover:text-white font-bold uppercase transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Plus size={10} />
                            <span>NEW_SUPERTAG</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {!collapsedSections.supertagsOverview && (
                      <div className="p-3 pt-1 border-t border-white/5 space-y-2">
                        <p className="text-[10px] font-mono text-white/40">
                          Suggestions are dynamically tailored to each supertag's name, its assigned member tags, and library co-occurrences.
                        </p>

                        {supertags.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {supertags.map(st => (
                              <div
                                key={st.id}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-mono text-white/80 group/stchip hover:border-indigo-500/40 transition-all"
                              >
                                <div className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: st.color || '#6366F1' }} />
                                <span className="font-bold">{st.name}</span>
                                <span className="text-white/40 text-[8px]">({st.tags?.length || 0} tags)</span>
                                <button
                                  type="button"
                                  onClick={() => setRenamingSupertag(st)}
                                  className="opacity-0 group-hover/stchip:opacity-100 hover:text-indigo-300 p-0.5 transition-opacity cursor-pointer text-white/40 ml-0.5"
                                  title="Rename supertag cluster"
                                >
                                  <Edit2 size={9} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] font-mono text-white/30 italic">
                            No supertags created yet. Click "+ NEW_SUPERTAG" to group tags.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 2: RECOMMENDATIONS & SUB-CLUSTERS FOR EACH EXISTING SUPERTAG */}
                  <div className="bg-white/[0.02] border border-white/10 rounded overflow-hidden">
                    <div
                      onClick={() => toggleSection('supertagSuggestions')}
                      className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {collapsedSections.supertagSuggestions ? (
                          <ChevronRight size={14} className="text-white/40" />
                        ) : (
                          <ChevronDown size={14} className="text-white/40" />
                        )}
                        <Zap size={14} className="text-amber-400" />
                        <h4 className="text-xs font-bold font-mono uppercase text-white tracking-wider">
                          TAG_&_SUBCLUSTER_SUGGESTIONS
                        </h4>
                        {totalSubClustersCount > 0 && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 rounded flex items-center gap-1">
                            <FolderTree size={9} />
                            <span>{totalSubClustersCount} sub-clusters</span>
                          </span>
                        )}
                        {totalSuggestedTagsCount > 0 && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded">
                            {totalSuggestedTagsCount} tag suggestions
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {rejectedSubClusters.size > 0 && (
                          <button
                            type="button"
                            onClick={handleRestoreAllRejectedSubClusters}
                            className="text-[9px] font-mono text-purple-400/80 hover:text-purple-300 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Restore all previously rejected sub-cluster suggestions"
                          >
                            <RotateCcw size={9} />
                            <span>RESTORE_CLUSTERS ({rejectedSubClusters.size})</span>
                          </button>
                        )}

                        {dismissedSuggestions.size > 0 && (
                          <button
                            type="button"
                            onClick={handleRestoreAllDismissedSuggestions}
                            className="text-[9px] font-mono text-rose-400/80 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Restore all previously dismissed tag suggestions"
                          >
                            <RotateCcw size={9} />
                            <span>RESTORE_TAGS ({dismissedSuggestions.size})</span>
                          </button>
                        )}

                        {totalSuggestedTagsCount > 0 && (
                          <button
                            type="button"
                            onClick={handleAutoFillAllRecommendations}
                            className="text-[9px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Stage all high-confidence recommendations into the bottom matrix"
                          >
                            <Sparkles size={10} />
                            <span>AUTO-STAGE ({totalSuggestedTagsCount})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {!collapsedSections.supertagSuggestions && (
                      <div className="p-3 pt-0 border-t border-white/5 space-y-3">
                        <p className="text-[10px] font-mono text-white/40 mt-2">
                          Analyzes bookmark folder paths, tag hierarchy trees, member similarities, and library co-occurrences.
                        </p>

                        {supertags.length === 0 ? (
                          <div className="p-5 bg-black/30 border border-white/5 rounded text-center space-y-2">
                            <FolderPlus size={18} className="mx-auto text-indigo-400/60" />
                            <p className="text-xs font-mono text-white/60">No Supertag Clusters Created</p>
                            <p className="text-[10px] text-white/40">Create your first supertag folder above to receive intelligent sub-cluster and tag recommendations.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3.5">
                            {supertags.map((st) => {
                              const memberTags = st.tags || [];
                              const suggestions = displayedSuggestions[st.id] || [];
                              const subClusters = displayedSubClusters[st.id] || [];
                              const isRefreshingThis = refreshingSupertagId === st.id;

                              return (
                                <div
                                  key={st.id}
                                  className="p-3.5 bg-[#17171A] border border-white/10 rounded-lg flex flex-col gap-3 shadow-sm hover:border-white/20 transition-all"
                                >
                                  {/* Card Header */}
                                  <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div
                                        className="size-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: st.color || '#6366F1' }}
                                      />
                                      <span className="text-xs font-mono font-bold text-white truncate" title={st.name}>
                                        {st.name}
                                      </span>
                                      <span className="text-[9px] font-mono text-white/40 px-1.5 py-0.2 bg-white/5 rounded shrink-0">
                                        {memberTags.length} member tag{memberTags.length === 1 ? '' : 's'}
                                      </span>
                                      {subClusters.length > 0 && (
                                        <span className="text-[9px] font-mono text-indigo-300/90 px-1.5 py-0.2 bg-indigo-500/10 border border-indigo-500/20 rounded shrink-0 flex items-center gap-1">
                                          <FolderTree size={9} />
                                          <span>{subClusters.length} sub-cluster{subClusters.length === 1 ? '' : 's'}</span>
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {suggestions.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleAssignAllSuggestedForSupertag(st.id, st.name, suggestions.map(s => s.tag))}
                                          className="px-2 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded text-[9px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1 shrink-0 active:scale-95"
                                          title={`Assign all ${suggestions.length} suggested tags to "${st.name}"`}
                                        >
                                          <Check size={9} />
                                          <span>Add All Tags ({suggestions.length})</span>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleRefreshSuggestionsForSupertag(st.id, st.name)}
                                        disabled={isRefreshingThis}
                                        className="p-1 bg-white/5 hover:bg-indigo-500/20 text-white/40 hover:text-indigo-300 border border-white/10 hover:border-indigo-500/40 rounded transition-all cursor-pointer shrink-0"
                                        title={`Refresh suggestions for "${st.name}"`}
                                      >
                                        <RefreshCw size={10} className={cn(isRefreshingThis ? "animate-spin text-indigo-300" : "")} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* SUB-CLUSTERS SECTION (FROM BOOKMARK FOLDER HIERARCHY) */}
                                  {subClusters.length > 0 && (
                                    <div className="space-y-2 bg-black/20 p-2.5 rounded border border-white/5">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <FolderTree size={11} className="text-indigo-400" />
                                          <span className="text-[10px] font-mono uppercase font-bold text-indigo-300 tracking-wider">
                                            SUGGESTED SUB-CLUSTERS
                                          </span>
                                          <span className="text-[9px] font-mono text-white/40">
                                            ({subClusters.length})
                                          </span>
                                        </div>
                                        <span className="text-[9px] font-mono text-white/30">
                                          from bookmark folder branches
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {subClusters.map((subCluster) => {
                                          const isEditingThis = editingSubCluster?.subClusterId === subCluster.id;
                                          const newTagInputVal = subClusterNewTagInputs[subCluster.id] || '';

                                          return (
                                            <div
                                              key={subCluster.id}
                                              className="p-2.5 bg-[#141416] border border-white/10 hover:border-indigo-500/30 rounded flex flex-col justify-between gap-2 transition-all shadow-sm"
                                            >
                                              {/* Sub-cluster Header */}
                                              <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-1.5">
                                                  {isEditingThis ? (
                                                    <div className="flex items-center gap-1 flex-1">
                                                      <input
                                                        type="text"
                                                        value={editingSubCluster.name}
                                                        onChange={(e) => setEditingSubCluster(prev => prev ? { ...prev, name: e.target.value } : null)}
                                                        onKeyDown={(e) => {
                                                          if (e.key === 'Enter') handleSaveRenameSubCluster(st.id, subCluster.id);
                                                          if (e.key === 'Escape') setEditingSubCluster(null);
                                                        }}
                                                        className="w-full bg-black/80 border border-indigo-500 rounded px-1.5 py-0.5 text-xs font-mono text-white font-bold focus:outline-none"
                                                        autoFocus
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={() => handleSaveRenameSubCluster(st.id, subCluster.id)}
                                                        className="p-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white rounded transition-colors cursor-pointer"
                                                        title="Save rename"
                                                      >
                                                        <Check size={11} />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => setEditingSubCluster(null)}
                                                        className="p-1 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded transition-colors cursor-pointer"
                                                        title="Cancel rename"
                                                      >
                                                        <X size={11} />
                                                      </button>
                                                    </div>
                                                  ) : (
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                      <FolderTree size={12} className="text-indigo-400 shrink-0" />
                                                      <span className="text-xs font-mono font-bold text-white truncate" title={subCluster.name}>
                                                        {subCluster.name}
                                                      </span>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleStartRenameSubCluster(st.id, subCluster)}
                                                        className="p-0.5 text-white/30 hover:text-indigo-300 rounded transition-colors cursor-pointer"
                                                        title="Rename sub-cluster"
                                                      >
                                                        <Edit2 size={10} />
                                                      </button>
                                                    </div>
                                                  )}

                                                  <span className="text-[8px] font-mono px-1 py-0.2 bg-white/5 text-white/40 rounded shrink-0">
                                                    {subCluster.itemCount} item{subCluster.itemCount === 1 ? '' : 's'}
                                                  </span>
                                                </div>

                                                {/* Origin Folder Path Display */}
                                                <div className="flex items-center gap-1 text-[9px] font-mono text-white/40 truncate" title={subCluster.reason}>
                                                  <span className="text-indigo-400/70">📁</span>
                                                  <span className="truncate">{subCluster.folderPathDisplay}</span>
                                                </div>
                                              </div>

                                              {/* Member Tags inside this Sub-Cluster */}
                                              <div className="space-y-1">
                                                <div className="flex flex-wrap gap-1 items-center">
                                                  {subCluster.tags.map(t => (
                                                    <span
                                                      key={t}
                                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white/5 border border-white/10 hover:border-white/20 rounded text-[9px] font-mono text-white/80"
                                                    >
                                                      <span>#{t}</span>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleRemoveTagFromSubCluster(st.id, subCluster.id, t)}
                                                        className="text-white/30 hover:text-rose-400 p-0.2 cursor-pointer transition-colors"
                                                        title={`Remove #${t} from this sub-cluster`}
                                                      >
                                                        <X size={8} />
                                                      </button>
                                                    </span>
                                                  ))}

                                                  {/* Inline Quick Add Tag to Sub-Cluster */}
                                                  <div className="inline-flex items-center gap-0.5">
                                                    <input
                                                      type="text"
                                                      value={newTagInputVal}
                                                      onChange={(e) => setSubClusterNewTagInputs(prev => ({ ...prev, [subCluster.id]: e.target.value }))}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleAddTagToSubCluster(st.id, subCluster.id, newTagInputVal);
                                                      }}
                                                      placeholder="+ tag"
                                                      className="w-14 bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded px-1 py-0.2 text-[8px] font-mono text-white focus:outline-none"
                                                    />
                                                    {newTagInputVal && (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleAddTagToSubCluster(st.id, subCluster.id, newTagInputVal)}
                                                        className="p-0.5 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500 hover:text-white rounded cursor-pointer transition-colors"
                                                        title="Add tag"
                                                      >
                                                        <Plus size={8} />
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Action Buttons: Approve, Create Sub-Supertag, Reject */}
                                              <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-white/5">
                                                <div className="flex items-center gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleApproveSubCluster(st.id, st.name, subCluster)}
                                                    className="px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 rounded text-[9px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                                                    title={`Assign all tags from "${subCluster.name}" into supertag "${st.name}"`}
                                                  >
                                                    <Check size={10} />
                                                    <span>Approve</span>
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={() => handleCreateSubSupertagFromCluster(st, subCluster)}
                                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 rounded text-[9px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                                                    title={`Create dedicated child supertag "${st.name.split('/')[0].trim()} / ${subCluster.name}"`}
                                                  >
                                                    <FolderPlus size={10} className="text-amber-400" />
                                                    <span>As Child Cluster</span>
                                                  </button>
                                                </div>

                                                <button
                                                  type="button"
                                                  onClick={() => handleRejectSubCluster(st.id, st.name, subCluster)}
                                                  className="p-1 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                                                  title={`Reject and dismiss sub-cluster "${subCluster.name}"`}
                                                >
                                                  <X size={12} />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* INDIVIDUAL TAG SUGGESTIONS SECTION */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-mono uppercase font-bold text-white/60 tracking-wider flex items-center gap-1">
                                        <Tag size={10} className="text-amber-400" />
                                        <span>INDIVIDUAL_TAG_SUGGESTIONS ({suggestions.length})</span>
                                      </span>
                                    </div>

                                    {suggestions.length > 0 ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {suggestions.map((sug) => {
                                          const isStaged = (organizeAssignments[sug.tag] || []).includes(st.id);
                                          return (
                                            <div
                                              key={sug.tag}
                                              className={cn(
                                                "group/sugchip inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border transition-all",
                                                isStaged
                                                  ? "bg-indigo-600/30 border-indigo-500 text-indigo-200"
                                                  : "bg-white/[0.03] border-white/10 text-white/80 hover:border-indigo-500/40 hover:text-white"
                                              )}
                                              title={sug.reason}
                                            >
                                              <span className="font-bold">#{sug.tag}</span>
                                              <span className="text-[8px] text-white/40">({sug.count})</span>
                                              
                                              {/* Quick reason badge */}
                                              <span className="text-[8px] px-1 py-0.2 bg-black/40 text-indigo-300/80 rounded border border-white/5 font-sans truncate max-w-32">
                                                {sug.affinityType === 'folder_match' ? (
                                                  `📂 folder match`
                                                ) : sug.affinityType === 'co_occurrence' ? (
                                                  `⚡ co-occurs #${sug.coOccurredTag || ''}`
                                                ) : sug.affinityType === 'member_similarity' ? (
                                                  `🎯 member match`
                                                ) : sug.affinityType === 'name_match' ? (
                                                  `📂 name match`
                                                ) : (
                                                  `✨ theme match`
                                                )}
                                              </span>

                                              {/* Action Buttons: Add (+) and Remove/Dismiss (-) */}
                                              <div className="flex items-center gap-0.5 ml-0.5 shrink-0">
                                                <button
                                                  type="button"
                                                  onClick={() => handleQuickAssignTagToSupertag(st.id, st.name, sug.tag)}
                                                  className="p-0.5 bg-indigo-500/20 hover:bg-indigo-500 text-indigo-300 hover:text-white rounded transition-colors cursor-pointer"
                                                  title={`Add #${sug.tag} to "${st.name}"`}
                                                >
                                                  <Plus size={10} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDismissSupertagSuggestion(st.id, st.name, sug.tag, sug)}
                                                  className="p-0.5 bg-white/5 hover:bg-rose-500/30 text-white/40 hover:text-rose-300 rounded transition-colors cursor-pointer"
                                                  title={`Remove #${sug.tag} from "${st.name}" suggestions`}
                                                >
                                                  <Minus size={10} />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-[10px] text-white/30 font-mono italic py-0.5">
                                        {subClusters.length > 0
                                          ? 'All individual tag suggestions grouped into sub-clusters above.'
                                          : 'No new standalone tag suggestions for this supertag.'}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 3: BULK EDIT TAGS' RELEVANCE & ALIVENESS SCORES */}
                  <div className="bg-white/[0.02] border border-white/10 rounded overflow-hidden">
                    <div
                      onClick={() => toggleSection('bulkTagScores')}
                      className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        {collapsedSections.bulkTagScores ? (
                          <ChevronRight size={14} className="text-white/40" />
                        ) : (
                          <ChevronDown size={14} className="text-white/40" />
                        )}
                        <Sliders size={14} className="text-emerald-400" />
                        <h4 className="text-xs font-bold font-mono uppercase text-white tracking-wider">
                          BULK_EDIT_TAG_SCORES_&_METRICS
                        </h4>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded">
                          {scoredTagsCount}/{allTags.length} tags scored
                        </span>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {bulkSelectedTags.size > 0 && (
                          <span className="text-[9px] font-mono text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30 font-bold">
                            {bulkSelectedTags.size} tags selected
                          </span>
                        )}
                      </div>
                    </div>

                    {!collapsedSections.bulkTagScores && (
                      <div className="p-3 pt-0 border-t border-white/5 space-y-3.5">
                        <p className="text-[10px] font-mono text-white/40 mt-2">
                          Assign default Relevance (importance) and Aliveness (freshness/engagement) scores to tags. Items inheriting these tags will automatically reflect their scores unless manually overridden.
                        </p>

                        {/* Search & Filter bar for bulk scores */}
                        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setBulkFilterMode('all')}
                              className={cn(
                                "px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer",
                                bulkFilterMode === 'all'
                                  ? "bg-indigo-600 text-white"
                                  : "bg-white/5 text-white/50 hover:text-white"
                              )}
                            >
                              All Tags ({allTags.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setBulkFilterMode('standalone')}
                              className={cn(
                                "px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer",
                                bulkFilterMode === 'standalone'
                                  ? "bg-indigo-600 text-white"
                                  : "bg-white/5 text-white/50 hover:text-white"
                              )}
                            >
                              Standalone ({standaloneTags.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setBulkFilterMode('scored')}
                              className={cn(
                                "px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer",
                                bulkFilterMode === 'scored'
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white/5 text-white/50 hover:text-white"
                              )}
                            >
                              Scored ({scoredTagsCount})
                            </button>
                            <button
                              type="button"
                              onClick={() => setBulkFilterMode('unscored')}
                              className={cn(
                                "px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer",
                                bulkFilterMode === 'unscored'
                                  ? "bg-amber-600 text-white"
                                  : "bg-white/5 text-white/50 hover:text-white"
                              )}
                            >
                              Unscored ({allTags.length - scoredTagsCount})
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Search size={11} className="absolute left-2 top-2 text-white/30 pointer-events-none" />
                              <input
                                type="text"
                                value={bulkTagSearch}
                                onChange={e => setBulkTagSearch(e.target.value)}
                                placeholder="Search tags for scores..."
                                className="bg-black/50 border border-white/10 rounded pl-6 pr-2.5 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-indigo-500/50 w-44"
                              />
                              {bulkTagSearch && (
                                <button
                                  type="button"
                                  onClick={() => setBulkTagSearch('')}
                                  className="absolute right-2 top-1.5 text-white/40 hover:text-white"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </div>

                            {filteredTagsForBulkScores.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (bulkSelectedTags.size === filteredTagsForBulkScores.length) {
                                    setBulkSelectedTags(new Set());
                                  } else {
                                    setBulkSelectedTags(new Set(filteredTagsForBulkScores));
                                  }
                                }}
                                className="text-[10px] font-mono text-white/50 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                {bulkSelectedTags.size === filteredTagsForBulkScores.length ? (
                                  <>
                                    <CheckSquare size={11} className="text-indigo-400" />
                                    <span>DESELECT_ALL</span>
                                  </>
                                ) : (
                                  <>
                                    <Square size={11} />
                                    <span>SELECT_ALL ({filteredTagsForBulkScores.length})</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Bulk Action Controls Panel */}
                        <div className="p-3 bg-black/40 border border-white/10 rounded space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Relevance score setting */}
                            <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={bulkApplyRelevance}
                                    onChange={e => setBulkApplyRelevance(e.target.checked)}
                                    className="size-3.5 accent-emerald-500 rounded cursor-pointer"
                                  />
                                  <span className="text-[11px] font-mono font-bold text-white flex items-center gap-1">
                                    <Star size={12} className="text-emerald-400" />
                                    Apply Relevance Score
                                  </span>
                                </label>
                                <span className="text-xs font-mono font-bold text-emerald-400">
                                  {bulkRelevanceScore}%
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  disabled={!bulkApplyRelevance}
                                  value={bulkRelevanceScore}
                                  onChange={e => setBulkRelevanceScore(Number(e.target.value))}
                                  className={cn(
                                    "w-full accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-lg",
                                    !bulkApplyRelevance && "opacity-40 cursor-not-allowed"
                                  )}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  disabled={!bulkApplyRelevance}
                                  value={bulkRelevanceScore}
                                  onChange={e => setBulkRelevanceScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                                  className="w-12 bg-black border border-white/10 rounded px-1.5 py-0.5 text-center text-xs font-mono text-white"
                                />
                              </div>

                              <div className="flex gap-1">
                                {[0, 25, 50, 75, 100].map(val => (
                                  <button
                                    key={val}
                                    type="button"
                                    disabled={!bulkApplyRelevance}
                                    onClick={() => setBulkRelevanceScore(val)}
                                    className="flex-1 py-0.5 bg-white/5 hover:bg-white/10 rounded text-[8px] font-mono text-white/60 hover:text-white transition-colors cursor-pointer"
                                  >
                                    {val}%
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Aliveness score setting */}
                            <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={bulkApplyAliveness}
                                    onChange={e => setBulkApplyAliveness(e.target.checked)}
                                    className="size-3.5 accent-amber-500 rounded cursor-pointer"
                                  />
                                  <span className="text-[11px] font-mono font-bold text-white flex items-center gap-1">
                                    <Flame size={12} className="text-amber-400" />
                                    Apply Aliveness Score
                                  </span>
                                </label>
                                <span className="text-xs font-mono font-bold text-amber-400">
                                  {bulkAlivenessScore}%
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  disabled={!bulkApplyAliveness}
                                  value={bulkAlivenessScore}
                                  onChange={e => setBulkAlivenessScore(Number(e.target.value))}
                                  className={cn(
                                    "w-full accent-amber-500 cursor-pointer h-1.5 bg-white/10 rounded-lg",
                                    !bulkApplyAliveness && "opacity-40 cursor-not-allowed"
                                  )}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  disabled={!bulkApplyAliveness}
                                  value={bulkAlivenessScore}
                                  onChange={e => setBulkAlivenessScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                                  className="w-12 bg-black border border-white/10 rounded px-1.5 py-0.5 text-center text-xs font-mono text-white"
                                />
                              </div>

                              <div className="flex gap-1">
                                {[0, 25, 50, 75, 100].map(val => (
                                  <button
                                    key={val}
                                    type="button"
                                    disabled={!bulkApplyAliveness}
                                    onClick={() => setBulkAlivenessScore(val)}
                                    className="flex-1 py-0.5 bg-white/5 hover:bg-white/10 rounded text-[8px] font-mono text-white/60 hover:text-white transition-colors cursor-pointer"
                                  >
                                    {val}%
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Propagation options */}
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-white/5">
                            <div className="space-y-1">
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] font-mono text-white/80">
                                <input
                                  type="checkbox"
                                  checked={bulkPropagateToItems}
                                  onChange={e => setBulkPropagateToItems(e.target.checked)}
                                  className="size-3.5 accent-indigo-500 rounded cursor-pointer"
                                />
                                <span>Synchronize scores to content items (respects manual overrides)</span>
                              </label>

                              {bulkPropagateToItems && (
                                <label className="flex items-center gap-2 cursor-pointer text-[9px] font-mono text-amber-300/80 pl-5">
                                  <input
                                    type="checkbox"
                                    checked={bulkOverrideManualScores}
                                    onChange={e => setBulkOverrideManualScores(e.target.checked)}
                                    className="size-3 accent-amber-500 rounded cursor-pointer"
                                  />
                                  <span>Force overwrite items with manually set scores</span>
                                </label>
                              )}
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <button
                                type="button"
                                disabled={bulkSelectedTags.size === 0 || isBulkUpdatingScores}
                                onClick={handleClearBulkScores}
                                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Clear scores for selected tags"
                              >
                                Clear Scores ({bulkSelectedTags.size})
                              </button>

                              <button
                                type="button"
                                disabled={bulkSelectedTags.size === 0 || isBulkUpdatingScores || (!bulkApplyRelevance && !bulkApplyAliveness)}
                                onClick={handleExecuteBulkSaveTagScores}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-md flex items-center gap-1.5"
                              >
                                {isBulkUpdatingScores ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <CheckCheck size={12} />
                                )}
                                <span>Apply to {bulkSelectedTags.size} Tags</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Tag Scores Matrix */}
                        {filteredTagsForBulkScores.length === 0 ? (
                          <div className="py-6 text-center text-white/30 font-mono text-[10px] bg-black/20 rounded border border-white/5">
                            No tags match search "{bulkTagSearch}" or active filter.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar p-1">
                            {filteredTagsForBulkScores.map(tag => {
                              const clean = tag.toLowerCase().trim();
                              const scoreObj = tagScores[clean] || {};
                              const count = tagCounts[tag] || 0;
                              const isSelected = bulkSelectedTags.has(tag);
                              const stMatch = supertags.find(s => (s.tags || []).some(t => t.toLowerCase().trim() === clean));
                              const rel = typeof scoreObj.relevanceScore === 'number' ? scoreObj.relevanceScore : null;
                              const aliv = typeof scoreObj.alivenessScore === 'number' ? scoreObj.alivenessScore : null;

                              return (
                                <div
                                  key={tag}
                                  className={cn(
                                    "p-2.5 rounded border transition-all flex flex-col gap-2",
                                    isSelected
                                      ? "bg-emerald-950/20 border-emerald-500/40"
                                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                  )}
                                >
                                  {/* Tag row header */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {
                                          setBulkSelectedTags(prev => {
                                            const next = new Set(prev);
                                            if (next.has(tag)) next.delete(tag);
                                            else next.add(tag);
                                            return next;
                                          });
                                        }}
                                        className="size-3.5 accent-emerald-500 rounded border border-white/20 bg-black cursor-pointer shrink-0"
                                      />
                                      <span className="text-[11px] font-mono text-white truncate font-bold">
                                        #{tag}
                                      </span>
                                      <span className="text-[9px] font-mono text-white/40 shrink-0">
                                        ({count})
                                      </span>

                                      {stMatch ? (
                                        <span
                                          className="text-[8px] font-mono px-1.5 py-0.2 rounded shrink-0 border"
                                          style={{
                                            backgroundColor: `${stMatch.color || '#6366F1'}15`,
                                            borderColor: `${stMatch.color || '#6366F1'}40`,
                                            color: stMatch.color || '#A5B4FC'
                                          }}
                                        >
                                          📂 {stMatch.name}
                                        </span>
                                      ) : (
                                        <span className="text-[8px] font-mono text-white/30 bg-white/5 px-1.5 py-0.2 rounded shrink-0">
                                          📁 Standalone
                                        </span>
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => setRenamingTag(tag)}
                                      className="p-1 text-white/40 hover:text-indigo-300 hover:bg-white/10 rounded transition-all cursor-pointer shrink-0 flex items-center gap-1 text-[9px] font-mono"
                                      title="Edit tag name and scores in detail"
                                    >
                                      <Edit2 size={10} />
                                      <span>Edit</span>
                                    </button>
                                  </div>

                                  {/* Quick inline score sliders */}
                                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                                    {/* Quick Relevance */}
                                    <div className="flex items-center justify-between gap-1.5 bg-black/40 px-2 py-1 rounded">
                                      <span className="text-[9px] font-mono text-white/50 flex items-center gap-1 shrink-0">
                                        <Star size={10} className="text-emerald-400" />
                                        Rel:
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <span className={cn(
                                          "text-[10px] font-mono font-bold",
                                          rel !== null ? "text-emerald-400" : "text-white/30"
                                        )}>
                                          {rel !== null ? `${rel}%` : 'inherit'}
                                        </span>
                                        {rel !== null && (
                                          <button
                                            type="button"
                                            onClick={() => handleSaveSingleTagScore(tag, { relevanceScore: null })}
                                            className="text-[8px] text-white/30 hover:text-rose-400 p-0.5 cursor-pointer"
                                            title="Clear relevance score"
                                          >
                                            <X size={8} />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Quick Aliveness */}
                                    <div className="flex items-center justify-between gap-1.5 bg-black/40 px-2 py-1 rounded">
                                      <span className="text-[9px] font-mono text-white/50 flex items-center gap-1 shrink-0">
                                        <Flame size={10} className="text-amber-400" />
                                        Aliv:
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <span className={cn(
                                          "text-[10px] font-mono font-bold",
                                          aliv !== null ? "text-amber-400" : "text-white/30"
                                        )}>
                                          {aliv !== null ? `${aliv}%` : 'inherit'}
                                        </span>
                                        {aliv !== null && (
                                          <button
                                            type="button"
                                            onClick={() => handleSaveSingleTagScore(tag, { alivenessScore: null })}
                                            className="text-[8px] text-white/30 hover:text-rose-400 p-0.5 cursor-pointer"
                                            title="Clear aliveness score"
                                          >
                                            <X size={8} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 4: ALL STANDALONE TAGS TABLE / MATRIX */}
                  <div className="bg-white/[0.02] border border-white/10 rounded overflow-hidden">
                    <div
                      onClick={() => toggleSection('standaloneMatrix')}
                      className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        {collapsedSections.standaloneMatrix ? (
                          <ChevronRight size={14} className="text-white/40" />
                        ) : (
                          <ChevronDown size={14} className="text-white/40" />
                        )}
                        <Tag size={14} className="text-indigo-400" />
                        <h4 className="text-xs font-bold font-mono uppercase text-white tracking-wider">
                          ALL_STANDALONE_TAGS ({standaloneTags.length})
                        </h4>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                          <Search size={11} className="absolute left-2 top-2 text-white/30 pointer-events-none" />
                          <input
                            type="text"
                            value={organizeTagSearch}
                            onChange={e => setOrganizeTagSearch(e.target.value)}
                            placeholder="Search standalone tags..."
                            className="bg-black/50 border border-white/10 rounded pl-6 pr-2.5 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-indigo-500/50 w-44"
                          />
                          {organizeTagSearch && (
                            <button
                              type="button"
                              onClick={() => setOrganizeTagSearch('')}
                              className="absolute right-2 top-1.5 text-white/40 hover:text-white"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>

                        {standaloneTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedOrganizeTags.size === standaloneTags.length) {
                                setSelectedOrganizeTags(new Set());
                              } else {
                                setSelectedOrganizeTags(new Set(standaloneTags));
                              }
                            }}
                            className="text-[10px] font-mono text-white/50 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {selectedOrganizeTags.size === standaloneTags.length ? (
                              <>
                                <CheckSquare size={11} className="text-indigo-400" />
                                <span>DESELECT_ALL</span>
                              </>
                            ) : (
                              <>
                                <Square size={11} />
                                <span>SELECT_ALL</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {!collapsedSections.standaloneMatrix && (
                      <div className="p-3 pt-0 border-t border-white/5 space-y-3">
                        <p className="text-[10px] font-mono text-white/40 mt-2">
                          Directly route standalone tags into supertags or create new folders on the fly.
                        </p>

                        {standaloneTags.length === 0 ? (
                          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2 bg-black/20 rounded border border-white/5">
                            <div className="size-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                              <Check size={16} />
                            </div>
                            <p className="text-xs font-mono text-white/70">ALL_TAGS_ORGANIZED</p>
                            <p className="text-[10px] text-white/40">Every tag in your library is currently inside at least one supertag folder.</p>
                          </div>
                        ) : filteredStandaloneTags.length === 0 ? (
                          <div className="py-6 text-center text-white/30 font-mono text-[10px]">
                            No standalone tags match search "{organizeTagSearch}"
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar p-1">
                            {filteredStandaloneTags.map(tag => {
                              const assignedIds = organizeAssignments[tag] || [];
                              const isSelected = selectedOrganizeTags.has(tag);
                              const count = tagCounts[tag] || 0;
                              const bestMatch = suggestSupertagForTag(tag, [], supertags, items);

                              return (
                                <div
                                  key={tag}
                                  className={cn(
                                    "p-2.5 rounded border transition-all flex flex-col gap-2",
                                    isSelected && assignedIds.length > 0
                                      ? "bg-indigo-950/20 border-indigo-500/40"
                                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                  )}
                                >
                                  {/* Header row: Checkbox, tag name, count, and action controls */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {
                                          setSelectedOrganizeTags(prev => {
                                            const next = new Set(prev);
                                            if (next.has(tag)) next.delete(tag);
                                            else next.add(tag);
                                            return next;
                                          });
                                        }}
                                        className="size-3.5 accent-indigo-500 rounded border border-white/20 bg-black cursor-pointer shrink-0"
                                      />
                                      <span className="text-[11px] font-mono text-white truncate font-medium">
                                        #{tag}
                                      </span>
                                      <span className="text-[9px] font-mono text-white/30 shrink-0">
                                        ({count})
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => setRenamingTag(tag)}
                                        className="p-1 text-white/20 hover:text-indigo-300 hover:bg-white/10 rounded transition-all cursor-pointer shrink-0"
                                        title="Edit tag and assign scores"
                                      >
                                        <Edit2 size={10} />
                                      </button>
                                    </div>

                                    {/* Quick Recommendation button */}
                                    {bestMatch.supertagId && !assignedIds.includes(bestMatch.supertagId) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOrganizeAssignments(prev => ({
                                            ...prev,
                                            [tag]: Array.from(new Set([...(prev[tag] || []), bestMatch.supertagId!]))
                                          }));
                                          setSelectedOrganizeTags(prev => new Set(prev).add(tag));
                                        }}
                                        className="p-1 text-indigo-400/80 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded text-[9px] font-mono flex items-center gap-0.5 cursor-pointer shrink-0"
                                        title={`Quick match to ${bestMatch.supertagName}: ${bestMatch.reason}`}
                                      >
                                        <Sparkles size={9} />
                                        <span>+ Rec ({bestMatch.supertagName})</span>
                                      </button>
                                    )}
                                  </div>

                                  {/* Assigned Supertags Row & Add to Supertag Picker */}
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                                    {assignedIds.length > 0 ? (
                                      assignedIds.map(sId => {
                                        const st = supertags.find(s => s.id === sId);
                                        if (!st) return null;
                                        return (
                                          <span
                                            key={sId}
                                            className="text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 shrink-0"
                                            style={{
                                              backgroundColor: `${st.color || '#6366F1'}15`,
                                              borderColor: `${st.color || '#6366F1'}40`,
                                              color: st.color || '#A5B4FC'
                                            }}
                                          >
                                            <span className="truncate max-w-24">📂 {st.name}</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setOrganizeAssignments(prev => ({
                                                  ...prev,
                                                  [tag]: (prev[tag] || []).filter(id => id !== sId)
                                                }));
                                              }}
                                              className="text-white/40 hover:text-rose-400 cursor-pointer p-0.2"
                                              title={`Remove from ${st.name}`}
                                            >
                                              <X size={9} />
                                            </button>
                                          </span>
                                        );
                                      })
                                    ) : (
                                      <span className="text-[9px] font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                                        📁 Standalone
                                      </span>
                                    )}

                                    {/* Dropdown to add another supertag */}
                                    <div className="relative">
                                      <select
                                        value=""
                                        onChange={e => {
                                          const val = e.target.value;
                                          if (val === '__new__') {
                                            setIsCreatingSupertag(true);
                                          } else if (val) {
                                            setOrganizeAssignments(prev => ({
                                              ...prev,
                                              [tag]: Array.from(new Set([...(prev[tag] || []), val]))
                                            }));
                                            setSelectedOrganizeTags(prev => new Set(prev).add(tag));
                                          }
                                        }}
                                        className="appearance-none bg-black/60 border border-white/10 hover:border-indigo-500/40 rounded px-1.5 py-0.5 pr-4 text-[9px] font-mono text-white/60 hover:text-white cursor-pointer transition-all max-w-32 truncate"
                                      >
                                        <option value="">+ Add to folder...</option>
                                        {supertags
                                          .filter(st => !assignedIds.includes(st.id))
                                          .map(st => (
                                            <option key={st.id} value={st.id}>
                                              📂 {st.name}
                                            </option>
                                          ))}
                                        <option value="__new__">+ New Supertag...</option>
                                      </select>
                                      <ChevronDown size={9} className="absolute right-1 top-1.5 pointer-events-none opacity-40 text-white" />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* MANUAL MERGE TAB */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-white/60 tracking-widest font-mono block">
                        1. Canonical Destination Tag
                      </label>
                      <input
                        type="text"
                        value={manualTargetTag}
                        onChange={(e) => setManualTargetTag(e.target.value)}
                        placeholder="e.g. machine-learning or 📚books"
                        className="w-full bg-black/50 border border-indigo-500/40 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-400"
                      />
                    </div>

                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-white/60 tracking-widest font-mono block">
                        2. Place into Supertag Folder
                      </label>
                      <div className="relative">
                        <select
                          value={manualTargetSupertagId}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              setIsCreatingSupertag(true);
                            } else {
                              setManualTargetSupertagId(e.target.value);
                            }
                          }}
                          className={cn(
                            "w-full appearance-none bg-black/50 border rounded px-3 py-1.5 pr-6 text-xs font-mono cursor-pointer",
                            manualTargetSupertagId !== 'none'
                              ? "border-indigo-500/60 text-indigo-300"
                              : "border-white/10 text-white/50"
                          )}
                        >
                          <option value="none">📁 No Supertag (Standalone)</option>
                          {supertags.map(st => (
                            <option key={st.id} value={st.id}>
                              📂 Supertag: {st.name}
                            </option>
                          ))}
                          <option value="__new__">+ Create New Supertag...</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-2.5 pointer-events-none opacity-40 text-white" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-white/60 tracking-widest font-mono">
                        3. Select Tags to Merge into #{manualTargetTag || '...'} ({manualSelectedTags.length} selected)
                      </label>

                      <input
                        type="text"
                        value={manualTagSearch}
                        onChange={(e) => setManualTagSearch(e.target.value)}
                        placeholder="Filter tags..."
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-indigo-500/50 w-36"
                      />
                    </div>

                    <div className="max-h-60 overflow-y-auto p-3 bg-black/40 border border-white/5 rounded flex flex-wrap gap-1.5 custom-scrollbar">
                      {sortedTagsForManual.map(tag => {
                        const isSelected = manualSelectedTags.includes(tag);
                        const count = tagCounts[tag] || 0;
                        return (
                          <div
                            key={tag}
                            className={cn(
                              "group/tagchip px-2.5 py-1 rounded text-[11px] font-mono border transition-all flex items-center gap-1.5",
                              isSelected
                                ? "bg-indigo-600 border-indigo-500 text-white font-bold"
                                : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleManualTagSelection(tag)}
                              className="cursor-pointer flex items-center gap-1"
                            >
                              <span>#{tag}</span>
                              <span className="text-[9px] opacity-60">({count})</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingTag(tag);
                              }}
                              className="opacity-0 group-hover/tagchip:opacity-100 hover:text-indigo-300 transition-opacity p-0.5 cursor-pointer"
                              title="Rename tag"
                            >
                              <Edit2 size={9} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-[#1A1A1D] shrink-0 flex items-center justify-between gap-4">
              <div className="text-[10px] font-mono text-white/40">
                {activeTab === 'suggestions' ? (
                  <span>
                    Selected: <strong className="text-white">{selectedClusterIds.size}</strong> clusters · ~<strong className="text-indigo-400">{calculateAffectedItemsCount}</strong> items will be updated
                  </span>
                ) : activeTab === 'organize' ? (
                  <span>
                    Staged: <strong className="text-white">{Array.from(selectedOrganizeTags).filter(t => (organizeAssignments[t] || []).length > 0).length}</strong> tags to route into supertag folders
                  </span>
                ) : (
                  <span>
                    Merging <strong className="text-white">{manualSelectedTags.length}</strong> tags into <strong className="text-indigo-400">#{manualTargetTag || '...'}</strong>
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/5 rounded text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer"
                >
                  CANCEL
                </button>

                {activeTab === 'suggestions' ? (
                  <button
                    type="button"
                    onClick={handleExecuteMergeSuggestions}
                    disabled={isProcessing || selectedClusterIds.size === 0}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    <span>CONFIRM & NORMALIZE ({selectedClusterIds.size})</span>
                  </button>
                ) : activeTab === 'organize' ? (
                  <button
                    type="button"
                    onClick={handleExecuteOrganizeStandalone}
                    disabled={isProcessing || Array.from(selectedOrganizeTags).filter(t => (organizeAssignments[t] || []).length > 0).length === 0}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <FolderTree size={13} />}
                    <span>APPLY SUPERTAG CLUSTERING</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleExecuteManualMerge}
                    disabled={isProcessing || manualSelectedTags.length < 2 || !manualTargetTag.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>MERGE SELECTED TAGS</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    <RenameTagModal
      isOpen={!!renamingTag}
      onClose={() => setRenamingTag(null)}
      tagToRename={renamingTag}
      items={items}
      supertags={supertags}
      userId={userId}
      tagScores={tagScores}
      onRenamed={(oldTag, newTag) => {
        if (manualSelectedTags.includes(oldTag)) {
          setManualSelectedTags(prev => prev.map(t => t === oldTag ? newTag : t));
        }
        if (manualTargetTag === oldTag) {
          setManualTargetTag(newTag);
        }
      }}
    />

    <RenameSupertagModal
      isOpen={!!renamingSupertag}
      onClose={() => setRenamingSupertag(null)}
      supertag={renamingSupertag}
      items={items}
    />
    </>
  );
}
