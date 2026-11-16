import { useState, useEffect, useRef } from 'react';
import { 
  X, Save, Tag as TagIcon, Star, FileText, Loader2, Archive, Trash2, 
  CheckCircle2, RefreshCw, User, Sparkles, MapPin, Image as ImageIcon, 
  Upload, ExternalLink, Copy, Check, Calendar, Clock, LayoutGrid, EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../lib/firebase';
import { cn, OperationType, handleFirestoreError } from '../lib/utils';
import { contentService } from '../lib/contentService';
import { ContentItem } from '../types';
import { toast } from 'sonner';
import { getLocationsForType } from '../lib/locationMapping';
import { formatItemDateTime } from '../lib/itemUtils';

interface EditContentModalProps {
  item: ContentItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditContentModal({ item, isOpen, onClose }: EditContentModalProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [tags, setTags] = useState('');
  const [relevanceScore, setRelevanceScore] = useState(50);
  const [alivenessScore, setAlivenessScore] = useState(50);
  const [price, setPrice] = useState('');
  const [length, setLength] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState('');
  const [contentType, setContentType] = useState<ContentItem['type']>('other');
  const [imageUrl, setImageUrl] = useState('');
  const [onCanvas, setOnCanvas] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRescraping, setIsRescraping] = useState(false);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [location, setLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [isCustomLocation, setIsCustomLocation] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setUrl(item.url || '');
      setTitle(item.title || '');
      setDescription(item.description || '');
      setAuthor(item.author || '');
      setTags(item.tags?.join(', ') || '');
      setRelevanceScore(item.relevanceScore ?? 50);
      setAlivenessScore(item.alivenessScore ?? 50);
      setPrice(item.price || '');
      setLength(item.length || '');
      setSource(item.source || '');
      setStatus(item.status || '');
      setProgress(item.progress || 0);
      setNotes(item.notes || '');
      setContentType(item.type || 'other');
      setImageUrl(item.imageUrl || '');
      setOnCanvas(item.onCanvas !== false && !!item.canvasPosition);

      const loc = item.location || '';
      const allowedLocs = getLocationsForType(item.type || 'other');
      if (loc && !allowedLocs.includes(loc)) {
        setIsCustomLocation(true);
        setCustomLocation(loc);
        setLocation('');
      } else {
        setIsCustomLocation(false);
        setCustomLocation('');
        setLocation(loc || (allowedLocs[0] || ''));
      }
    }
  }, [item]);

  const handleTypeChange = (newType: ContentItem['type']) => {
    setContentType(newType);
    const locs = getLocationsForType(newType);
    if (locs.length > 0) {
      setLocation(locs[0]);
      setIsCustomLocation(false);
    } else {
      setLocation('');
      setIsCustomLocation(true);
    }
  };

  const handleCopyUrl = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 800;
        const maxHeight = 600;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          setImageUrl(compressedBase64);
          toast.success('Local image uploaded and optimized!');
        } else {
          if (typeof event.target?.result === 'string') {
            setImageUrl(event.target.result);
            toast.success('Local image uploaded!');
          }
        }
      };
      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRescrape = async () => {
    const targetUrl = url.trim() || item?.url;
    if (!targetUrl) {
      toast.error('Please specify a valid URL to scrape');
      return;
    }
    setIsRescraping(true);
    try {
      const response = await fetch('/api/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!response.ok) throw new Error('Scraper failed to run');
      const data = await response.json();
      
      setTitle(data.title || title);
      setDescription(data.description || description);
      if (data.author) setAuthor(data.author);
      setNotes(data.description ? `Originally scraped text:\n${data.description}\n\n${notes}` : notes);
      if (data.image) setImageUrl(data.image);
      
      if (item) {
        await contentService.update(item.id, {
          url: targetUrl,
          title: data.title || title,
          description: data.description || item.description || '',
          imageUrl: data.image || item.imageUrl || '',
          siteName: data.siteName || item.siteName || null,
          author: data.author || item.author || null,
        });
      }

      toast.success('Successfully re-scraped URL metadata!');
    } catch (error) {
      console.error(error);
      toast.error('Re-scraping failed: ' + (error as Error).message);
    } finally {
      setIsRescraping(false);
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser || !item) return;
    setIsSaving(true);
    const tagArray = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
    try {
      const updates: any = {
        url: url.trim(),
        title: title.trim(),
        description: description.trim(),
        author: author.trim() || null,
        type: contentType,
        tags: tagArray,
        relevanceScore,
        alivenessScore,
        price: price.trim() || '',
        length: length.trim() || '',
        source: source.trim() || null,
        location: isCustomLocation ? customLocation.trim() : location.trim() || null,
        status: status as ContentItem['status'],
        progress,
        notes,
        imageUrl: imageUrl.trim(),
        onCanvas: onCanvas,
      };

      // If user toggled canvas placement
      if (onCanvas && (!item.canvasPosition || item.onCanvas === false)) {
        updates.canvasPosition = item.canvasPosition || { x: 100, y: 100 };
      } else if (!onCanvas) {
        updates.canvasPosition = null;
      }

      await contentService.update(item.id, updates);
      toast.success('Saved changes successfully');
      onClose();
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.UPDATE, `contentItems/${item.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoTag = async () => {
    if (!title && !url) return;
    setIsAutoTagging(true);
    try {
      const res = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ title, description, url }] })
      });
      const data = await res.json();
      if (data.tags && data.tags[0]) {
        const generated: string[] = data.tags[0];
        const existing = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
        const combined = Array.from(new Set([...existing, ...generated]));
        setTags(combined.join(', '));
        toast.success("AI generated tags successfully!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Auto tagging failed");
    } finally {
      setIsAutoTagging(false);
    }
  };

  const handleArchive = async () => {
    if (!auth.currentUser || !item) return;
    setIsArchiving(true);
    const tagArray = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
    try {
      await contentService.archive(item.id, tagArray);
      toast.success('Archived item successfully');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to archive: ' + (error as Error).message);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (!auth.currentUser || !item) return;
    setIsDeleting(true);
    try {
      await contentService.delete(item.id);
      toast.success('Deleted item successfully');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete: ' + (error as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && item && (
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
            className="bg-[#161618] w-full max-w-2xl rounded border border-white/10 overflow-hidden relative z-10 shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0 bg-[#1C1C1E]">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">EDIT_NODE</h3>
                <span className="text-[10px] font-mono text-white/20">{item.id.slice(0,8)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                  title="Delete node permanently"
                >
                  <Trash2 size={16} />
                </button>
                <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Timestamps & Canvas Placement Bar */}
            <div className="px-6 py-2.5 bg-black/40 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-white/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5" title="Created date/time">
                  <Calendar size={11} className="text-indigo-400" />
                  <span>CREATED:</span>
                  <span className="text-white/80 font-bold">{formatItemDateTime(item.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5" title="Last updated date/time">
                  <Clock size={11} className="text-emerald-400" />
                  <span>UPDATED:</span>
                  <span className="text-white/80 font-bold">{formatItemDateTime(item.updatedAt)}</span>
                </div>
              </div>

              {/* Canvas placement status toggle */}
              <button
                type="button"
                onClick={() => setOnCanvas(!onCanvas)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                  onCanvas 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20" 
                    : "bg-white/5 border-white/10 text-white/40 hover:text-white"
                )}
                title={onCanvas ? "Node is currently placed on Infinite Canvas. Click to unplace." : "Node is Index-only. Click to place onto Infinite Canvas."}
              >
                {onCanvas ? <LayoutGrid size={10} className="text-indigo-400" /> : <EyeOff size={10} />}
                <span>{onCanvas ? "ON_CANVAS" : "INDEX_ONLY"}</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              
              {/* Target Resource URL (Prominently visible & editable) */}
              <div className="space-y-2 p-3.5 bg-indigo-950/20 border border-indigo-500/20 rounded-md">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold text-indigo-300 tracking-widest flex items-center gap-1.5">
                    <ExternalLink size={11} className="text-indigo-400" /> Target Resource URL
                  </label>
                  <div className="flex items-center gap-2">
                    {url && (
                      <>
                        <button
                          type="button"
                          onClick={handleCopyUrl}
                          className="flex items-center gap-1 text-[9px] uppercase font-mono font-bold text-white/50 hover:text-white transition-colors"
                          title="Copy URL"
                        >
                          {copiedUrl ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          <span>{copiedUrl ? "COPIED" : "COPY"}</span>
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[9px] uppercase font-mono font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                          title="Open URL in new tab"
                        >
                          <ExternalLink size={10} />
                          <span>VISIT_LINK</span>
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="url" 
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-black/40 border border-indigo-500/30 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={handleRescrape}
                    disabled={isRescraping || !url}
                    className="shrink-0 flex items-center gap-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 px-3 py-2 rounded text-[10px] uppercase font-bold font-mono transition-all disabled:opacity-40 cursor-pointer"
                    title="Fetch and sync title, description, and preview image from URL"
                  >
                    {isRescraping ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    <span>AUTO_SCRAPE</span>
                  </button>
                </div>
              </div>

              {/* Resource Title */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Resource Title</label>
                </div>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 font-medium"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Social Preview Description</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 resize-none"
                />
              </div>

              {/* Image Preview & Config */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Preview Image Settings</label>
                  {imageUrl && (
                    <button 
                      type="button" 
                      onClick={() => setImageUrl('')}
                      className="text-red-400 hover:text-red-300 transition-colors uppercase font-mono text-[9px] tracking-wider"
                    >
                      [REMOVE_IMAGE]
                    </button>
                  )}
                </div>
                <div className="flex gap-4 p-4 bg-white/[0.02] border border-white/5 rounded">
                  <div className="w-20 h-20 bg-[#0A0A0C] border border-white/10 rounded overflow-hidden shrink-0 flex items-center justify-center relative bg-cover bg-center">
                    {imageUrl ? (
                      <img 
                        src={imageUrl} 
                        alt="Preview" 
                        className="w-full h-full object-cover opacity-80" 
                        referrerPolicy="no-referrer" 
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-white/20 gap-1">
                        <ImageIcon size={18} />
                        <span className="text-[9px] font-mono">[NULL]</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider block">Image Source URL</span>
                      <input 
                        type="text" 
                        placeholder="https://example.com/image.png" 
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 font-mono"
                      />
                    </div>
                    <div>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden" 
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-indigo-400 hover:text-indigo-300 transition-all font-mono border border-indigo-500/10 hover:border-indigo-500/35 bg-indigo-500/5 px-2.5 py-1.5 rounded"
                      >
                        <Upload size={10} />
                        UPLOAD_LOCAL_IMAGE
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Author & Source */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                    <User size={12} /> Author / Creator
                  </label>
                  <input 
                    type="text" 
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Source / Related To</label>
                  <input 
                    type="text" 
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              {/* Price & Length */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Price</label>
                  <input 
                    type="text" 
                    placeholder="e.g., $15, free, $49/mo"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Length</label>
                  <input 
                    type="text" 
                    placeholder="e.g., 350 pages, 12 hrs, 45m"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 font-mono"
                  />
                </div>
              </div>

              {/* Status & Location */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Status</label>
                  <select 
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-[#1c1c1e] border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
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

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                    <MapPin size={12} /> Location / Platform
                  </label>
                  <select
                    value={isCustomLocation ? 'custom' : location}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomLocation(true);
                      } else {
                        setIsCustomLocation(false);
                        setLocation(e.target.value);
                      }
                    }}
                    className="w-full bg-[#1c1c1e] border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                  >
                    {getLocationsForType(contentType).map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                    <option value="custom">Custom Location / Platform...</option>
                  </select>
                </div>
              </div>

              {isCustomLocation && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Custom Location Name</label>
                  <input
                    type="text"
                    placeholder="Enter custom location/platform..."
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              )}

              {/* Relevance & Aliveness */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                        <Star size={12} /> Relevance (0-100)
                    </label>
                    <input 
                        type="range" 
                        min="0" max="100" step="1"
                        value={relevanceScore}
                        onChange={(e) => setRelevanceScore(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 mt-4"
                    />
                    <div className="flex justify-between text-[9px] text-white/30 font-mono">
                        <span>0</span>
                        <span className="text-indigo-400 font-bold">{relevanceScore}%</span>
                        <span>100</span>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> Aliveness (0-100)
                    </label>
                    <input 
                        type="range" 
                        min="0" max="100" step="1"
                        value={alivenessScore}
                        onChange={(e) => setAlivenessScore(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-rose-500 mt-4"
                    />
                    <div className="flex justify-between text-[9px] text-white/30 font-mono">
                        <span>0</span>
                        <span className="text-rose-400 font-bold">{alivenessScore}%</span>
                        <span>100</span>
                    </div>
                </div>
              </div>

              {/* Completion Progress */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                        <CheckCircle2 size={12} /> Completion %
                    </label>
                    <input 
                        type="range" 
                        min="0" max="100" step="1"
                        value={progress}
                        onChange={(e) => setProgress(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500 mt-4"
                    />
                    <div className="flex justify-between text-[9px] text-white/30 font-mono">
                        <span>0</span>
                        <span className="text-emerald-400 font-bold">{progress}%</span>
                        <span>100</span>
                    </div>
                </div>
              </div>

              {/* Node Format & Taxonomy Tags */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Node Format</label>
                    <select 
                        value={contentType}
                        onChange={(e) => handleTypeChange(e.target.value as ContentItem['type'])}
                        className="w-full bg-[#1c1c1e] border border-white/10 text-white text-xs rounded px-3 py-2.5 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
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
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                          <TagIcon size={12} /> Taxonomy Cluster
                      </label>
                      <button
                        onClick={handleAutoTag}
                        disabled={isAutoTagging}
                        className="flex items-center gap-1 text-[9px] font-bold uppercase text-indigo-400 hover:text-indigo-300 disabled:opacity-55 transition-colors font-mono cursor-pointer"
                      >
                        {isAutoTagging ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Sparkles size={10} />
                        )}
                        AUTO_TAG
                      </button>
                    </div>
                    <input 
                        type="text" 
                        placeholder="tag1, tag2..."
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                    />
                </div>
              </div>

              {/* Metadata Notes */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                    <FileText size={12} /> Metadata Narrative (.md)
                </label>
                <textarea 
                    placeholder="Capture insights, syntheses..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={6}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 resize-none font-mono"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-white/5 bg-[#1C1C1E] shrink-0 flex gap-3">
              <button 
                onClick={handleArchive}
                disabled={isArchiving || isSaving}
                className="flex-1 border border-white/5 bg-white/5 text-white/60 py-2.5 rounded text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isArchiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                ARCHIVE_NODE
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || isArchiving}
                className="flex-[2] bg-indigo-600 text-white py-2.5 rounded text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-indigo-500 transition-all disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10 cursor-pointer"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                COMMIT_CHANGES
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
