import React, { useState, useMemo, useEffect } from 'react';
import { 
  Tag, Bookmark, BookOpen, Layers, Type, Filter as FilterIcon, Check, 
  Headphones, FileText, Highlighter, StickyNote, Globe, File, Mic, 
  Video, MessageSquare, User, Image, MoreHorizontal, MapPin, ChevronLeft, 
  Sparkles, Folder, FolderOpen, ChevronDown, ChevronRight, Plus, X, 
  FolderPlus, Trash2, Edit2, MoveRight, CheckSquare, Square, GripVertical,
  FolderTree
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ContentItem, Supertag, TagScoreMap } from '../types';
import { LOCATION_MAPPING } from '../lib/locationMapping';
import { sortTagsEmojiFirst, findRedundantTagClusters, getRejectedClusterSignatures } from '../lib/tagNormalization';
import { supertagService } from '../lib/supertagService';
import { tagService } from '../lib/tagService';
import { buildFolderTree } from '../lib/folderTreeUtils';
import TagFolderTreeView from './TagFolderTreeView';
import NormalizeTagsModal from './NormalizeTagsModal';
import RenameTagModal from './RenameTagModal';
import RenameSupertagModal from './RenameSupertagModal';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  items: ContentItem[];
  supertags: Supertag[];
  userId: string;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  selectedSupertags?: string[];
  setSelectedSupertags?: (ids: string[]) => void;
  selectedTypes: string[];
  setSelectedTypes: (types: string[]) => void;
  selectedStatuses: string[];
  setSelectedStatuses: (statuses: string[]) => void;
  selectedLocations: string[];
  setSelectedLocations: (locations: string[]) => void;
  minRelevance: number;
  setMinRelevance: (v: number) => void;
  minAliveness: number;
  setMinAliveness: (v: number) => void;
  minProgress: number;
  setMinProgress: (v: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const CONTENT_TYPES = [
  { id: 'course', label: 'Courses', icon: BookOpen },
  { id: 'book', label: 'Books', icon: Bookmark },
  { id: 'audiobook', label: 'Audiobooks', icon: Headphones },
  { id: 'paper', label: 'Papers', icon: FileText },
  { id: 'highlights', label: 'Highlights', icon: Highlighter },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'website', label: 'Websites', icon: Globe },
  { id: 'page', label: 'Pages', icon: File },
  { id: 'article', label: 'Articles', icon: Type },
  { id: 'podcast', label: 'Podcasts', icon: Mic },
  { id: 'video', label: 'Videos', icon: Video },
  { id: 'pdf', label: 'PDFs', icon: FileText },
  { id: 'social post', label: 'Social Posts', icon: MessageSquare },
  { id: 'social profile', label: 'Social Profiles', icon: User },
  { id: 'screenshot', label: 'Screenshots', icon: Image },
  { id: 'other', label: 'Others', icon: MoreHorizontal },
];

const STATUS_OPTIONS = [
  { id: 'to be purchased', label: 'To Be Purchased', color: '#F472B6' },
  { id: 'someday maybe', label: 'Someday Maybe', color: '#94A3B8' },
  { id: 'inbox', label: 'Inbox', color: '#818CF8' },
  { id: 'ready', label: 'Ready', color: '#10B981' },
  { id: 'soon', label: 'Soon', color: '#FBBF24' },
  { id: 'active', label: 'Active', color: '#34D399' },
  { id: 'passive', label: 'Passive', color: '#60A5FA' },
  { id: 'ongoing', label: 'Ongoing', color: '#3B82F6' },
  { id: 'on hold', label: 'On Hold', color: '#F87171' },
  { id: 'done', label: 'Done', color: '#C084FC' },
  { id: 'reviewing', label: 'Reviewing', color: '#A78BFA' },
  { id: 'reference', label: 'Reference', color: '#6B7280' },
];

