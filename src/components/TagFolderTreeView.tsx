import React, { useState, useMemo } from 'react';
import { 
  Folder, FolderOpen, Tag, ChevronRight, ChevronDown, 
  CheckSquare, Square, Search, FolderPlus, Edit2, 
  MoreHorizontal, Plus, ChevronsDown, ChevronsUp, X,
  Sparkles, Layers, RefreshCw, FolderSync
} from 'lucide-react';
import { cn } from '../lib/utils';
import { FolderTreeNode, filterTreeBySearch } from '../lib/folderTreeUtils';
import { Supertag } from '../types';
import { supertagService } from '../lib/supertagService';
import { toast } from 'sonner';

interface TagFolderTreeViewProps {
  treeNodes: FolderTreeNode[];
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  supertags: Supertag[];
  userId: string;
  onRenameTag?: (tag: string) => void;
  expandedIds?: Set<string>;
  setExpandedIds?: React.Dispatch<React.SetStateAction<Set<string>>>;
}

interface TreeNodeItemProps {
  node: FolderTreeNode;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  onToggleNodeFilter: (node: FolderTreeNode, e?: React.MouseEvent) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string, e?: React.MouseEvent) => void;
  supertags: Supertag[];
  userId: string;
  onRenameTag?: (tag: string) => void;
  depth?: number;
}

