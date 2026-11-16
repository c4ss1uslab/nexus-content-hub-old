import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag, Edit3, X, Check, Loader2, Star, Flame, Sparkles, RefreshCw, Layers, FolderPlus, FolderCheck } from 'lucide-react';
import { ContentItem, Supertag, TagScore, TagScoreMap } from '../types';
import { contentService } from '../lib/contentService';
import { tagService } from '../lib/tagService';
import { supertagService } from '../lib/supertagService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export interface EditTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagToEdit: string | null;
  items: ContentItem[];
  supertags: Supertag[];
  userId: string;
  tagScores?: TagScoreMap;
  onUpdated?: (oldTag: string, newTag: string, scores?: { relevanceScore?: number | null; alivenessScore?: number | null }) => void;
}

export default function EditTagModal({
  isOpen,
  onClose,
  tagToEdit,
  items,
  supertags,
  userId,
  tagScores = {},
  onUpdated
}: EditTagModalProps) {
  const [newTagName, setNewTagName] = useState('');
  const [relevanceScore, setRelevanceScore] = useState<number | null>(null);
  const [hasRelevanceScore, setHasRelevanceScore] = useState(false);
  const [alivenessScore, setAlivenessScore] = useState<number | null>(null);
  const [hasAlivenessScore, setHasAlivenessScore] = useState(false);
  const [applyInheritanceToItems, setApplyInheritanceToItems] = useState(true);
  const [overrideManualScores, setOverrideManualScores] = useState(false);
  const [selectedSupertagIds, setSelectedSupertagIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen && tagToEdit) {
      const clean = tagToEdit.trim().toLowerCase().replace(/^#+/, '');
      setNewTagName(clean);

      // Initialize supertags containing this tag
      const containingSupertagIds = supertags
        .filter(st => supertagService.getAllSupertagTags(st).includes(clean))
        .map(st => st.id);
      setSelectedSupertagIds(containingSupertagIds);

      const existingScore = tagScores[clean];
      if (existingScore) {
        if (typeof existingScore.relevanceScore === 'number') {
          setRelevanceScore(existingScore.relevanceScore);
          setHasRelevanceScore(true);
        } else {
          setRelevanceScore(50);
          setHasRelevanceScore(false);
        }

        if (typeof existingScore.alivenessScore === 'number') {
          setAlivenessScore(existingScore.alivenessScore);
          setHasAlivenessScore(true);
        } else {
          setAlivenessScore(50);
          setHasAlivenessScore(false);
        }
      } else {
        setRelevanceScore(50);
        setHasRelevanceScore(false);
        setAlivenessScore(50);
        setHasAlivenessScore(false);
      }

      setApplyInheritanceToItems(true);
      setOverrideManualScores(false);
    }
  }, [isOpen, tagToEdit, tagScores, supertags]);

  const cleanOld = (tagToEdit || '').trim().toLowerCase().replace(/^#+/, '');
  const cleanNew = newTagName.trim().toLowerCase().replace(/^#+/, '');

  // Item counts & manual score metrics (Hooks must be called unconditionally)
  const affectedItems = useMemo(() => {
    if (!cleanOld) return [];
    return items.filter(item => 
      !item.archived && item.tags && item.tags.some(t => t.toLowerCase().trim() === cleanOld)
    );
  }, [items, cleanOld]);

  const itemsWithManualScores = useMemo(() => {
    return affectedItems.filter(item => item.manualRelevanceScore || item.manualAlivenessScore).length;
  }, [affectedItems]);

  const itemsToInherit = overrideManualScores 
    ? affectedItems.length 
    : affectedItems.length - itemsWithManualScores;

  const toggleSupertag = (stId: string) => {
    setSelectedSupertagIds(prev => 
      prev.includes(stId) ? prev.filter(id => id !== stId) : [...prev, stId]
    );
  };

  const handleSelectAllSupertags = () => {
    setSelectedSupertagIds(supertags.map(st => st.id));
  };

  const handleClearAllSupertags = () => {
    setSelectedSupertagIds([]);
  };

  if (!isOpen || !tagToEdit) return null;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cleanNew) {
      toast.error('Tag name cannot be empty');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading(`Saving changes for #${cleanOld}...`);

    try {
      let finalTag = cleanOld;
      let renameResult = { updatedItemsCount: 0, updatedSupertagsCount: 0 };

      // 1. If tag name changed, perform rename across items and supertags
      if (cleanNew !== cleanOld) {
        renameResult = await contentService.renameTag(cleanOld, cleanNew, items, supertags, userId);
        finalTag = cleanNew;
      }

      // 2. Update multi-supertag assignments
      await supertagService.setTagSupertags(finalTag, selectedSupertagIds, supertags);

      // 3. Update tag score metadata
      const targetRelScore = hasRelevanceScore ? relevanceScore : null;
      const targetAliScore = hasAlivenessScore ? alivenessScore : null;

      await tagService.saveTagScore(userId, finalTag, {
        relevanceScore: targetRelScore,
        alivenessScore: targetAliScore
      });

      // If renamed, clean up old tag score
      if (cleanNew !== cleanOld) {
        await tagService.removeTagScore(userId, cleanOld);
      }

      // 4. Propagate score inheritance to items if enabled
      let inheritedCount = 0;
      if (applyInheritanceToItems && (targetRelScore !== null || targetAliScore !== null)) {
        const nextScoreMap: TagScoreMap = {
          ...tagScores,
          [finalTag]: {
            relevanceScore: targetRelScore,
            alivenessScore: targetAliScore
          }
        };
        const syncRes = await tagService.syncItemsScoreInheritance(
          [finalTag],
          nextScoreMap,
          items,
          overrideManualScores
        );
        inheritedCount = syncRes.updatedCount;
      }

      toast.dismiss(toastId);

      const msgParts = [];
      if (cleanNew !== cleanOld) {
        msgParts.push(`Renamed to #${cleanNew}`);
      }
      if (selectedSupertagIds.length > 0) {
        msgParts.push(`Assigned to ${selectedSupertagIds.length} supertag${selectedSupertagIds.length === 1 ? '' : 's'}`);
      } else {
        msgParts.push(`Standalone (no supertags)`);
      }
      if (hasRelevanceScore || hasAlivenessScore) {
        msgParts.push(`Scores set (Rel: ${hasRelevanceScore ? `${relevanceScore}%` : '—'}, Ali: ${hasAlivenessScore ? `${alivenessScore}%` : '—'})`);
      }
      if (inheritedCount > 0) {
        msgParts.push(`${inheritedCount} items updated`);
      }

      toast.success(msgParts.join(' • '));

      if (onUpdated) {
        onUpdated(cleanOld, finalTag, {
          relevanceScore: targetRelScore,
          alivenessScore: targetAliScore
        });
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error('Failed to update tag: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isProcessing && onClose()}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          className="bg-[#141416] w-full max-w-lg rounded-lg border border-white/10 overflow-hidden relative z-10 shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1A1A1D] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded text-indigo-400">
                <Edit3 size={15} />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-1.5">
                  EDIT_TAG: <span className="text-indigo-400">#{cleanOld}</span>
                </h3>
                <p className="text-[10px] text-white/40 font-mono mt-0.5">
                  Manage tag name, supertag folder assignments, and metrics
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="text-white/40 hover:text-white transition-colors cursor-pointer p-1 rounded hover:bg-white/5"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSave} className="p-4 overflow-y-auto custom-scrollbar space-y-4 text-xs font-sans">
            {/* Tag Name / Rename */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-white/60 tracking-widest font-mono flex items-center justify-between">
                <span>Tag Name</span>
                {cleanNew !== cleanOld && (
                  <span className="text-amber-400 text-[9px] font-mono">RENAMING</span>
                )}
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-white/40 font-mono text-sm">#</span>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="tag-name..."
                  className="w-full bg-black/60 border border-white/10 focus:border-indigo-500 rounded pl-7 pr-3 py-2 text-xs font-mono text-white focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Supertag Folder Assignments (Many-to-Many) */}
            <div className="p-3 bg-black/30 border border-white/5 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderPlus size={13} className="text-indigo-400" />
                  <span className="text-[10px] uppercase font-bold font-mono text-white/80 tracking-wider">
                    Supertag Folders ({selectedSupertagIds.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {supertags.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={handleSelectAllSupertags}
                        className="text-[9px] font-mono text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                      >
                        All
                      </button>
                      <span className="text-white/20">·</span>
                      <button
                        type="button"
                        onClick={handleClearAllSupertags}
                        className="text-[9px] font-mono text-rose-400/80 hover:text-rose-300 underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  <span className={cn(
                    "text-[10px] font-mono font-bold px-2 py-0.5 rounded border",
                    selectedSupertagIds.length > 0
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      : "bg-white/5 text-white/30 border-white/10"
                  )}>
                    {selectedSupertagIds.length > 0 ? `${selectedSupertagIds.length} FOLDERS` : 'STANDALONE'}
                  </span>
                </div>
              </div>

              <p className="text-[10px] font-mono text-white/40">
                Assign this tag to one or more supertags. Tags can belong to multiple folders simultaneously.
              </p>

              {supertags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {supertags.map(st => {
                    const isAssigned = selectedSupertagIds.includes(st.id);
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => toggleSupertag(st.id)}
                        className={cn(
                          "px-2.5 py-1 rounded text-[10px] font-mono border transition-all flex items-center gap-1.5 cursor-pointer select-none",
                          isAssigned
                            ? "bg-indigo-600/30 border-indigo-500 text-white font-bold shadow-sm"
                            : "bg-white/5 border-white/10 text-white/60 hover:border-white/20 hover:text-white"
                        )}
                      >
                        <div 
                          className="size-2 rounded-full shrink-0" 
                          style={{ backgroundColor: st.color || '#6366F1' }} 
                        />
                        <span>{st.name}</span>
                        {isAssigned ? (
                          <Check size={11} className="text-indigo-300 ml-0.5" />
                        ) : (
                          <span className="text-[9px] text-white/20 ml-0.5">+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] font-mono text-white/30 italic">
                  No supertag folders created yet. Create one from the sidebar to group tags.
                </p>
              )}
            </div>

            {/* Tag Relevance Score */}
            <div className="p-3 bg-black/30 border border-white/5 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star size={13} className="text-indigo-400" />
                  <span className="text-[10px] uppercase font-bold font-mono text-white/80 tracking-wider">
                    Tag Relevance Score
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasRelevanceScore ? (
                    <button
                      type="button"
                      onClick={() => setHasRelevanceScore(false)}
                      className="text-[9px] font-mono text-rose-400/80 hover:text-rose-300 underline cursor-pointer"
                    >
                      Clear score
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setHasRelevanceScore(true);
                        if (relevanceScore === null) setRelevanceScore(50);
                      }}
                      className="text-[9px] font-mono text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      + Assign score
                    </button>
                  )}
                  <span className={cn(
                    "text-[10px] font-mono font-bold px-2 py-0.5 rounded border",
                    hasRelevanceScore 
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" 
                      : "bg-white/5 text-white/30 border-white/10"
                  )}>
                    {hasRelevanceScore ? `${relevanceScore}%` : 'UNSET'}
                  </span>
                </div>
              </div>

              {hasRelevanceScore ? (
                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={relevanceScore ?? 50}
                      onChange={(e) => setRelevanceScore(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={relevanceScore ?? 50}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setRelevanceScore(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                      }}
                      className="w-14 bg-black/60 border border-white/10 rounded px-1.5 py-1 text-center text-[10px] font-mono text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Preset chips */}
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className="text-white/30 mr-1">Presets:</span>
                    {[0, 25, 50, 75, 90, 100].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRelevanceScore(val)}
                        className={cn(
                          "px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
                          relevanceScore === val 
                            ? "bg-indigo-600 text-white border-indigo-500" 
                            : "bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white"
                        )}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] font-mono text-white/30 italic">
                  Items with this tag will retain neutral relevance (50%) unless configured.
                </p>
              )}
            </div>

            {/* Tag Aliveness Score */}
            <div className="p-3 bg-black/30 border border-white/5 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame size={13} className="text-rose-400" />
                  <span className="text-[10px] uppercase font-bold font-mono text-white/80 tracking-wider">
                    Tag Aliveness Score
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasAlivenessScore ? (
                    <button
                      type="button"
                      onClick={() => setHasAlivenessScore(false)}
                      className="text-[9px] font-mono text-rose-400/80 hover:text-rose-300 underline cursor-pointer"
                    >
                      Clear score
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setHasAlivenessScore(true);
                        if (alivenessScore === null) setAlivenessScore(50);
                      }}
                      className="text-[9px] font-mono text-rose-400 hover:text-rose-300 underline cursor-pointer"
                    >
                      + Assign score
                    </button>
                  )}
                  <span className={cn(
                    "text-[10px] font-mono font-bold px-2 py-0.5 rounded border",
                    hasAlivenessScore 
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40" 
                      : "bg-white/5 text-white/30 border-white/10"
                  )}>
                    {hasAlivenessScore ? `${alivenessScore}%` : 'UNSET'}
                  </span>
                </div>
              </div>

              {hasAlivenessScore ? (
                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={alivenessScore ?? 50}
                      onChange={(e) => setAlivenessScore(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={alivenessScore ?? 50}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setAlivenessScore(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                      }}
                      className="w-14 bg-black/60 border border-white/10 rounded px-1.5 py-1 text-center text-[10px] font-mono text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  {/* Preset chips */}
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className="text-white/30 mr-1">Presets:</span>
                    {[0, 25, 50, 75, 90, 100].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAlivenessScore(val)}
                        className={cn(
                          "px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
                          alivenessScore === val 
                            ? "bg-rose-600 text-white border-rose-500" 
                            : "bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white"
                        )}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] font-mono text-white/30 italic">
                  Items with this tag will retain neutral aliveness (50%) unless configured.
                </p>
              )}
            </div>

            {/* Score Inheritance & Item Propagation Settings */}
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-white/60">Total items with #{cleanOld}:</span>
                <span className="text-white font-bold">{affectedItems.length}</span>
              </div>

              {itemsWithManualScores > 0 && (
                <div className="flex justify-between text-[10px] font-mono text-amber-300/80">
                  <span>Items with manually set scores:</span>
                  <span className="font-bold">{itemsWithManualScores}</span>
                </div>
              )}

              <div className="border-t border-white/5 pt-2.5 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={applyInheritanceToItems}
                    onChange={(e) => setApplyInheritanceToItems(e.target.checked)}
                    className="mt-0.5 rounded bg-black/60 border-white/20 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <div className="text-[10px] font-mono leading-tight">
                    <span className="text-white/90 font-bold group-hover:text-white transition-colors">
                      Apply scores to items ({itemsToInherit} items will inherit)
                    </span>
                    <p className="text-white/40 text-[9px] mt-0.5">
                      Items without manual scores inherit this tag's relevance & aliveness scores.
                    </p>
                  </div>
                </label>

                {itemsWithManualScores > 0 && applyInheritanceToItems && (
                  <label className="flex items-start gap-2 cursor-pointer group pl-4 border-l border-amber-500/20">
                    <input
                      type="checkbox"
                      checked={overrideManualScores}
                      onChange={(e) => setOverrideManualScores(e.target.checked)}
                      className="mt-0.5 rounded bg-black/60 border-amber-500/30 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <div className="text-[10px] font-mono leading-tight">
                      <span className="text-amber-300 font-bold group-hover:text-amber-200 transition-colors">
                        Force override manually assigned scores ({itemsWithManualScores} items)
                      </span>
                      <p className="text-white/40 text-[9px] mt-0.5">
                        Overwrites custom scores previously saved on individual items.
                      </p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded text-[10px] font-mono uppercase font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing || !cleanNew}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer active:scale-95"
              >
                {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