export default function Sidebar({ 
  items,
  supertags = [],
  userId,
  selectedTags, 
  setSelectedTags,
  selectedSupertags = [],
  setSelectedSupertags,
  selectedTypes, 
  setSelectedTypes,
  selectedStatuses, 
  setSelectedStatuses,
  selectedLocations, 
  setSelectedLocations,
  minRelevance, 
  setMinRelevance,
  minAliveness, 
  setMinAliveness,
  minProgress, 
  setMinProgress,
  isCollapsed, 
  onToggleCollapse
}: SidebarProps) {
  const [isNormalizeOpen, setIsNormalizeOpen] = useState(false);
  const [tagScores, setTagScores] = useState<TagScoreMap>({});

  useEffect(() => {
    if (!userId) {
      setTagScores({});
      return;
    }
    const unsub = tagService.subscribeTagScores(userId, setTagScores);
    return () => unsub();
  }, [userId]);

  const [tagViewMode, setTagViewMode] = useState<'tree' | 'flat'>('tree');
  const [expandedFolderTreeIds, setExpandedFolderTreeIds] = useState<Set<string>>(new Set());
  
  // Collapsible section state for sidebar sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('nexus_sidebar_collapsed_sections');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return {};
  });

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [sectionKey]: !prev[sectionKey] };
      try {
        localStorage.setItem('nexus_sidebar_collapsed_sections', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };
  
  // Expanded/collapsed state for supertags (tracks which supertag folders are open)
  const [expandedSupertagIds, setExpandedSupertagIds] = useState<Set<string>>(new Set());

  // Drag & drop state for supertag reordering
  const [draggedSupertagId, setDraggedSupertagId] = useState<string | null>(null);
  const [dragOverSupertagId, setDragOverSupertagId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);

  // Drag & drop state for moving tags into sub-clusters or supertag root
  const [draggedTagData, setDraggedTagData] = useState<{
    tag: string;
    sourceSupertagId: string;
    sourceSubClusterId: string | null;
  } | null>(null);
  const [dragOverTargetKey, setDragOverTargetKey] = useState<string | null>(null);

  // Inline supertag creation / tag addition state
  const [isCreatingSupertag, setIsCreatingSupertag] = useState(false);
  const [newSupertagName, setNewSupertagName] = useState('');
  const [addingTagToSupertagId, setAddingTagToSupertagId] = useState<string | null>(null);
  const [inlineNewTag, setInlineNewTag] = useState('');
  const [activeMenuTag, setActiveMenuTag] = useState<string | null>(null);
  const [activeChildMenuTag, setActiveChildMenuTag] = useState<{ supertagId: string; tag: string; subClusterId?: string } | null>(null);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [renamingSupertag, setRenamingSupertag] = useState<Supertag | null>(null);
  const [inlineEditingSupertagId, setInlineEditingSupertagId] = useState<string | null>(null);
  const [inlineEditingSupertagName, setInlineEditingSupertagName] = useState('');
  const [confirmDeleteSupertag, setConfirmDeleteSupertag] = useState<{ id: string; name: string } | null>(null);

  // Sub-cluster inline rename / add tag states
  const [editingSubCluster, setEditingSubCluster] = useState<{ supertagId: string; subClusterId: string; name: string } | null>(null);
  const [addingTagToSubClusterKey, setAddingTagToSubClusterKey] = useState<string | null>(null);
  const [inlineNewSubClusterTag, setInlineNewSubClusterTag] = useState('');

  // Memoize all tags with emoji-first sorting and tag counts for high performance
  const { allTags, tagCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    const tagsSet = new Set<string>();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.archived === true) continue;
      if (item.tags) {
        for (let j = 0; j < item.tags.length; j++) {
          const t = item.tags[j].trim();
          if (t) {
            tagsSet.add(t);
            counts[t] = (counts[t] || 0) + 1;
          }
        }
      }
    }
    
    const sorted = sortTagsEmojiFirst(Array.from(tagsSet));
    return { allTags: sorted, tagCounts: counts };
  }, [items]);

  // Compute number of redundant tag clusters available for normalization (filtering rejected)
  const redundantClusterCount = useMemo(() => {
    const rejectedSignatures = getRejectedClusterSignatures(userId);
    return findRedundantTagClusters(allTags, tagCounts, supertags, rejectedSignatures).length;
  }, [allTags, tagCounts, supertags, userId]);

  // Map of tags that belong to at least one supertag (includes tags inside sub-clusters)
  const tagToSupertagMap = useMemo(() => {
    const map = new Map<string, string[]>();
    supertags.forEach(st => {
      const allStTags = supertagService.getAllSupertagTags(st);
      allStTags.forEach(clean => {
        if (!map.has(clean)) map.set(clean, []);
        map.get(clean)!.push(st.id);
      });
    });
    return map;
  }, [supertags]);

  // Tags not inside any supertag
  const standaloneTags = useMemo(() => {
    return allTags.filter(t => !tagToSupertagMap.has(t.toLowerCase().trim()));
  }, [allTags, tagToSupertagMap]);

  // Total items count for each supertag (items with any tag in the supertag or sub-clusters)
  const supertagItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    supertags.forEach(st => {
      const allStTags = supertagService.getAllSupertagTags(st);
      const stTagSet = new Set(allStTags);
      stTagSet.add(st.name.toLowerCase().trim());
      
      let count = 0;
      for (const item of items) {
        if (item.archived) continue;
        if (item.tags && item.tags.some(t => stTagSet.has(t.toLowerCase().trim()))) {
          count++;
        }
      }
      counts[st.id] = count;
    });
    return counts;
  }, [items, supertags]);

  // Compute nested folder tree for hierarchical tag view ("tags within tags within tags...")
  const folderTreeNodes = useMemo(() => {
    return buildFolderTree(items, false, tagToSupertagMap);
  }, [items, tagToSupertagMap]);

  // Handle clicking supertag row: toggle folder expand and apply/remove supertag filter
  const handleSupertagClick = (st: Supertag, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (inlineEditingSupertagId === st.id) return;

    const isCurrentlyExpanded = expandedSupertagIds.has(st.id);
    const allStTags = supertagService.getAllSupertagTags(st);
    const stNameTag = st.name.toLowerCase().trim();

    if (isCurrentlyExpanded) {
      // Collapse supertag: de-select and de-filter it
      setExpandedSupertagIds(prev => {
        const next = new Set(prev);
        next.delete(st.id);
        return next;
      });

      const tagsToRemove = new Set(allStTags);
      tagsToRemove.add(stNameTag);
      setSelectedTags(selectedTags.filter(t => !tagsToRemove.has(t.toLowerCase().trim())));
      if (setSelectedSupertags && selectedSupertags) {
        setSelectedSupertags(selectedSupertags.filter(id => id !== st.id));
      }
    } else {
      // Expanding: apply filter and expand
      setExpandedSupertagIds(prev => {
        const next = new Set(prev);
        next.add(st.id);
        return next;
      });

      const next = new Set([...selectedTags, ...allStTags]);
      if (allStTags.length === 0) {
        next.add(stNameTag);
      }
      setSelectedTags(Array.from(next));
      if (setSelectedSupertags && selectedSupertags) {
        setSelectedSupertags(Array.from(new Set([...selectedSupertags, st.id])));
      }
    }
  };

  // Toggle supertag folder accordion open/close explicitly
  const toggleSupertagExpand = (st: Supertag, e?: React.MouseEvent) => {
    handleSupertagClick(st, e);
  };

  // Toggle filtering by entire supertag
  const toggleSupertagFilter = (supertag: Supertag, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const allStTags = supertagService.getAllSupertagTags(supertag);
    const stNameTag = supertag.name.toLowerCase().trim();
    const allSelected = (allStTags.length > 0 && allStTags.every(t => selectedTags.includes(t))) || 
      (allStTags.length === 0 && selectedTags.includes(stNameTag));

    if (allSelected) {
      // Remove all child tags from selection
      const toRemove = new Set(allStTags);
      toRemove.add(stNameTag);
      setSelectedTags(selectedTags.filter(t => !toRemove.has(t.toLowerCase().trim())));
      if (setSelectedSupertags && selectedSupertags) {
        setSelectedSupertags(selectedSupertags.filter(id => id !== supertag.id));
      }
    } else {
      // Add all child tags to selection
      const next = new Set([...selectedTags, ...allStTags]);
      if (allStTags.length === 0) {
        next.add(stNameTag);
      }
      setSelectedTags(Array.from(next));
      if (setSelectedSupertags && selectedSupertags) {
        setSelectedSupertags(Array.from(new Set([...selectedSupertags, supertag.id])));
      }
    }
  };

  // Toggle filtering by a sub-cluster's tags
  const toggleSubClusterFilter = (scTags: string[], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cleanTags = scTags.map(t => t.toLowerCase().trim()).filter(Boolean);
    if (cleanTags.length === 0) return;

    const allSelected = cleanTags.every(t => selectedTags.includes(t));
    if (allSelected) {
      const toRemove = new Set(cleanTags);
      setSelectedTags(selectedTags.filter(t => !toRemove.has(t.toLowerCase().trim())));
    } else {
      setSelectedTags(Array.from(new Set([...selectedTags, ...cleanTags])));
    }
  };

  // Drag and Drop supertag reordering handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedSupertagId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (!draggedSupertagId || draggedSupertagId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'above' : 'below';
    setDragOverSupertagId(id);
    setDropPosition(pos);
  };

  const handleDragLeave = (e: React.DragEvent, id: string) => {
    if (dragOverSupertagId === id) {
      setDragOverSupertagId(null);
      setDropPosition(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggedSupertagId || e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId || sourceId.startsWith('tag::')) {
      setDraggedSupertagId(null);
      setDragOverSupertagId(null);
      setDropPosition(null);
      return;
    }

    const currentIndex = supertags.findIndex(s => s.id === sourceId);
    const targetIndex = supertags.findIndex(s => s.id === targetId);

    if (currentIndex === -1 || targetIndex === -1) return;

    const newSupertags = [...supertags];
    const [moved] = newSupertags.splice(currentIndex, 1);
    
    let insertIndex = newSupertags.findIndex(s => s.id === targetId);
    if (dropPosition === 'below') {
      insertIndex += 1;
    }
    newSupertags.splice(insertIndex, 0, moved);

    setDraggedSupertagId(null);
    setDragOverSupertagId(null);
    setDropPosition(null);

    try {
      await supertagService.reorderSupertags(userId, newSupertags.map(s => s.id));
      toast.success(`Reordered supertag folders`, { duration: 1500 });
    } catch (err: any) {
      toast.error('Failed to reorder supertags: ' + err.message);
    }
  };

  const handleDragEnd = () => {
    setDraggedSupertagId(null);
    setDragOverSupertagId(null);
    setDropPosition(null);
  };

  // Tag Drag and Drop handlers (for dragging tags into sub-clusters or root)
  const handleTagDragStart = (
    e: React.DragEvent, 
    data: { tag: string; supertagId: string; sourceSubClusterId: string | null }
  ) => {
    e.stopPropagation();
    setDraggedTagData({
      tag: data.tag,
      sourceSupertagId: data.supertagId,
      sourceSubClusterId: data.sourceSubClusterId,
    });
    e.dataTransfer.setData('application/json', JSON.stringify({
      tag: data.tag,
      sourceSupertagId: data.supertagId,
      sourceSubClusterId: data.sourceSubClusterId,
    }));
    e.dataTransfer.setData('text/plain', `tag::${data.tag}::${data.supertagId}::${data.sourceSubClusterId || 'root'}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTagDragEnd = () => {
    setDraggedTagData(null);
    setDragOverTargetKey(null);
  };

  const handleDropOnSubCluster = async (e: React.DragEvent, targetSupertagId: string, targetSubClusterId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    let tag = draggedTagData?.tag;
    let sourceSupertagId = draggedTagData?.sourceSupertagId;
    let sourceSubClusterId = draggedTagData?.sourceSubClusterId;

    if (!tag) {
      try {
        const rawJson = e.dataTransfer.getData('application/json');
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          tag = parsed.tag;
          sourceSupertagId = parsed.sourceSupertagId || parsed.supertagId;
          sourceSubClusterId = parsed.sourceSubClusterId;
        }
      } catch (err) {}
    }

    setDraggedTagData(null);
    setDragOverTargetKey(null);

    if (!tag) return;
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');
    
    const targetSt = supertags.find(s => s.id === targetSupertagId);
    if (!targetSt) return;
    const targetSc = (targetSt.subClusters || []).find(sc => sc.id === targetSubClusterId);
    if (!targetSc) return;

    if (sourceSupertagId === targetSupertagId && sourceSubClusterId === targetSubClusterId) {
      return; // Already in this sub-cluster
    }

    try {
      await supertagService.moveTagToSubCluster(targetSupertagId, cleanTag, targetSubClusterId, supertags);
      toast.success(`Moved #${cleanTag} into sub-cluster "${targetSc.name}"`);
    } catch (err: any) {
      toast.error('Failed to move tag: ' + err.message);
    }
  };

  const handleDropOnSupertagRoot = async (e: React.DragEvent, targetSupertagId: string) => {
    e.preventDefault();
    e.stopPropagation();

    let tag = draggedTagData?.tag;
    let sourceSupertagId = draggedTagData?.sourceSupertagId;
    let sourceSubClusterId = draggedTagData?.sourceSubClusterId;

    if (!tag) {
      try {
        const rawJson = e.dataTransfer.getData('application/json');
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          tag = parsed.tag;
          sourceSupertagId = parsed.sourceSupertagId || parsed.supertagId;
          sourceSubClusterId = parsed.sourceSubClusterId;
        }
      } catch (err) {}
    }

    setDraggedTagData(null);
    setDragOverTargetKey(null);

    if (!tag) return;
    const cleanTag = tag.trim().toLowerCase().replace(/^#+/, '');

    if (sourceSupertagId === targetSupertagId && sourceSubClusterId) {
      try {
        await supertagService.moveTagFromSubClusterToTopLevel(targetSupertagId, sourceSubClusterId, cleanTag, supertags);
        toast.success(`Moved #${cleanTag} to supertag root`);
      } catch (err: any) {
        toast.error('Failed to move tag: ' + err.message);
      }
    }
  };

  const handleMakeTagSubCluster = async (supertagId: string, tag: string) => {
    try {
      const clean = tag.trim().toLowerCase().replace(/^#+/, '');
      const targetSt = supertags.find(s => s.id === supertagId);
      await supertagService.createSubCluster(supertagId, clean, [clean], supertags);
      toast.success(`Created sub-cluster "${clean}" in ${targetSt?.name || 'supertag'}`);
      setExpandedSupertagIds(prev => new Set(prev).add(supertagId));
      setActiveChildMenuTag(null);
    } catch (err: any) {
      toast.error('Failed to create sub-cluster: ' + err.message);
    }
  };

  const handleAddTagToSubCluster = async (supertagId: string, subClusterId: string) => {
    if (!inlineNewSubClusterTag.trim()) return;
    const clean = inlineNewSubClusterTag.trim().toLowerCase().replace(/^#+/, '');
    try {
      await supertagService.addTagToSubCluster(supertagId, subClusterId, clean, supertags);
      toast.success(`Added #${clean} to sub-cluster`);
      setInlineNewSubClusterTag('');
      setAddingTagToSubClusterKey(null);
    } catch (err: any) {
      toast.error('Failed to add tag to sub-cluster: ' + err.message);
    }
  };

  const handleRenameSubCluster = async (supertagId: string, subClusterId: string, newName: string) => {
    const clean = newName.trim();
    if (!clean) return;
    try {
      await supertagService.renameSubCluster(supertagId, subClusterId, clean, supertags);
      toast.success(`Renamed sub-cluster to "${clean}"`);
      setEditingSubCluster(null);
    } catch (err: any) {
      toast.error('Failed to rename sub-cluster: ' + err.message);
    }
  };

  const handleDeleteSubCluster = async (supertagId: string, subClusterId: string, dissolve: boolean = true) => {
    try {
      await supertagService.deleteSubCluster(supertagId, subClusterId, dissolve, supertags);
      toast.success(dissolve ? 'Dissolved sub-cluster into supertag' : 'Deleted sub-cluster');
    } catch (err: any) {
      toast.error('Failed to remove sub-cluster: ' + err.message);
    }
  };

  const toggleTag = (tag: string) => {
    const clean = tag.trim().toLowerCase();
    const isSelected = selectedTags.some(t => t.trim().toLowerCase() === clean);
    if (isSelected) {
      setSelectedTags(selectedTags.filter(t => t.trim().toLowerCase() !== clean));
    } else {
      setSelectedTags([...selectedTags, clean]);
    }
  };

  const toggleStatus = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  const toggleLocation = (loc: string) => {
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(selectedLocations.filter(l => l !== loc));
    } else {
      setSelectedLocations([...selectedLocations, loc]);
    }
  };

  const toggleType = (type: string) => {
    if (selectedTypes.includes(type)) {
      setSelectedTypes(selectedTypes.filter(t => t !== type));
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  // Quick Supertag creation
  const handleCreateSupertag = async () => {
    if (!newSupertagName.trim()) return;
    try {
      const id = await supertagService.create(userId, {
        name: newSupertagName.trim(),
        tags: [],
        color: '#6366F1',
        icon: 'folder',
        order: supertags.length
      });
      toast.success(`Created supertag "${newSupertagName.trim()}"`);
      setNewSupertagName('');
      setIsCreatingSupertag(false);
      // Auto expand and filter the new supertag
      setExpandedSupertagIds(prev => new Set(prev).add(id));
    } catch (err: any) {
      toast.error('Failed to create supertag: ' + err.message);
    }
  };

  // Convert an existing standalone tag into a Supertag
  const handleConvertTagToSupertag = async (tagName: string) => {
    try {
      const clean = tagName.trim();
      const id = await supertagService.create(userId, {
        name: clean,
        tags: [clean.toLowerCase()],
        color: '#6366F1',
        icon: 'folder',
        order: supertags.length
      });
      toast.success(`Converted #${clean} into a Supertag folder!`);
      setExpandedSupertagIds(prev => new Set(prev).add(id));
      setActiveMenuTag(null);
    } catch (err: any) {
      toast.error('Failed to convert tag: ' + err.message);
    }
  };

  // Add tag to supertag
  const handleAddTagToSupertag = async (supertagId: string) => {
    if (!inlineNewTag.trim()) return;
    const clean = inlineNewTag.trim().toLowerCase().replace(/^#+/, '');
    try {
      await supertagService.addTagToSupertag(supertagId, clean, supertags);
      toast.success(`Added #${clean} to supertag`);
      setInlineNewTag('');
      setAddingTagToSupertagId(null);
    } catch (err: any) {
      toast.error('Failed to add tag: ' + err.message);
    }
  };

  // Remove tag from supertag
  const handleRemoveTagFromSupertag = async (supertagId: string, tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supertagService.removeTagFromSupertag(supertagId, tag, supertags);
      toast.success(`Removed #${tag} from supertag`);
    } catch (err: any) {
      toast.error('Failed to remove tag: ' + err.message);
    }
  };

  // Delete entire supertag - triggers custom confirmation dialog
  const handleDeleteSupertag = (supertagId: string, supertagName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteSupertag({ id: supertagId, name: supertagName });
  };

  const handleStartInlineSupertagRename = (st: Supertag, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setInlineEditingSupertagId(st.id);
    setInlineEditingSupertagName(st.name);
  };

  const handleSaveInlineSupertagRename = async (stId: string) => {
    const cleanName = inlineEditingSupertagName.trim();
    if (!cleanName) {
      toast.error('Supertag cluster name cannot be empty');
      return;
    }
    try {
      await supertagService.rename(stId, cleanName);
      toast.success(`Renamed supertag cluster to "${cleanName}"`);
      setInlineEditingSupertagId(null);
    } catch (err: any) {
      toast.error('Failed to rename supertag: ' + err.message);
    }
  };

  const handleExecuteDeleteSupertag = async () => {
    if (!confirmDeleteSupertag) return;
    const { id, name } = confirmDeleteSupertag;
    try {
      await supertagService.delete(id);
      toast.success(`Deleted supertag folder "${name}"`);
      setConfirmDeleteSupertag(null);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to delete supertag: ' + (err.message || 'Unknown error'));
    }
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      if (item.archived === true) return;
      if (item.type) {
        counts[item.type] = (counts[item.type] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  const locationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      if (item.archived === true) return;
      if (item.location) {
        counts[item.location] = (counts[item.location] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  const locationsToDisplay = useMemo(() => {
    const getRecommendedLocations = () => {
      if (selectedTypes.length === 0) {
        return Array.from(new Set(Object.values(LOCATION_MAPPING).flat()));
      }
      return Array.from(new Set(selectedTypes.flatMap(type => LOCATION_MAPPING[type] || [])));
    };

    const recommended = getRecommendedLocations();
    const dbLocations = Array.from(new Set(
      items
        .filter(item => !item.archived && item.location)
        .map(item => item.location!)
    ));

    if (selectedTypes.length > 0) {
      const filteredDbLocs = items
        .filter(item => !item.archived && selectedTypes.includes(item.type) && item.location)
        .map(item => item.location!);
        
      const combined = Array.from(new Set([...recommended, ...filteredDbLocs]));
      
      return combined.sort((a, b) => {
        const countA = locationCounts[a] || 0;
        const countB = locationCounts[b] || 0;
        if (countB !== countA) return countB - countA;
        return a.localeCompare(b);
      });
    } else {
      return dbLocations.sort((a, b) => {
        const countA = locationCounts[a] || 0;
        const countB = locationCounts[b] || 0;
        if (countB !== countA) return countB - countA;
        return a.localeCompare(b);
      });
    }
  }, [items, selectedTypes, locationCounts]);

  return (
    <>
    <aside className={cn(
      "bg-[#121214] border-r border-white/10 overflow-y-auto shrink-0 flex flex-col transition-all duration-300 custom-scrollbar select-none",
      isCollapsed ? "w-0 p-0 border-r-0 overflow-hidden" : "w-80 p-4 gap-5"
    )}>
      {!isCollapsed && (
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <span className="text-[10px] uppercase tracking-widest text-[#818CF8] font-mono font-bold">FILTERS_PANEL</span>
          <button 
            type="button"
            onClick={onToggleCollapse}
            className="p-1 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer flex items-center justify-center active:scale-90"
            title="Collapse Sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* SUPERTAGS & CLUSTERS SECTION */}
      <div>
        <div 
          onClick={() => toggleSection('supertags')}
          className="flex items-center justify-between mb-2.5 cursor-pointer group/sec select-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="text-white/40 group-hover/sec:text-white transition-colors shrink-0">
              {collapsedSections['supertags'] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </div>
            <h3 className="text-[10px] uppercase tracking-widest text-white/40 group-hover/sec:text-white/70 flex items-center gap-1.5 font-mono font-bold transition-colors truncate">
              <FolderOpen size={11} className="text-indigo-400 shrink-0" />
              <span>SUPERTAG_CLUSTERS</span>
            </h3>
            <span className="text-[9px] font-mono text-white/30 px-1 py-0.2 bg-white/5 rounded shrink-0">
              {supertags.length}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsCreatingSupertag(true)}
              className="p-1 bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-300 text-white/50 border border-white/5 hover:border-indigo-500/30 rounded text-[9px] font-mono transition-all cursor-pointer"
              title="Create new Supertag folder"
            >
              <Plus size={11} />
            </button>
            <button
              type="button"
              onClick={() => setIsNormalizeOpen(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 rounded text-[9px] font-mono text-indigo-300 font-bold uppercase transition-all cursor-pointer"
              title="Normalize redundant tags and organize supertags"
            >
              <Sparkles size={10} className="text-indigo-400" />
              <span>NORMALIZE</span>
              {redundantClusterCount > 0 && (
                <span className="size-3.5 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center font-bold">
                  {redundantClusterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {!collapsedSections['supertags'] && (
          <div className="space-y-1.5 animate-in fade-in duration-150">
            {/* Quick inline new supertag input */}
            {isCreatingSupertag && (
              <div className="mb-2 p-2 bg-indigo-950/40 border border-indigo-500/40 rounded space-y-1.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5">
                  <FolderPlus size={13} className="text-indigo-400 shrink-0" />
                  <input
                    type="text"
                    value={newSupertagName}
                    onChange={e => setNewSupertagName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateSupertag();
                      if (e.key === 'Escape') setIsCreatingSupertag(false);
                    }}
                    placeholder="Supertag name (e.g. 🤖 AI, Books...)"
                    className="w-full bg-black/60 border border-white/10 rounded px-2 py-0.5 text-[11px] font-mono text-white focus:outline-none focus:border-indigo-400"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-1.5 text-[9px] font-mono">
                  <button
                    type="button"
                    onClick={() => { setIsCreatingSupertag(false); setNewSupertagName(''); }}
                    className="px-2 py-0.5 text-white/40 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSupertag}
                    disabled={!newSupertagName.trim()}
                    className="px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold uppercase"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Supertags Folder List with Drag-and-Drop Reordering */}
            <div className="space-y-1.5">
          {supertags.length > 0 ? (
            supertags.map((st) => {
              const isExpanded = expandedSupertagIds.has(st.id);
              const allStTags = supertagService.getAllSupertagTags(st);
              const subClusters = st.subClusters || [];
              const topLevelTags = (st.tags || []).filter(t => {
                // Exclude tags already present in sub-clusters to avoid duplication in display
                const clean = t.trim().toLowerCase();
                return !subClusters.some(sc => (sc.tags || []).some(sct => sct.trim().toLowerCase() === clean));
              });
              const stItemCount = supertagItemCounts[st.id] || 0;
              const allChildTagsSelected = allStTags.length > 0 && allStTags.every(t => selectedTags.includes(t));
              const someChildTagsSelected = allStTags.some(t => selectedTags.includes(t));
              const isDragging = draggedSupertagId === st.id;
              const isDragOver = dragOverSupertagId === st.id;

              return (
                <div 
                  key={st.id}
                  draggable={inlineEditingSupertagId !== st.id && !draggedTagData}
                  onDragStart={(e) => handleDragStart(e, st.id)}
                  onDragOver={(e) => handleDragOver(e, st.id)}
                  onDragLeave={(e) => handleDragLeave(e, st.id)}
                  onDrop={(e) => handleDrop(e, st.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "relative rounded border transition-all",
                    isExpanded ? "overflow-visible bg-white/[0.03] border-white/10" : "overflow-hidden bg-black/30 border-white/5 hover:border-white/10",
                    isDragging ? "opacity-40 border-dashed border-indigo-500/60 scale-[0.98]" : ""
                  )}
                >
                  {/* Drop position indicator for supertag reordering */}
                  {isDragOver && dropPosition === 'above' && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-500 z-20 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  )}
                  {isDragOver && dropPosition === 'below' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 z-20 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  )}

                  {/* Supertag Folder Toggle Header */}
                  <div 
                    onClick={(e) => handleSupertagClick(st, e)}
                    className="p-2 flex items-center justify-between gap-1.5 cursor-pointer group hover:bg-white/[0.02]"
                  >
                    {inlineEditingSupertagId === st.id ? (
                      /* Inline Rename Mode */
                      <div className="flex items-center gap-1.5 min-w-0 flex-1" onClick={e => e.stopPropagation()}>
                        <div 
                          className="size-2 rounded-full shrink-0" 
                          style={{ backgroundColor: st.color || '#6366F1' }} 
                        />
                        <input
                          type="text"
                          value={inlineEditingSupertagName}
                          onChange={e => setInlineEditingSupertagName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveInlineSupertagRename(st.id);
                            if (e.key === 'Escape') setInlineEditingSupertagId(null);
                          }}
                          className="bg-black/80 border border-indigo-500/60 rounded px-1.5 py-0.5 text-[11px] font-mono font-bold text-white w-full focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveInlineSupertagRename(st.id)}
                          className="p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[9px] font-mono cursor-pointer shrink-0"
                          title="Save name"
                        >
                          <Check size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineEditingSupertagId(null)}
                          className="p-1 text-white/40 hover:text-white rounded text-[9px] font-mono cursor-pointer shrink-0"
                          title="Cancel"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      /* Standard Header Display */
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {/* Drag Handle */}
                        <div 
                          className="text-white/20 group-hover:text-white/50 cursor-grab active:cursor-grabbing p-0.5 shrink-0 transition-colors"
                          title="Drag to reorder supertag"
                          onClick={e => e.stopPropagation()}
                        >
                          <GripVertical size={11} />
                        </div>

                        {/* Expand/Collapse Chevron Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSupertagClick(st, e);
                          }}
                          className="p-0.5 text-white/40 hover:text-white transition-transform shrink-0"
                          title={isExpanded ? "Collapse folder" : "Expand folder & filter"}
                        >
                          {isExpanded ? (
                            <ChevronDown size={13} className="text-indigo-400" />
                          ) : (
                            <ChevronRight size={13} />
                          )}
                        </button>

                        {/* Color Dot & Extended Supertag Name (Double-click to rename) */}
                        <div 
                          className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer pr-1"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setRenamingSupertag(st);
                          }}
                          title="Double-click to rename folder"
                        >
                          <div 
                            className="size-2 rounded-full shrink-0" 
                            style={{ backgroundColor: st.color || '#6366F1' }} 
                          />
                          <span 
                            className="text-[11px] font-mono font-bold text-white truncate group-hover:text-indigo-300 transition-colors flex-1"
                            title={st.name}
                          >
                            {st.name}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Right Header Actions */}
                    {inlineEditingSupertagId !== st.id && (
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        {/* Compact items count */}
                        <span 
                          className="text-[9px] font-mono text-white/40 px-1 py-0.5 bg-white/5 rounded min-w-4 text-center"
                          title={`${allStTags.length} tags · ${stItemCount} items`}
                        >
                          {stItemCount}
                        </span>

                        {/* Supertag Filter Checkbox Button */}
                        <button
                          type="button"
                          onClick={(e) => toggleSupertagFilter(st, e)}
                          className={cn(
                            "p-1 rounded transition-all cursor-pointer",
                            allChildTagsSelected
                              ? "bg-indigo-600 text-white shadow-sm"
                              : someChildTagsSelected
                              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                              : "text-white/30 hover:text-white hover:bg-white/10"
                          )}
                          title={allChildTagsSelected ? "Deselect supertag" : "Filter by supertag items"}
                        >
                          {allChildTagsSelected ? (
                            <CheckSquare size={11} />
                          ) : someChildTagsSelected ? (
                            <div className="size-2.5 bg-indigo-400 rounded-sm" />
                          ) : (
                            <Square size={11} />
                          )}
                        </button>

                        {/* Delete Supertag */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSupertag(st.id, st.name, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-rose-400 transition-all cursor-pointer rounded hover:bg-white/5"
                          title="Delete supertag folder"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded Sub-Clusters and Child Tags */}
                  {isExpanded && (
                    <div className="px-2.5 pb-2 pt-1 border-t border-white/5 bg-black/40 space-y-2 animate-in fade-in duration-100">
                      {/* 1. RENDER SUB-CLUSTERS (IF ANY) */}
                      {subClusters.length > 0 && (
                        <div className="space-y-1.5">
                          {subClusters.map((sc) => {
                            const scTags = sc.tags || [];
                            const isScDropTarget = dragOverTargetKey === `sub::${st.id}::${sc.id}`;
                            const isAllScSelected = scTags.length > 0 && scTags.every(t => selectedTags.includes(t));
                            const isSomeScSelected = scTags.some(t => selectedTags.includes(t));
                            const isEditingThisSc = editingSubCluster?.supertagId === st.id && editingSubCluster?.subClusterId === sc.id;
                            const isAddingTagToSc = addingTagToSubClusterKey === `${st.id}::${sc.id}`;

                            return (
                              <div
                                key={sc.id}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = 'move';
                                  setDragOverTargetKey(`sub::${st.id}::${sc.id}`);
                                }}
                                onDragLeave={(e) => {
                                  e.stopPropagation();
                                  if (dragOverTargetKey === `sub::${st.id}::${sc.id}`) {
                                    setDragOverTargetKey(null);
                                  }
                                }}
                                onDrop={(e) => handleDropOnSubCluster(e, st.id, sc.id)}
                                className={cn(
                                  "rounded p-1.5 border transition-all relative",
                                  isScDropTarget
                                    ? "border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/40 shadow-lg scale-[1.01]"
                                    : "bg-white/[0.02] border-white/10 hover:border-white/20"
                                )}
                              >
                                {/* Sub-cluster Header */}
                                <div className="flex items-center justify-between gap-1 mb-1 group/sc">
                                  {isEditingThisSc ? (
                                    <div className="flex items-center gap-1 min-w-0 flex-1">
                                      <FolderTree size={10} className="text-amber-400 shrink-0" />
                                      <input
                                        type="text"
                                        value={editingSubCluster.name}
                                        onChange={e => setEditingSubCluster({ ...editingSubCluster, name: e.target.value })}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleRenameSubCluster(st.id, sc.id, editingSubCluster.name);
                                          if (e.key === 'Escape') setEditingSubCluster(null);
                                        }}
                                        className="bg-black/90 border border-amber-500/60 rounded px-1 py-0.2 text-[10px] font-mono text-white w-full focus:outline-none"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleRenameSubCluster(st.id, sc.id, editingSubCluster.name)}
                                        className="p-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
                                      >
                                        <Check size={10} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingSubCluster(null)}
                                        className="p-0.5 text-white/40 hover:text-white rounded cursor-pointer"
                                      >
                                        <X size={10} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div 
                                      className="flex items-center gap-1 min-w-0 flex-1 cursor-pointer"
                                      onDoubleClick={() => setEditingSubCluster({ supertagId: st.id, subClusterId: sc.id, name: sc.name })}
                                      title="Double-click to rename sub-cluster"
                                    >
                                      <FolderTree size={11} className="text-amber-400 shrink-0" />
                                      <span className="text-[10px] font-mono font-bold text-amber-200/90 truncate group-hover/sc:text-amber-100">
                                        {sc.name}
                                      </span>
                                      <span className="text-[8px] font-mono text-white/30 px-1 py-0.2 bg-white/5 rounded shrink-0">
                                        {scTags.length}
                                      </span>
                                    </div>
                                  )}

                                  {!isEditingThisSc && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      {/* Filter toggle checkbox for sub-cluster */}
                                      <button
                                        type="button"
                                        onClick={(e) => toggleSubClusterFilter(scTags, e)}
                                        className={cn(
                                          "p-0.5 rounded cursor-pointer transition-all",
                                          isAllScSelected
                                            ? "bg-amber-600 text-white shadow-sm"
                                            : isSomeScSelected
                                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                            : "text-white/30 hover:text-white hover:bg-white/10"
                                        )}
                                        title={isAllScSelected ? "Deselect sub-cluster" : "Filter by sub-cluster"}
                                      >
                                        {isAllScSelected ? (
                                          <CheckSquare size={10} />
                                        ) : isSomeScSelected ? (
                                          <div className="size-2 bg-amber-400 rounded-xs" />
                                        ) : (
                                          <Square size={10} />
                                        )}
                                      </button>

                                      {/* Edit sub-cluster name */}
                                      <button
                                        type="button"
                                        onClick={() => setEditingSubCluster({ supertagId: st.id, subClusterId: sc.id, name: sc.name })}
                                        className="opacity-0 group-hover/sc:opacity-100 p-0.5 text-white/30 hover:text-amber-300 transition-opacity cursor-pointer rounded"
                                        title="Rename sub-cluster"
                                      >
                                        <Edit2 size={9} />
                                      </button>

                                      {/* Delete / Dissolve sub-cluster */}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSubCluster(st.id, sc.id, true)}
                                        className="opacity-0 group-hover/sc:opacity-100 p-0.5 text-white/20 hover:text-rose-400 transition-opacity cursor-pointer rounded"
                                        title="Dissolve sub-cluster (keep tags in supertag)"
                                      >
                                        <Trash2 size={9} />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Tags inside this sub-cluster */}
                                <div className="flex flex-wrap gap-1 items-center pt-0.5">
                                  {scTags.length > 0 ? (
                                    scTags.map(tag => {
                                      const isSelected = selectedTags.includes(tag);
                                      const count = tagCounts[tag] || 0;
                                      const isChildMenuOpen = activeChildMenuTag?.supertagId === st.id && activeChildMenuTag?.tag === tag;

                                      return (
                                        <div
                                          key={tag}
                                          draggable={true}
                                          onDragStart={(e) => handleTagDragStart(e, { tag, supertagId: st.id, sourceSubClusterId: sc.id })}
                                          onDragEnd={handleTagDragEnd}
                                          className={cn(
                                            "relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-mono border transition-all cursor-grab active:cursor-grabbing group/tag select-none",
                                            isSelected
                                              ? "bg-amber-500/30 border-amber-500/60 text-amber-200 font-bold shadow-xs"
                                              : "bg-white/5 border-amber-500/20 text-white/80 hover:border-amber-400/40 hover:text-white"
                                          )}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className="cursor-pointer flex items-center gap-1"
                                          >
                                            <span>#{tag}</span>
                                            <span className="text-[8px] opacity-60">({count})</span>
                                          </button>

                                          {/* Options button */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveChildMenuTag(isChildMenuOpen ? null : { supertagId: st.id, tag, subClusterId: sc.id });
                                            }}
                                            className="opacity-0 group-hover/tag:opacity-100 text-white/40 hover:text-white transition-all cursor-pointer p-0.5"
                                            title="Tag options"
                                          >
                                            <MoreHorizontal size={9} />
                                          </button>

                                          {/* Remove tag fast button */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              supertagService.removeTagFromSubCluster(st.id, sc.id, tag, supertags);
                                              toast.success(`Removed #${tag} from sub-cluster`);
                                            }}
                                            className="opacity-0 group-hover/tag:opacity-100 text-white/30 hover:text-red-400 transition-all cursor-pointer ml-0.5"
                                            title="Remove tag from sub-cluster"
                                          >
                                            <X size={9} />
                                          </button>

                                          {/* Tag Popover Menu */}
                                          {isChildMenuOpen && (
                                            <>
                                              <div 
                                                className="fixed inset-0 z-40 bg-transparent"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setActiveChildMenuTag(null);
                                                }}
                                              />
                                              <div 
                                                className="absolute right-0 top-full mt-1 z-50 bg-[#18181B] border border-white/20 rounded-md p-1.5 shadow-2xl space-y-1 w-52 max-w-[260px] text-[10px] font-mono animate-in fade-in duration-100 ring-1 ring-black/50"
                                                onClick={e => e.stopPropagation()}
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setRenamingTag(tag);
                                                    setActiveChildMenuTag(null);
                                                  }}
                                                  className="w-full px-2 py-1 text-left text-indigo-300 hover:bg-indigo-500/20 rounded flex items-center gap-1.5 cursor-pointer font-bold"
                                                >
                                                  <Edit2 size={10} />
                                                  <span>Edit Tag & Supertags...</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={async () => {
                                                    await supertagService.moveTagFromSubClusterToTopLevel(st.id, sc.id, tag, supertags);
                                                    toast.success(`Moved #${tag} to supertag root`);
                                                    setActiveChildMenuTag(null);
                                                  }}
                                                  className="w-full px-2 py-1 text-left text-white/70 hover:bg-white/10 rounded flex items-center gap-1.5 cursor-pointer"
                                                >
                                                  <FolderOpen size={10} />
                                                  <span>Move to Supertag root</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={async (e) => {
                                                    await handleRemoveTagFromSupertag(st.id, tag, e);
                                                    setActiveChildMenuTag(null);
                                                  }}
                                                  className="w-full px-2 py-1 text-left text-red-400 hover:bg-red-500/10 rounded flex items-center gap-1.5 cursor-pointer"
                                                >
                                                  <X size={10} />
                                                  <span>Remove from folder</span>
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <span className="text-[9px] text-amber-200/40 italic py-0.5 font-mono">
                                      Drop tags here or click + tag
                                    </span>
                                  )}

                                  {/* Inline add tag to sub-cluster */}
                                  {isAddingTagToSc ? (
                                    <div className="flex items-center gap-1 my-0.5">
                                      <input
                                        type="text"
                                        value={inlineNewSubClusterTag}
                                        onChange={e => setInlineNewSubClusterTag(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleAddTagToSubCluster(st.id, sc.id);
                                          if (e.key === 'Escape') setAddingTagToSubClusterKey(null);
                                        }}
                                        placeholder="tag-name..."
                                        className="bg-black/90 border border-amber-500/60 rounded px-1.5 py-0.5 text-[9px] font-mono text-white w-20 focus:outline-none"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleAddTagToSubCluster(st.id, sc.id)}
                                        className="px-1.5 py-0.5 bg-amber-600 text-white text-[8px] rounded font-mono font-bold uppercase cursor-pointer"
                                      >
                                        Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setAddingTagToSubClusterKey(null)}
                                        className="text-white/30 hover:text-white text-[9px] p-0.5 cursor-pointer"
                                      >
                                        <X size={10} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddingTagToSubClusterKey(`${st.id}::${sc.id}`);
                                        setInlineNewSubClusterTag('');
                                      }}
                                      className="px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 border border-dashed border-amber-500/30 text-amber-300/70 hover:text-amber-200 rounded text-[8.5px] font-mono flex items-center gap-0.5 cursor-pointer"
                                      title="Add tag to sub-cluster"
                                    >
                                      <Plus size={8} />
                                      <span>tag</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 2. TOP LEVEL / DIRECT TAGS WITHIN SUPERTAG (DROPPABLE ZONE) */}
                      <div>
                        {subClusters.length > 0 && topLevelTags.length > 0 && (
                          <div className="text-[8.5px] uppercase tracking-wider text-white/30 font-bold px-0.5 mb-1 flex items-center justify-between">
                            <span>Direct Tags ({topLevelTags.length})</span>
                          </div>
                        )}

                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            setDragOverTargetKey(`root::${st.id}`);
                          }}
                          onDragLeave={(e) => {
                            e.stopPropagation();
                            if (dragOverTargetKey === `root::${st.id}`) {
                              setDragOverTargetKey(null);
                            }
                          }}
                          onDrop={(e) => handleDropOnSupertagRoot(e, st.id)}
                          className={cn(
                            "flex flex-wrap gap-1 items-center p-1 rounded transition-all min-h-6",
                            dragOverTargetKey === `root::${st.id}`
                              ? "border border-dashed border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-400/40"
                              : ""
                          )}
                        >
                          {topLevelTags.length > 0 ? (
                            topLevelTags.map(tag => {
                              const isSelected = selectedTags.includes(tag);
                              const count = tagCounts[tag] || 0;
                              const isChildMenuOpen = activeChildMenuTag?.supertagId === st.id && activeChildMenuTag?.tag === tag && !activeChildMenuTag?.subClusterId;

                              return (
                                <div
                                  key={tag}
                                  draggable={true}
                                  onDragStart={(e) => handleTagDragStart(e, { tag, supertagId: st.id, sourceSubClusterId: null })}
                                  onDragEnd={handleTagDragEnd}
                                  className={cn(
                                    "relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-grab active:cursor-grabbing group/tag select-none",
                                    isSelected
                                      ? "bg-indigo-500/30 border-indigo-500/60 text-indigo-200 font-bold shadow-xs"
                                      : "bg-white/5 border-white/10 text-white/70 hover:border-white/20 hover:text-white"
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleTag(tag)}
                                    className="cursor-pointer flex items-center gap-1"
                                  >
                                    <span>#{tag}</span>
                                    <span className="text-[8px] opacity-60">({count})</span>
                                  </button>

                                  {/* Child tag menu button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveChildMenuTag(isChildMenuOpen ? null : { supertagId: st.id, tag });
                                    }}
                                    className="opacity-0 group-hover/tag:opacity-100 text-white/40 hover:text-white transition-all cursor-pointer p-0.5"
                                    title="Tag options"
                                  >
                                    <MoreHorizontal size={9} />
                                  </button>

                                  {/* Remove tag fast button */}
                                  <button
                                    type="button"
                                    onClick={(e) => handleRemoveTagFromSupertag(st.id, tag, e)}
                                    className="opacity-0 group-hover/tag:opacity-100 text-white/30 hover:text-red-400 transition-all cursor-pointer ml-0.5"
                                    title="Remove tag from supertag"
                                  >
                                    <X size={9} />
                                  </button>

                                  {/* Child Tag Popover Menu */}
                                  {isChildMenuOpen && (
                                    <>
                                      <div 
                                        className="fixed inset-0 z-40 bg-transparent"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveChildMenuTag(null);
                                        }}
                                      />
                                      <div 
                                        className="absolute right-0 top-full mt-1 z-50 bg-[#18181B] border border-white/20 rounded-md p-1.5 shadow-2xl space-y-1 w-52 max-w-[260px] text-[10px] font-mono animate-in fade-in duration-100 ring-1 ring-black/50"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setRenamingTag(tag);
                                            setActiveChildMenuTag(null);
                                          }}
                                          className="w-full px-2 py-1 text-left text-indigo-300 hover:bg-indigo-500/20 rounded flex items-center gap-1.5 cursor-pointer font-bold"
                                        >
                                          <Edit2 size={10} />
                                          <span>Edit Tag & Supertags...</span>
                                        </button>

                                        {/* MAKE TAG SUB-CLUSTER */}
                                        <button
                                          type="button"
                                          onClick={() => handleMakeTagSubCluster(st.id, tag)}
                                          className="w-full px-2 py-1 text-left text-amber-300 hover:bg-amber-500/20 rounded flex items-center gap-1.5 cursor-pointer font-bold"
                                          title={`Turn #${tag} into a sub-cluster within ${st.name}`}
                                        >
                                          <FolderTree size={10} className="text-amber-400" />
                                          <span>Make Tag Sub-Cluster</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            await handleRemoveTagFromSupertag(st.id, tag, e);
                                            setActiveChildMenuTag(null);
                                          }}
                                          className="w-full px-2 py-1 text-left text-red-400 hover:bg-red-500/10 rounded flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <X size={10} />
                                          <span>Remove from this folder</span>
                                        </button>

                                        {supertags.filter(s => s.id !== st.id).length > 0 && (
                                          <div className="border-t border-white/5 pt-1 mt-1">
                                            <span className="text-[8px] uppercase text-white/40 px-2 block mb-0.5 font-bold">Assign to other folders:</span>
                                            {supertags.filter(s => s.id !== st.id).map(otherSt => {
                                              const isAlreadyInOther = supertagService.getAllSupertagTags(otherSt).includes(tag.toLowerCase().trim());
                                              return (
                                                <button
                                                  key={otherSt.id}
                                                  type="button"
                                                  onClick={async () => {
                                                    if (isAlreadyInOther) {
                                                      await supertagService.removeTagFromSupertag(otherSt.id, tag, supertags);
                                                      toast.success(`Removed #${tag} from "${otherSt.name}"`);
                                                    } else {
                                                      await supertagService.addTagToSupertag(otherSt.id, tag, supertags);
                                                      toast.success(`Added #${tag} to "${otherSt.name}"`);
                                                    }
                                                  }}
                                                  className={cn(
                                                    "w-full px-2 py-0.5 text-left rounded flex items-center justify-between gap-1 cursor-pointer transition-colors",
                                                    isAlreadyInOther
                                                      ? "text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 font-bold"
                                                      : "text-white/70 hover:text-white hover:bg-white/10"
                                                  )}
                                                >
                                                  <div className="flex items-center gap-1.5 truncate">
                                                    <div className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: otherSt.color || '#6366F1' }} />
                                                    <span className="truncate">{otherSt.name}</span>
                                                  </div>
                                                  {isAlreadyInOther ? (
                                                    <Check size={9} className="text-indigo-400 shrink-0" />
                                                  ) : (
                                                    <span className="text-[8px] text-white/30 shrink-0">+</span>
                                                  )}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })
                          ) : subClusters.length === 0 ? (
                            <p className="text-[9px] text-white/30 font-mono italic py-0.5">
                              Empty supertag cluster.
                            </p>
                          ) : null}

                          {/* Add Tag to Supertag inline button */}
                          {addingTagToSupertagId === st.id ? (
                            <div className="flex items-center gap-1 my-0.5">
                              <input
                                type="text"
                                value={inlineNewTag}
                                onChange={e => setInlineNewTag(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleAddTagToSupertag(st.id);
                                  if (e.key === 'Escape') setAddingTagToSupertagId(null);
                                }}
                                placeholder="tag-name..."
                                className="bg-black/80 border border-indigo-500/40 rounded px-1.5 py-0.5 text-[9px] font-mono text-white w-24 focus:outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleAddTagToSupertag(st.id)}
                                className="px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] rounded font-mono font-bold uppercase cursor-pointer"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => setAddingTagToSupertagId(null)}
                                className="text-white/30 hover:text-white text-[9px] p-0.5 cursor-pointer"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAddingTagToSupertagId(st.id);
                                setInlineNewTag('');
                              }}
                              className="px-1.5 py-0.5 bg-white/[0.03] hover:bg-white/10 border border-dashed border-white/20 hover:border-white/40 text-white/40 hover:text-white rounded text-[9px] font-mono flex items-center gap-0.5 cursor-pointer"
                              title="Add a tag to this supertag"
                            >
                              <Plus size={9} />
                              <span>tag</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-[10px] text-white/20 italic font-mono p-2 bg-black/20 rounded border border-white/5 text-center">
              NO_SUPERTAGS_YET
            </p>
          )}
        </div>
        </div>
      )}
      </div>

      {/* METRICS_FILTER SECTION */}
      <div>
        <div 
          onClick={() => toggleSection('metrics')}
          className="flex items-center justify-between mb-2.5 cursor-pointer group/sec select-none"
        >
          <div className="flex items-center gap-1.5">
            <div className="text-white/40 group-hover/sec:text-white transition-colors">
              {collapsedSections['metrics'] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </div>
            <h3 className="text-[10px] uppercase tracking-widest text-white/40 group-hover/sec:text-white/70 flex items-center gap-2 font-mono font-bold transition-colors">
              <FilterIcon size={10} className="text-indigo-400" />
              <span>METRICS_FILTER</span>
            </h3>
          </div>
          {(minRelevance > 0 || minAliveness > 0 || minProgress > 0) && (
            <span className="text-[9px] font-mono text-indigo-300 px-1.5 py-0.2 bg-indigo-500/20 border border-indigo-500/30 rounded font-bold">
              ACTIVE
            </span>
          )}
        </div>

        {!collapsedSections['metrics'] && (
          <div className="flex flex-col gap-3.5 bg-black/25 p-2.5 rounded border border-white/5 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-bold text-white/60 tracking-widest flex justify-between font-mono">
                <span>MIN_RELEVANCE</span>
                <span className="text-indigo-400">{minRelevance}%</span>
              </label>
              <input 
                type="range" min="0" max="100" value={minRelevance} onChange={e => setMinRelevance(parseInt(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-bold text-white/60 tracking-widest flex justify-between font-mono">
                <span>MIN_ALIVENESS</span>
                <span className="text-rose-400">{minAliveness}%</span>
              </label>
              <input 
                type="range" min="0" max="100" value={minAliveness} onChange={e => setMinAliveness(parseInt(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-rose-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-bold text-white/60 tracking-widest flex justify-between font-mono">
                <span>MIN_COMPLETION</span>
                <span className="text-emerald-400">{minProgress}%</span>
              </label>
              <input 
                type="range" min="0" max="100" value={minProgress} onChange={e => setMinProgress(parseInt(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* TAG TAXONOMY & HIERARCHICAL FOLDERS */}
      <div>
        <div 
          onClick={() => toggleSection('tags')}
          className="flex items-center justify-between mb-2 cursor-pointer group/sec select-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="text-white/40 group-hover/sec:text-white transition-colors shrink-0">
              {collapsedSections['tags'] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </div>
            <h3 className="text-[10px] uppercase tracking-widest text-white/40 group-hover/sec:text-white/70 font-mono flex items-center gap-1.5 font-bold transition-colors truncate">
              {tagViewMode === 'tree' ? (
                <FolderTree size={11} className="text-indigo-400 shrink-0" />
              ) : (
                <Tag size={10} className="text-indigo-400 shrink-0" />
              )}
              <span>
                {tagViewMode === 'tree' ? 'TAG_FOLDERS' : `STANDALONE_TAGS (${standaloneTags.length})`}
              </span>
            </h3>
            {selectedTags.length > 0 && (
              <span className="text-[9px] font-mono text-indigo-300 px-1.5 py-0.2 bg-indigo-500/20 border border-indigo-500/30 rounded font-bold shrink-0">
                {selectedTags.length}
              </span>
            )}
          </div>

          {/* View mode toggle: Hierarchy vs Flat */}
          <div className="flex items-center bg-black/40 p-0.5 rounded border border-white/10 text-[9px] font-mono shrink-0" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setTagViewMode('tree')}
              className={cn(
                "px-1.5 py-0.5 rounded flex items-center gap-1 transition-all cursor-pointer",
                tagViewMode === 'tree'
                  ? "bg-indigo-600 text-white font-bold"
                  : "text-white/40 hover:text-white"
              )}
              title="Hierarchical folder structure view (tags within tags within tags)"
            >
              <FolderTree size={10} />
              <span>NESTED</span>
            </button>
            <button
              type="button"
              onClick={() => setTagViewMode('flat')}
              className={cn(
                "px-1.5 py-0.5 rounded flex items-center gap-1 transition-all cursor-pointer",
                tagViewMode === 'flat'
                  ? "bg-indigo-600 text-white font-bold"
                  : "text-white/40 hover:text-white"
              )}
              title="Flat standalone tag cloud view"
            >
              <Tag size={10} />
              <span>FLAT</span>
            </button>
          </div>
        </div>

        {!collapsedSections['tags'] && (
          <div className="animate-in fade-in duration-150">
            {tagViewMode === 'tree' ? (
              <TagFolderTreeView
                treeNodes={folderTreeNodes}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
                supertags={supertags}
                userId={userId}
                onRenameTag={(tag) => setRenamingTag(tag)}
                expandedIds={expandedFolderTreeIds}
                setExpandedIds={setExpandedFolderTreeIds}
              />
            ) : (
              <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {standaloneTags.length > 0 ? (
                  standaloneTags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    const count = tagCounts[tag] || 0;
                    const isMenuOpen = activeMenuTag === tag;

                    return (
                      <div key={tag} className="relative group/standalone">
                        <button
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={cn(
                            "px-2 py-0.5 rounded-sm text-[10px] border transition-all flex items-center gap-1 cursor-pointer",
                            isSelected
                              ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-400 font-bold"
                              : "bg-white/5 border-white/10 text-white/60 hover:border-white/20 hover:text-white"
                          )}
                        >
                          <span>#{tag}</span>
                          <span className="text-[8px] opacity-50 font-mono">({count})</span>
                        </button>

                        {/* Context dropdown button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuTag(isMenuOpen ? null : tag);
                          }}
                          className="absolute right-0 -top-1 opacity-0 group-hover/standalone:opacity-100 p-0.5 bg-black/90 border border-white/20 rounded text-white/60 hover:text-white cursor-pointer z-10"
                          title="Tag actions"
                        >
                          <MoreHorizontal size={9} />
                        </button>

                        {/* Popover Action Menu */}
                        {isMenuOpen && (
                          <div 
                            className="absolute left-0 top-full mt-1 z-30 bg-[#1A1A1D] border border-white/15 rounded p-1.5 shadow-2xl space-y-1 min-w-48 text-[10px] font-mono animate-in fade-in duration-100"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingTag(tag);
                                setActiveMenuTag(null);
                              }}
                              className="w-full px-2 py-1 text-left text-indigo-300 hover:bg-indigo-500/20 rounded flex items-center gap-1.5 cursor-pointer font-bold"
                            >
                              <Edit2 size={11} />
                              <span>Edit Tag & Supertags...</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleConvertTagToSupertag(tag)}
                              className="w-full px-2 py-1 text-left text-white/80 hover:text-white hover:bg-white/10 rounded flex items-center gap-1.5 cursor-pointer"
                            >
                              <FolderPlus size={11} />
                              <span>Make Supertag Folder</span>
                            </button>

                            {supertags.length > 0 && (
                              <div className="border-t border-white/5 pt-1 mt-1">
                                <span className="text-[8px] uppercase text-white/40 px-2 block mb-0.5 font-bold">Assign to Supertags:</span>
                                {supertags.map(st => {
                                  const isAssigned = (st.tags || []).some(t => t.toLowerCase().trim() === tag.toLowerCase().trim());
                                  return (
                                    <button
                                      key={st.id}
                                      type="button"
                                      onClick={async () => {
                                        if (isAssigned) {
                                          await supertagService.removeTagFromSupertag(st.id, tag, supertags);
                                          toast.success(`Removed #${tag} from "${st.name}"`);
                                        } else {
                                          await supertagService.addTagToSupertag(st.id, tag, supertags);
                                          toast.success(`Added #${tag} to "${st.name}"`);
                                        }
                                      }}
                                      className={cn(
                                        "w-full px-2 py-0.5 text-left rounded flex items-center justify-between gap-1 cursor-pointer transition-colors",
                                        isAssigned
                                          ? "text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 font-bold"
                                          : "text-white/70 hover:text-white hover:bg-white/10"
                                      )}
                                    >
                                      <div className="flex items-center gap-1.5 truncate">
                                        <div className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: st.color || '#6366F1' }} />
                                        <span className="truncate">{st.name}</span>
                                      </div>
                                      {isAssigned ? (
                                        <Check size={9} className="text-indigo-400 shrink-0" />
                                      ) : (
                                        <span className="text-[8px] text-white/30 shrink-0">+</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[10px] text-white/20 italic font-mono">NO_STANDALONE_TAGS</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* STATUS_CHANNELS (Moved above FORMAT_TAXONOMY) */}
      <div>
        <div 
          onClick={() => toggleSection('status')}
          className="flex items-center justify-between mb-2.5 cursor-pointer group/sec select-none"
        >
          <div className="flex items-center gap-1.5">
            <div className="text-white/40 group-hover/sec:text-white transition-colors">
              {collapsedSections['status'] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </div>
            <h3 className="text-[10px] uppercase tracking-widest text-white/40 group-hover/sec:text-white/70 flex items-center gap-1.5 font-mono font-bold transition-colors">
              <Layers size={11} className="text-indigo-400" />
              <span>STATUS_CHANNELS</span>
            </h3>
          </div>
          {selectedStatuses.length > 0 && (
            <span className="text-[9px] font-mono text-indigo-300 px-1.5 py-0.2 bg-indigo-500/20 border border-indigo-500/30 rounded font-bold">
              {selectedStatuses.length}
            </span>
          )}
        </div>

        {!collapsedSections['status'] && (
          <div className="flex flex-col gap-0.5 animate-in fade-in duration-150">
            {STATUS_OPTIONS.map((st) => {
              const isSelected = selectedStatuses.includes(st.id);
              return (
                <button
                  key={st.id}
                  onClick={() => toggleStatus(st.id)}
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded transition-all text-[11px]",
                    isSelected 
                      ? "bg-white/10 text-white font-bold" 
                      : "text-white/40 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                    <span className="capitalize">{st.label}</span>
                  </div>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* FORMAT TAXONOMY */}
      <div>
        <div 
          onClick={() => toggleSection('format')}
          className="flex items-center justify-between mb-2.5 cursor-pointer group/sec select-none"
        >
          <div className="flex items-center gap-1.5">
            <div className="text-white/40 group-hover/sec:text-white transition-colors">
              {collapsedSections['format'] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </div>
            <h3 className="text-[10px] uppercase tracking-widest text-white/40 group-hover/sec:text-white/70 flex items-center gap-1.5 font-mono font-bold transition-colors">
              <Type size={11} className="text-indigo-400" />
              <span>FORMAT_TAXONOMY</span>
            </h3>
          </div>
          {selectedTypes.length > 0 && (
            <span className="text-[9px] font-mono text-indigo-300 px-1.5 py-0.2 bg-indigo-500/20 border border-indigo-500/30 rounded font-bold">
              {selectedTypes.length}
            </span>
          )}
        </div>

        {!collapsedSections['format'] && (
          <div className="flex flex-col gap-0.5 animate-in fade-in duration-150">
            {CONTENT_TYPES.map((type) => {
              const isSelected = selectedTypes.includes(type.id);
              const count = typeCounts[type.id] || 0;
              return (
                <button
                  key={type.id}
                  id={`format-filter-${type.id.replace(/\s+/g, '-')}`}
                  onClick={() => toggleType(type.id)}
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded transition-all text-[11px]",
                    isSelected 
                      ? "bg-white/10 text-white font-bold" 
                      : "text-white/40 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <type.icon size={12} className={cn(isSelected ? "text-indigo-400" : "opacity-40")} />
                    <span>{type.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pb-0.5">
                    <span className="text-[9px] font-mono opacity-50 px-1 py-0.2 bg-white/5 rounded">
                      {count}
                    </span>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {locationsToDisplay.length > 0 && (
        <div>
          <div 
            onClick={() => toggleSection('locations')}
            className="flex items-center justify-between mb-2.5 cursor-pointer group/sec select-none"
          >
            <div className="flex items-center gap-1.5">
              <div className="text-white/40 group-hover/sec:text-white transition-colors">
                {collapsedSections['locations'] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </div>
              <h3 className="text-[10px] uppercase tracking-widest text-white/40 group-hover/sec:text-white/70 flex items-center gap-1.5 font-mono font-bold transition-colors">
                <MapPin size={11} className="text-indigo-400" />
                <span>LOCATION_PLATFORMS</span>
              </h3>
              <span className="text-[9px] font-mono text-white/30 px-1 py-0.2 bg-white/5 rounded">
                {locationsToDisplay.length}
              </span>
            </div>
            {selectedLocations.length > 0 && (
              <span className="text-[9px] font-mono text-indigo-300 px-1.5 py-0.2 bg-indigo-500/20 border border-indigo-500/30 rounded font-bold">
                {selectedLocations.length}
              </span>
            )}
          </div>

          {!collapsedSections['locations'] && (
            <div className="flex flex-col gap-0.5 animate-in fade-in duration-150">
              {locationsToDisplay.map((loc) => {
                const isSelected = selectedLocations.includes(loc);
                const count = locationCounts[loc] || 0;
                return (
                  <button
                    key={loc}
                    onClick={() => toggleLocation(loc)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded transition-all text-[11px]",
                      isSelected 
                        ? "bg-white/10 text-white font-bold" 
                        : "text-white/40 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin size={11} className={cn(isSelected ? "text-indigo-400" : "opacity-40")} />
                      <span className="capitalize">{loc}</span>
                    </div>
                    <div className="flex items-center gap-1.5 pb-0.5">
                      <span className="text-[9px] font-mono opacity-50 px-1 py-0.2 bg-white/5 rounded">
                        {count}
                      </span>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUPERTAG_TAXONOMY SUMMARY */}
      <div className="mt-auto">
        <div className="bg-[#0A0A0C] rounded p-2.5 border border-indigo-500/10 transition-colors">
          <div 
            onClick={() => toggleSection('summary')}
            className="flex items-center justify-between cursor-pointer group/sec select-none"
          >
            <div className="flex items-center gap-1.5">
              <div className="text-white/40 group-hover/sec:text-white transition-colors">
                {collapsedSections['summary'] ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              </div>
              <p className="text-[9px] uppercase font-bold tracking-tighter text-indigo-400 font-mono">SUPERTAG_TAXONOMY</p>
            </div>
          </div>
          {!collapsedSections['summary'] && (
            <div className="flex flex-col gap-1 text-[9px] font-mono text-white/40 mt-2 pt-2 border-t border-white/5 animate-in fade-in duration-150">
              <div className="flex justify-between">
                <span>SUPERTAGS:</span>
                <span className="text-white/60">{supertags.length} folders</span>
              </div>
              <div className="flex justify-between">
                <span>CLUSTERED_TAGS:</span>
                <span className="text-white/60">{allTags.length - standaloneTags.length} / {allTags.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>

    <NormalizeTagsModal
      isOpen={isNormalizeOpen}
      onClose={() => setIsNormalizeOpen(false)}
      items={items}
      allTags={allTags}
      tagCounts={tagCounts}
      supertags={supertags}
      userId={userId}
    />

    <RenameTagModal
      isOpen={!!renamingTag}
      onClose={() => setRenamingTag(null)}
      tagToRename={renamingTag}
      items={items}
      supertags={supertags}
      userId={userId}
      tagScores={tagScores}
    />

    <RenameSupertagModal
      isOpen={!!renamingSupertag}
      onClose={() => setRenamingSupertag(null)}
      supertag={renamingSupertag}
      items={items}
    />

    {/* Delete Supertag Confirmation Modal */}
    <AnimatePresence>
      {confirmDeleteSupertag && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmDeleteSupertag(null)}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-[#141416] w-full max-w-sm rounded-lg border border-red-500/30 overflow-hidden relative z-10 shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-white/10 bg-red-950/20 flex items-center gap-2.5">
              <div className="p-1.5 bg-red-500/20 text-red-400 rounded">
                <Trash2 size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                  DELETE_SUPERTAG_FOLDER
                </h3>
                <p className="text-[10px] text-white/50 font-mono">
                  Folder: <span className="text-white font-bold">{confirmDeleteSupertag.name}</span>
                </p>
              </div>
            </div>

            <div className="p-4 text-[11px] font-mono text-white/70 space-y-2">
              <p>
                Are you sure you want to delete the folder <span className="text-white font-bold font-mono">"{confirmDeleteSupertag.name}"</span>?
              </p>
              <p className="text-[10px] text-white/40">
                • Content items tagged with these tags will <strong className="text-white">NOT</strong> be deleted.
                <br />
                • Only the folder grouping will be removed.
              </p>
            </div>

            <div className="p-3 bg-black/40 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSupertag(null)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-[10px] font-mono uppercase font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteSupertag}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all cursor-pointer active:scale-95"
              >
                <Trash2 size={12} />
                <span>Delete Folder</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}