function TreeNodeItem({
  node,
  selectedTags,
  setSelectedTags,
  onToggleNodeFilter,
  expandedIds,
  onToggleExpand,
  supertags,
  userId,
  onRenameTag,
  depth = 0
}: TreeNodeItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReplicating, setIsReplicating] = useState(false);
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;

  // Determine selection status: all selected, some selected, none selected
  const nodeAllTags = useMemo(() => {
    const raw = node.tags.length > 0 ? node.tags : (node.nodeTag ? [node.nodeTag] : []);
    return raw.map(t => t.trim().toLowerCase()).filter(Boolean);
  }, [node.tags, node.nodeTag]);

  const selectedTagsLower = useMemo(() => {
    return selectedTags.map(t => t.trim().toLowerCase()).filter(Boolean);
  }, [selectedTags]);

  const selectedCount = nodeAllTags.filter(t => selectedTagsLower.includes(t)).length;
  const isAllSelected = nodeAllTags.length > 0 && selectedCount === nodeAllTags.length;
  const isSomeSelected = selectedCount > 0 && !isAllSelected;

  const handleReplicateNodeToSupertag = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReplicating(true);
    try {
      const res = await supertagService.replicateSingleNodeToSupertag(userId, node, supertags);
      toast.success(
        `Replicated "${res.supertagName}" into Supertags (${res.subClustersCount} sub-clusters, ${res.tagsCount} tags)`,
        { duration: 4000 }
      );
      setIsMenuOpen(false);
    } catch (err: any) {
      toast.error('Failed to replicate folder to Supertags: ' + err.message);
    } finally {
      setIsReplicating(false);
    }
  };

  return (
    <div className="flex flex-col select-none">
      {/* Node Row */}
      <div 
        onClick={(e) => {
          if (hasChildren) {
            onToggleExpand(node.id, e);
          } else {
            onToggleNodeFilter(node, e);
          }
        }}
        className={cn(
          "group/node flex items-center justify-between py-1 px-1.5 rounded transition-all cursor-pointer text-[11px] font-mono",
          isAllSelected 
            ? "bg-indigo-500/20 text-indigo-300 font-bold" 
            : isSomeSelected 
            ? "bg-indigo-500/10 text-indigo-200" 
            : "text-white/70 hover:bg-white/[0.04] hover:text-white"
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Expand/Collapse Chevron */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id, e);
              }}
              className="p-0.5 text-white/40 hover:text-white transition-colors cursor-pointer shrink-0"
              title={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? (
                <ChevronDown size={12} className="text-indigo-400" />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
          ) : (
            <div className="w-3.5 shrink-0" />
          )}

          {/* Node Icon */}
          <span className="shrink-0 text-white/40 group-hover/node:text-indigo-400 transition-colors">
            {node.isFolder ? (
              isExpanded ? (
                <FolderOpen size={12} className="text-indigo-400" />
              ) : (
                <Folder size={12} className="text-indigo-400/80" />
              )
            ) : (
              <Tag size={11} className="text-white/40" />
            )}
          </span>

          {/* Node Name */}
          <span 
            className="truncate text-[10.5px] leading-tight flex-1" 
            title={node.pathKey}
          >
            {node.name}
          </span>
        </div>

        {/* Right Actions / Metrics */}
        <div className="flex items-center gap-1 shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          {/* Item Count */}
          <span 
            className="text-[8.5px] text-white/40 px-1 py-0.2 bg-white/5 rounded font-mono"
            title={`${node.itemCount} matching items`}
          >
            {node.itemCount}
          </span>

          {/* Filter Checkbox */}
          <button
            type="button"
            onClick={(e) => onToggleNodeFilter(node, e)}
            className={cn(
              "p-0.5 rounded transition-all cursor-pointer",
              isAllSelected
                ? "bg-indigo-600 text-white"
                : isSomeSelected
                ? "bg-indigo-500/30 text-indigo-300 border border-indigo-500/40"
                : "text-white/30 hover:text-white hover:bg-white/10"
            )}
            title={isAllSelected ? "Deselect folder filter" : "Filter items in this folder"}
          >
            {isAllSelected ? (
              <CheckSquare size={10} />
            ) : isSomeSelected ? (
              <div className="size-2 bg-indigo-400 rounded-[1px] m-0.5" />
            ) : (
              <Square size={10} />
            )}
          </button>

          {/* Context menu toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="opacity-0 group-hover/node:opacity-100 p-0.5 text-white/30 hover:text-white transition-all cursor-pointer rounded"
              title="Folder options"
            >
              <MoreHorizontal size={10} />
            </button>

            {isMenuOpen && (
              <div 
                className="absolute right-0 top-full mt-1 z-40 bg-[#1A1A1D] border border-white/15 rounded p-1 shadow-2xl space-y-1 min-w-52 text-[10px] font-mono animate-in fade-in duration-100"
                onClick={e => e.stopPropagation()}
              >
                {node.isFolder && (
                  <button
                    type="button"
                    onClick={handleReplicateNodeToSupertag}
                    disabled={isReplicating}
                    className="w-full px-2 py-1 text-left text-amber-300 hover:bg-amber-500/20 rounded flex items-center gap-1.5 cursor-pointer font-bold"
                  >
                    <Sparkles size={11} className="text-amber-400" />
                    <span>Replicate into Supertag & Sub-clusters</span>
                  </button>
                )}

                {node.nodeTag && onRenameTag && (
                  <button
                    type="button"
                    onClick={() => {
                      onRenameTag(node.nodeTag!);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-2 py-1 text-left text-indigo-300 hover:bg-indigo-500/20 rounded flex items-center gap-1.5 cursor-pointer font-bold"
                  >
                    <Edit2 size={11} />
                    <span>Edit #{node.nodeTag}...</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    // Filter only this node
                    e.stopPropagation();
                    setSelectedTags(nodeAllTags);
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-2 py-1 text-left text-white/70 hover:text-white hover:bg-white/10 rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Tag size={11} />
                  <span>Filter Only This Branch</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recursive Children with Tree Guideline */}
      {hasChildren && isExpanded && (
        <div className="ml-2.5 pl-2 border-l border-white/10 flex flex-col gap-0.5 mt-0.5">
          {node.children.map(child => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedTags={selectedTags}
              setSelectedTags={setSelectedTags}
              onToggleNodeFilter={onToggleNodeFilter}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              supertags={supertags}
              userId={userId}
              onRenameTag={onRenameTag}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TagFolderTreeView({
  treeNodes,
  selectedTags,
  setSelectedTags,
  supertags,
  userId,
  onRenameTag,
  expandedIds: controlledExpandedIds,
  setExpandedIds: controlledSetExpandedIds
}: TagFolderTreeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [localExpandedIds, setLocalExpandedIds] = useState<Set<string>>(new Set());
  const [isReplicatingAll, setIsReplicatingAll] = useState(false);

  const expandedIds = controlledExpandedIds ?? localExpandedIds;
  const setExpandedIds = controlledSetExpandedIds ?? setLocalExpandedIds;

  const filteredTree = useMemo(() => {
    return filterTreeBySearch(treeNodes, searchQuery);
  }, [treeNodes, searchQuery]);

  const handleToggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const all = new Set<string>();
    function collect(nodes: FolderTreeNode[]) {
      nodes.forEach(n => {
        all.add(n.id);
        if (n.children) collect(n.children);
      });
    }
    collect(treeNodes);
    setExpandedIds(all);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleToggleNodeFilter = (node: FolderTreeNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nodeTags = (node.tags.length > 0 ? node.tags : (node.nodeTag ? [node.nodeTag] : []))
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
    if (nodeTags.length === 0) return;

    const lowerSelected = selectedTags.map(t => t.trim().toLowerCase());
    const allSelected = nodeTags.every(t => lowerSelected.includes(t));

    if (allSelected) {
      // Remove these tags from selectedTags
      const toRemove = new Set(nodeTags);
      setSelectedTags(selectedTags.filter(t => !toRemove.has(t.trim().toLowerCase())));
    } else {
      // Add these tags to selectedTags
      const combined = Array.from(new Set([...selectedTags, ...nodeTags]));
      setSelectedTags(combined);
    }
  };

  const handleReplicateAllToSupertags = async () => {
    if (treeNodes.length === 0) return;
    setIsReplicatingAll(true);
    try {
      const res = await supertagService.replicateNestedTreeToSupertags(userId, treeNodes, supertags);
      toast.success(
        `Replicated nested folders to Supertags: ${res.createdCount} created, ${res.updatedCount} updated, ${res.subClustersCreatedCount + res.subClustersUpdatedCount} sub-clusters organized!`,
        { duration: 5000 }
      );
    } catch (err: any) {
      toast.error('Failed to replicate folders: ' + err.message);
    } finally {
      setIsReplicatingAll(false);
    }
  };

  return (
    <div className="space-y-2 flex flex-col">
      {/* Tree controls bar */}
      <div className="flex items-center justify-between gap-1.5">
        {/* Search inside folder tree */}
        <div className="relative flex-1">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Search folders..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded pl-6 pr-5 py-1 text-[10px] font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Quick actions: Replicate all to Supertags + Expand/Collapse */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleReplicateAllToSupertags}
            disabled={isReplicatingAll || treeNodes.length === 0}
            className="px-1.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer"
            title="Replicate all nested folders into Supertags & Sub-Clusters"
          >
            <Sparkles size={10} className={cn("text-amber-400", isReplicatingAll && "animate-spin")} />
            <span className="hidden sm:inline">SYNC ALL</span>
          </button>
          <button
            type="button"
            onClick={handleExpandAll}
            className="p-1 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded text-[9px] font-mono transition-colors"
            title="Expand All Folders"
          >
            <ChevronsDown size={11} />
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="p-1 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded text-[9px] font-mono transition-colors"
            title="Collapse All Folders"
          >
            <ChevronsUp size={11} />
          </button>
        </div>
      </div>

      {/* Tree list container */}
      <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-1 py-1">
        {filteredTree.length > 0 ? (
          filteredTree.map(node => (
            <TreeNodeItem
              key={node.id}
              node={node}
              selectedTags={selectedTags}
              setSelectedTags={setSelectedTags}
              onToggleNodeFilter={handleToggleNodeFilter}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              supertags={supertags}
              userId={userId}
              onRenameTag={onRenameTag}
            />
          ))
        ) : (
          <p className="text-[10px] text-white/20 italic font-mono p-2 text-center">
            {searchQuery ? 'No matching folder tags' : 'No folder tags found'}
          </p>
        )}
      </div>
    </div>
  );
}

