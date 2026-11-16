import { useState, useEffect } from 'react';
import { X, Save, Tag as TagIcon, Star, FileText, Loader2, Archive, Trash2, CheckCircle2, User, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../lib/firebase';
import { cn, OperationType, handleFirestoreError } from '../lib/utils';
import { contentService } from '../lib/contentService';
import { ContentItem } from '../types';
import { toast } from 'sonner';
import { getLocationsForType } from '../lib/locationMapping';

interface BulkEditModalProps {
  selectedIds: string[];
  items: ContentItem[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function BulkEditModal({ selectedIds, items, isOpen, onClose, onComplete }: BulkEditModalProps) {
  // Enabled overrides
  const [applyType, setApplyType] = useState(false);
  const [applyStatus, setApplyStatus] = useState(false);
  const [applyRelevance, setApplyRelevance] = useState(false);
  const [applyAliveness, setApplyAliveness] = useState(false);
  const [applyProgress, setApplyProgress] = useState(false);
  const [applyAuthor, setApplyAuthor] = useState(false);
  const [applySource, setApplySource] = useState(false);
  const [applyLocation, setApplyLocation] = useState(false);
  const [applyTags, setApplyTags] = useState(false);
  const [applyPrice, setApplyPrice] = useState(false);
  const [applyLength, setApplyLength] = useState(false);

  // Values
  const [contentType, setContentType] = useState<ContentItem['type']>('other');
  const [status, setStatus] = useState('');
  const [relevanceScore, setRelevanceScore] = useState(50);
  const [alivenessScore, setAlivenessScore] = useState(50);
  const [price, setPrice] = useState('');
  const [length, setLength] = useState('');
  const [progress, setProgress] = useState(0);
  const [author, setAuthor] = useState('');
  const [source, setSource] = useState('');
  const [location, setLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [isCustomLocation, setIsCustomLocation] = useState(false);
  const [tags, setTags] = useState('');
  const [tagMode, setTagMode] = useState<'add' | 'replace'>('add');

  const [isSaving, setIsSaving] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setApplyType(false);
      setApplyStatus(false);
      setApplyRelevance(false);
      setApplyAliveness(false);
      setApplyProgress(false);
      setApplyAuthor(false);
      setApplySource(false);
      setApplyLocation(false);
      setApplyTags(false);
      setApplyPrice(false);
      setApplyLength(false);

      setContentType('other');
      setStatus('');
      setRelevanceScore(50);
      setAlivenessScore(50);
      setPrice('');
      setLength('');
      setProgress(0);
      setAuthor('');
      setSource('');
      setLocation('');
      setCustomLocation('');
      setIsCustomLocation(false);
      setTags('');
      setTagMode('add');
    }
  }, [isOpen]);

  const handleTypeChange = (newType: ContentItem['type']) => {
    setContentType(newType);
    setApplyType(true); // Auto-check apply
    const locs = getLocationsForType(newType);
    if (locs.length > 0) {
      setLocation(locs[0]);
      setIsCustomLocation(false);
    } else {
      setLocation('');
      setIsCustomLocation(true);
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser || selectedIds.length === 0) return;
    setIsSaving(true);
    const toastId = toast.loading(`Updating ${selectedIds.length} items...`);

    try {
      // Build base modifications
      const baseChanges: Partial<ContentItem> = {};

      if (applyType) {
        baseChanges.type = contentType;
      }
      if (applyStatus) {
        baseChanges.status = (status === '' ? null : status) as ContentItem['status'];
      }
      if (applyRelevance) {
        baseChanges.relevanceScore = relevanceScore;
      }
      if (applyAliveness) {
        baseChanges.alivenessScore = alivenessScore;
      }
      if (applyProgress) {
        baseChanges.progress = progress;
      }
      if (applyAuthor) {
        baseChanges.author = author || null;
      }
      if (applySource) {
        baseChanges.source = source || null;
      }
      if (applyLocation) {
        baseChanges.location = isCustomLocation ? customLocation : location || null;
      }
      if (applyPrice) {
        baseChanges.price = price;
      }
      if (applyLength) {
        baseChanges.length = length;
      }

      const inputTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');

      // Apply modifications to all selected documents
      for (const id of selectedIds) {
        const itemChanges = { ...baseChanges };

        if (applyTags) {
          if (tagMode === 'replace') {
            itemChanges.tags = inputTags;
          } else {
            // Append with union logic
            const currentItem = items.find(i => i.id === id);
            const currentTags = currentItem?.tags || [];
            itemChanges.tags = Array.from(new Set([...currentTags, ...inputTags]));
          }
        }

        await contentService.update(id, itemChanges);
      }

      toast.dismiss(toastId);
      toast.success(`Successfully configured ${selectedIds.length} nodes!`);
      onComplete();
      onClose();
    } catch (error) {
      console.error(error);
      toast.dismiss(toastId);
      toast.error('Bulk edit failed: ' + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-[#161618] w-full max-w-xl rounded border border-white/10 overflow-hidden relative z-10 shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0 bg-[#1C1C1E]">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#D946EF]">BULK_EDIT_NODES</h3>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-mono px-2 py-0.5 rounded">
                  {selectedIds.length} SELECTED
                </span>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              <p className="text-[10px] text-white/40 font-mono uppercase leading-relaxed tracking-wider bg-white/5 p-3 rounded">
                Check the field's apply checkbox on the left to overwrite it across all selected items. Unchecked fields will be left untouched.
              </p>

              {/* Format Select */}
              <div className={cn("p-3 rounded border transition-all", applyType ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="bulk-apply-type" 
                    checked={applyType} 
                    onChange={(e) => setApplyType(e.target.checked)}
                    className="size-3.5 accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex-1 space-y-2">
                    <label htmlFor="bulk-apply-type" className="text-[10px] uppercase font-bold text-white/60 tracking-widest select-none cursor-pointer">
                      Node Format (Type)
                    </label>
                    <select 
                      value={contentType}
                      onChange={(e) => handleTypeChange(e.target.value as ContentItem['type'])}
                      disabled={!applyType}
                      className="w-full bg-[#1c1c1e] border border-white/10 text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                    >
                      <option value="course">Course</option>
                      <option value="book">Book</option>
                      <option value="audiobook">Audiobook</option>
                      <option value="paper">Paper</option>
                      <option value="highlights">Highlights</option>
                      <option value="notes">Notes</option>
                      <option value="website">Website</option>
                      <option value="page">Page</option>
                      <option value="article">Article</option>
                      <option value="podcast">Podcast</option>
                      <option value="video">Video</option>
                      <option value="pdf">PDF</option>
                      <option value="social post">Social Post</option>
                      <option value="social profile">Social Profile</option>
                      <option value="screenshot">Screenshot</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Status Select */}
              <div className={cn("p-3 rounded border transition-all", applyStatus ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="bulk-apply-status" 
                    checked={applyStatus} 
                    onChange={(e) => setApplyStatus(e.target.checked)}
                    className="size-3.5 accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex-1 space-y-2">
                    <label htmlFor="bulk-apply-status" className="text-[10px] uppercase font-bold text-white/60 tracking-widest select-none cursor-pointer">
                      Workflow Status
                    </label>
                    <select 
                      value={status}
                      onChange={(e) => { setStatus(e.target.value); setApplyStatus(true); }}
                      disabled={!applyStatus}
                      className="w-full bg-[#1c1c1e] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                    >
                      <option value="">Unassigned / Select Status</option>
                      <option value="to be purchased">To Be Purchased</option>
                      <option value="someday maybe">Someday Maybe</option>
                      <option value="inbox">Inbox</option>
                      <option value="ready">Ready</option>
                      <option value="soon">Soon</option>
                      <option value="active">Active</option>
                      <option value="passive">Passive</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="on hold">On Hold</option>
                      <option value="done">Done</option>
                      <option value="reviewing">Reviewing</option>
                      <option value="reference">Reference</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Location Select */}
              <div className={cn("p-3 rounded border transition-all", applyLocation ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="bulk-apply-location" 
                    checked={applyLocation} 
                    onChange={(e) => setApplyLocation(e.target.checked)}
                    className="size-3.5 accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex-1 space-y-2">
                    <label htmlFor="bulk-apply-location" className="text-[10px] uppercase font-bold text-white/60 tracking-widest flex items-center gap-1 select-none cursor-pointer">
                      <MapPin size={12} /> Location / Platform
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <select
                        value={isCustomLocation ? 'custom' : location}
                        onChange={(e) => {
                          setApplyLocation(true);
                          if (e.target.value === 'custom') {
                            setIsCustomLocation(true);
                          } else {
                            setIsCustomLocation(false);
                            setLocation(e.target.value);
                          }
                        }}
                        disabled={!applyLocation}
                        className="w-full bg-[#1c1c1e] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      >
                        {getLocationsForType(applyType ? contentType : 'other').map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                        <option value="custom">Custom Location / Platform...</option>
                      </select>

                      {isCustomLocation && applyLocation && (
                        <input
                          type="text"
                          placeholder="Enter custom location/platform..."
                          value={customLocation}
                          onChange={(e) => setCustomLocation(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Author */}
                <div className={cn("p-3 rounded border transition-all", applyAuthor ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="bulk-apply-author" 
                      checked={applyAuthor} 
                      onChange={(e) => setApplyAuthor(e.target.checked)}
                      className="size-3.5 accent-indigo-500 cursor-pointer animate-none"
                    />
                    <div className="flex-1 space-y-2">
                      <label htmlFor="bulk-apply-author" className="text-[10px] uppercase font-bold text-white/60 tracking-widest flex items-center gap-1 select-none cursor-pointer">
                        <User size={12} /> Author / Creator
                      </label>
                      <input 
                        type="text" 
                        value={author}
                        onChange={(e) => { setAuthor(e.target.value); setApplyAuthor(true); }}
                        disabled={!applyAuthor}
                        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Source */}
                <div className={cn("p-3 rounded border transition-all", applySource ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="bulk-apply-source" 
                      checked={applySource} 
                      onChange={(e) => setApplySource(e.target.checked)}
                      className="size-3.5 accent-indigo-500 cursor-pointer animate-none"
                    />
                    <div className="flex-1 space-y-2">
                      <label htmlFor="bulk-apply-source" className="text-[10px] uppercase font-bold text-white/60 tracking-widest select-none cursor-pointer">
                        Source Node
                      </label>
                      <input 
                        type="text" 
                        value={source}
                        onChange={(e) => { setSource(e.target.value); setApplySource(true); }}
                        disabled={!applySource}
                        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {/* Price */}
                <div className={cn("p-3 rounded border transition-all", applyPrice ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="bulk-apply-price" 
                      checked={applyPrice} 
                      onChange={(e) => setApplyPrice(e.target.checked)}
                      className="size-3.5 accent-indigo-500 cursor-pointer animate-none"
                    />
                    <div className="flex-1 space-y-2">
                      <label htmlFor="bulk-apply-price" className="text-[10px] uppercase font-bold text-white/60 tracking-widest select-none cursor-pointer">
                        Price
                      </label>
                      <input 
                        type="text" 
                        value={price}
                        placeholder="e.g., $15, free"
                        onChange={(e) => { setPrice(e.target.value); setApplyPrice(true); }}
                        disabled={!applyPrice}
                        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Length */}
                <div className={cn("p-3 rounded border transition-all", applyLength ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="bulk-apply-length" 
                      checked={applyLength} 
                      onChange={(e) => setApplyLength(e.target.checked)}
                      className="size-3.5 accent-indigo-500 cursor-pointer animate-none"
                    />
                    <div className="flex-1 space-y-2">
                      <label htmlFor="bulk-apply-length" className="text-[10px] uppercase font-bold text-white/60 tracking-widest select-none cursor-pointer">
                        Length
                      </label>
                      <input 
                        type="text" 
                        value={length}
                        placeholder="e.g., 350 pages, 12 hrs"
                        onChange={(e) => { setLength(e.target.value); setApplyLength(true); }}
                        disabled={!applyLength}
                        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Relevance & Aliveness Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Relevance */}
                <div className={cn("p-3 rounded border transition-all", applyRelevance ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="bulk-apply-relevance" 
                      checked={applyRelevance} 
                      onChange={(e) => setApplyRelevance(e.target.checked)}
                      className="size-3.5 accent-indigo-500 cursor-pointer mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <label htmlFor="bulk-apply-relevance" className="text-[10px] uppercase font-bold text-white/60 tracking-widest flex items-center gap-1 select-none cursor-pointer">
                        <Star size={11} /> Relevance Rating
                      </label>
                      <input 
                        type="range" 
                        min="0" max="100" step="1"
                        value={relevanceScore}
                        onChange={(e) => { setRelevanceScore(parseInt(e.target.value)); setApplyRelevance(true); }}
                        disabled={!applyRelevance}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 mt-2 disabled:opacity-50"
                      />
                      <div className="flex justify-between text-[8px] text-white/30 font-mono">
                        <span>0%</span>
                        <span className="text-indigo-400 font-bold">{relevanceScore}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Aliveness */}
                <div className={cn("p-3 rounded border transition-all", applyAliveness ? "bg-rose-500/5 border-rose-500/20" : "bg-white/2 border-white/5 opacity-60")}>
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="bulk-apply-aliveness" 
                      checked={applyAliveness} 
                      onChange={(e) => setApplyAliveness(e.target.checked)}
                      className="size-3.5 accent-rose-500 cursor-pointer mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <label htmlFor="bulk-apply-aliveness" className="text-[10px] uppercase font-bold text-white/60 tracking-widest flex items-center gap-1 select-none cursor-pointer">
                        Aliveness Rating
                      </label>
                      <input 
                        type="range" 
                        min="0" max="100" step="1"
                        value={alivenessScore}
                        onChange={(e) => { setAlivenessScore(parseInt(e.target.value)); setApplyAliveness(true); }}
                        disabled={!applyAliveness}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-rose-500 mt-2 disabled:opacity-50"
                      />
                      <div className="flex justify-between text-[8px] text-white/30 font-mono">
                        <span>0%</span>
                        <span className="text-rose-400 font-bold">{alivenessScore}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Slider */}
              <div className={cn("p-3 rounded border transition-all", applyProgress ? "bg-[#10B981]/5 border-[#10B981]/25" : "bg-white/2 border-white/5 opacity-60")}>
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="bulk-apply-progress" 
                    checked={applyProgress} 
                    onChange={(e) => setApplyProgress(e.target.checked)}
                    className="size-3.5 accent-emerald-500 cursor-pointer mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <label htmlFor="bulk-apply-progress" className="text-[10px] uppercase font-bold text-white/60 tracking-widest flex items-center gap-1 select-none cursor-pointer">
                      <CheckCircle2 size={11} /> Completion Percentage
                    </label>
                    <input 
                      type="range" 
                      min="0" max="100" step="1"
                      value={progress}
                      onChange={(e) => { setProgress(parseInt(e.target.value)); setApplyProgress(true); }}
                      disabled={!applyProgress}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500 mt-2 disabled:opacity-50"
                    />
                    <div className="flex justify-between text-[8px] text-white/30 font-mono">
                      <span>0%</span>
                      <span className="text-emerald-400 font-bold">{progress}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Taxonomy Tags */}
              <div className={cn("p-3 rounded border transition-all", applyTags ? "bg-indigo-500/5 border-indigo-500/30" : "bg-white/2 border-white/5 opacity-60")}>
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="bulk-apply-tags" 
                    checked={applyTags} 
                    onChange={(e) => setApplyTags(e.target.checked)}
                    className="size-3.5 accent-indigo-500 cursor-pointer mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <label htmlFor="bulk-apply-tags" className="text-[10px] uppercase font-bold text-white/60 tracking-widest flex items-center gap-1 select-none cursor-pointer">
                      <TagIcon size={12} /> Taxonomy Clusters (Tags)
                    </label>
                    
                    <div className="flex items-center gap-4 bg-black/20 p-1.5 border border-white/5 rounded text-[10px] font-mono mb-2">
                      <span className="text-white/40 uppercase text-[9px] font-bold">MODE:</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input 
                          type="radio" 
                          name="tag-mode" 
                          value="add" 
                          checked={tagMode === 'add'} 
                          onChange={() => { setTagMode('add'); setApplyTags(true); }}
                          className="accent-indigo-500"
                        />
                        <span>APPEND_NEW</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input 
                          type="radio" 
                          name="tag-mode" 
                          value="replace" 
                          checked={tagMode === 'replace'} 
                          onChange={() => { setTagMode('replace'); setApplyTags(true); }}
                          className="accent-indigo-500"
                        />
                        <span>REPLACE_ALL</span>
                      </label>
                    </div>

                    <input 
                      type="text" 
                      placeholder="tag1, tag2..."
                      value={tags}
                      onChange={(e) => { setTags(e.target.value); setApplyTags(true); }}
                      disabled={!applyTags}
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

            </div>

            <div className="p-4 border-t border-white/5 bg-[#1C1C1E] shrink-0 flex gap-3">
              <button 
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/5 py-2.5 rounded text-[11px] font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50"
              >
                CANCEL
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || selectedIds.length === 0 || (!applyType && !applyStatus && !applyRelevance && !applyAliveness && !applyProgress && !applyAuthor && !applySource && !applyLocation && !applyTags && !applyPrice && !applyLength)}
                className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded text-[11px] font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                COMMIT_BULK_CHANGES
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
