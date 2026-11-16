import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Folder, Edit2, X, Check, Loader2, Palette, Hash, Layers } from 'lucide-react';
import { Supertag, ContentItem } from '../types';
import { supertagService } from '../lib/supertagService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface RenameSupertagModalProps {
  isOpen: boolean;
  onClose: () => void;
  supertag: Supertag | null;
  items?: ContentItem[];
  onRenamed?: (supertagId: string, newName: string) => void;
}

const PRESET_COLORS = [
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Fuchsia', value: '#D946EF' },
  { name: 'Slate', value: '#64748B' },
];

export default function RenameSupertagModal({
  isOpen,
  onClose,
  supertag,
  items = [],
  onRenamed
}: RenameSupertagModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen && supertag) {
      setName(supertag.name || '');
      setColor(supertag.color || '#6366F1');
      setDescription(supertag.description || '');
    }
  }, [isOpen, supertag]);

  if (!isOpen || !supertag) return null;

  const childTags = supertag.tags || [];

  // Count items matching this supertag cluster
  const matchingItemCount = items.filter(item => {
    if (item.archived) return false;
    if (!item.tags || item.tags.length === 0) return false;
    const tagSet = new Set(childTags.map(t => t.toLowerCase().trim()));
    tagSet.add(supertag.name.toLowerCase().trim());
    return item.tags.some(t => tagSet.has(t.toLowerCase().trim()));
  }).length;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Supertag cluster name cannot be empty');
      return;
    }

    const hasChanges = 
      cleanName !== supertag.name || 
      color !== (supertag.color || '#6366F1') || 
      description.trim() !== (supertag.description || '');

    if (!hasChanges) {
      onClose();
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading(`Updating cluster "${supertag.name}"...`);

    try {
      await supertagService.update(supertag.id, {
        name: cleanName,
        color: color || '#6366F1',
        description: description.trim()
      });

      toast.dismiss(toastId);
      toast.success(`Renamed supertag cluster to "${cleanName}"`);
      if (onRenamed) {
        onRenamed(supertag.id, cleanName);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error('Failed to rename cluster: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
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
          className="bg-[#141416] w-full max-w-md rounded-lg border border-white/10 overflow-hidden relative z-10 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1A1A1D]">
            <div className="flex items-center gap-2.5">
              <div 
                className="p-1.5 rounded text-white flex items-center justify-center shadow-sm"
                style={{ backgroundColor: `${color}33`, borderColor: color, borderWidth: 1 }}
              >
                <Folder size={15} style={{ color }} />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-1.5">
                  RENAME_SUPERTAG_CLUSTER
                </h3>
                <p className="text-[10px] text-white/40 font-mono">
                  Current: <span className="text-white/80 font-bold">{supertag.name}</span>
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

          {/* Form */}
          <form onSubmit={handleSave} className="p-4 space-y-4">
            {/* Name Input */}
            <div>
              <label className="text-[10px] uppercase font-bold text-white/60 tracking-widest font-mono block mb-1.5">
                Cluster Name
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 🤖 AI & Machine Learning, 📚 Books..."
                  className="w-full bg-black/60 border border-indigo-500/40 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-400 font-bold"
                  autoFocus
                />
              </div>
            </div>

            {/* Color Swatches */}
            <div>
              <label className="text-[10px] uppercase font-bold text-white/60 tracking-widest font-mono block mb-1.5 flex items-center gap-1.5">
                <Palette size={11} className="text-white/40" />
                <span>Cluster Color Accent</span>
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(c => {
                  const isSelected = color.toLowerCase() === c.value.toLowerCase();
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      className={cn(
                        "size-6 rounded-full transition-all cursor-pointer flex items-center justify-center border",
                        isSelected ? "scale-110 border-white shadow-md" : "border-transparent opacity-70 hover:opacity-100 hover:scale-105"
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    >
                      {isSelected && <Check size={11} className="text-white stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description (Optional) */}
            <div>
              <label className="text-[10px] uppercase font-bold text-white/60 tracking-widest font-mono block mb-1.5">
                Description <span className="text-white/30 lowercase">(optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary or topic focus..."
                className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white/90 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            {/* Cluster Stats Info */}
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded space-y-1 text-[10px] font-mono text-white/50">
              <div className="flex justify-between">
                <span>Member tags in cluster:</span>
                <span className="text-white font-bold">{childTags.length} tags</span>
              </div>
              <div className="flex justify-between">
                <span>Content items grouped:</span>
                <span className="text-indigo-300 font-bold">{matchingItemCount} items</span>
              </div>
              {childTags.length > 0 && (
                <div className="pt-1 border-t border-white/5 flex flex-wrap gap-1 mt-1">
                  {childTags.slice(0, 8).map(t => (
                    <span key={t} className="px-1.5 py-0.2 bg-white/5 rounded text-[9px] text-white/60">
                      #{t}
                    </span>
                  ))}
                  {childTags.length > 8 && (
                    <span className="text-[9px] text-white/30 py-0.2">
                      +{childTags.length - 8} more
                    </span>
                  )}
                </div>
              )}
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
                disabled={isProcessing || !name.trim()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer active:scale-95"
              >
                {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                <span>Save Cluster</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
