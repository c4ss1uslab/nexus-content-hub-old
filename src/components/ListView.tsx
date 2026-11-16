import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ExternalLink, Trash2, Tag, Star, LayoutGrid, List as ListIcon, 
  FileText, Download, Archive, ArrowUpDown, AlignJustify, RefreshCw, 
  Loader2, Sparkles, FolderArchive, Calendar, Clock, MapPin, Eye, EyeOff, Plus, ChevronDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getSiteDisplayName, getCleanUrlDisplay, formatItemDate } from '../lib/itemUtils';
import EditContentModal from './EditContentModal';
import BulkEditModal from './BulkEditModal';
import { ContentItem } from '../types';
import { exportToMarkdown, exportAllToZip } from '../lib/exportUtils';
import { contentService } from '../lib/contentService';
import { itemMatchesTags } from '../lib/folderTreeUtils';
import { toast } from 'sonner';

interface ListViewProps {
  items: ContentItem[];
  searchQuery: string;
  selectedTags: string[];
  selectedTypes: string[];
  selectedStatuses?: string[];
  minRelevance?: number;
  minAliveness?: number;
  minProgress?: number;
}

export default function ListView({ 
  items,
  searchQuery, 
  selectedTags, 
  selectedTypes,
  selectedStatuses = [],
  minRelevance = 0,
  minAliveness = 0,
  minProgress = 0
}: ListViewProps) {
  const [layout, setLayout] = useState<'grid' | 'list' | 'compact'>('grid');
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [sortBy, setSortBy] = useState<string>('dateDesc');
  const [rescrapingItemIds, setRescrapingItemIds] = useState<Set<string>>(new Set());
  const [isBulkTagging, setIsBulkTagging] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);

  // Progressive rendering limit for handling 5000+ items with sub-second performance
  const [visibleLimit, setVisibleLimit] = useState(50);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Bulk Edit selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  // Reset pagination limit when active filters or search terms change
  useEffect(() => {
    setVisibleLimit(50);
  }, [searchQuery, selectedTags, selectedTypes, selectedStatuses, minRelevance, minAliveness, minProgress, sortBy]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // High performance memoized filtering
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const hasTags = selectedTags.length > 0;
    const hasTypes = selectedTypes.length > 0;
    const hasStatus = selectedStatuses.length > 0;

    return items.filter(item => {
      if (item.archived === true) return false;

      if (query) {
        const inTitle = item.title && item.title.toLowerCase().includes(query);
        const inUrl = item.url && item.url.toLowerCase().includes(query);
        const inDesc = item.description && item.description.toLowerCase().includes(query);
        const inNotes = item.notes && item.notes.toLowerCase().includes(query);
        const inTags = item.tags && item.tags.some(t => t.toLowerCase().includes(query));
        if (!inTitle && !inUrl && !inDesc && !inNotes && !inTags) return false;
      }

      if (hasTags) {
        if (!itemMatchesTags(item, selectedTags)) return false;
      }

      if (hasTypes) {
        if (!selectedTypes.includes(item.type)) return false;
      }

      if (hasStatus) {
        if (!item.status || !selectedStatuses.includes(item.status)) return false;
      }

      if ((item.relevanceScore ?? 50) < minRelevance) return false;
      if ((item.alivenessScore ?? 50) < minAliveness) return false;
      if ((item.progress ?? 0) < minProgress) return false;

      return true;
    });
  }, [items, searchQuery, selectedTags, selectedTypes, selectedStatuses, minRelevance, minAliveness, minProgress]);

  // High performance memoized sorting
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    if (sortBy === 'dateDesc') {
      return list.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });
    }
    if (sortBy === 'dateAsc') {
      return list.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeA - timeB;
      });
    }
    if (sortBy === 'updatedDesc') {
      return list.sort((a, b) => {
        const timeA = a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
        const timeB = b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
        return timeB - timeA;
      });
    }
    if (sortBy === 'relevanceDesc') {
      return list.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
    }
    if (sortBy === 'alivenessDesc') {
      return list.sort((a, b) => (b.alivenessScore ?? 0) - (a.alivenessScore ?? 0));
    }
    if (sortBy === 'titleAsc') {
      return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    return list;
  }, [filteredItems, sortBy]);

  // Progressive scroll observer to lazily expand the render list
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleLimit(prev => Math.min(prev + 50, sortedItems.length));
      }
    }, { rootMargin: '600px' });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [sortedItems.length]);

  const itemsToRender = useMemo(() => {
    return sortedItems.slice(0, visibleLimit);
  }, [sortedItems, visibleLimit]);

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(item => item.id)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const toastId = toast.loading(`Archiving ${selectedIds.size} nodes...`);
    try {
      for (const id of Array.from(selectedIds)) {
        const item = items.find(i => i.id === id);
        if (item) {
          await contentService.archive(id, item.tags || []);
        }
      }
      setSelectedIds(new Set());
      toast.dismiss(toastId);
      toast.success("Successfully archived selected nodes!");
    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error("Failed to archive some items");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) return;
    const toastId = toast.loading(`Deleting ${selectedIds.size} nodes...`);
    try {
      for (const id of Array.from(selectedIds)) {
        await contentService.delete(id);
      }
      setSelectedIds(new Set());
      toast.dismiss(toastId);
      toast.success("Successfully deleted selected nodes!");
    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error("Failed to delete some items");
    }
  };

  const handleExportAll = async () => {
    if (filteredItems.length === 0) {
      toast.error("No items to export");
      return;
    }
    setIsExportingAll(true);
    const toastId = toast.loading("Generating ZIP bundle of Markdown nodes...");
    try {
      await exportAllToZip(filteredItems);
      toast.dismiss(toastId);
      toast.success("Successfully bundled nodes into ZIP archive!");
    } catch (e) {
      console.error(e);
      toast.dismiss(toastId);
      toast.error("Failed to generate ZIP bundle");
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleAutoTagAll = async () => {
    if (filteredItems.length === 0) return;
    setIsBulkTagging(true);
    const toastId = toast.loading("AI is analyzing and tagging all filtered items...");
    
    try {
      const batchSize = 10;
      let totalUpdated = 0;
      
      for (let i = 0; i < filteredItems.length; i += batchSize) {
        const chunk = filteredItems.slice(i, i + batchSize);
        const res = await fetch('/api/generate-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk.map(item => ({ title: item.title, description: item.description })) })
        });
        const data = await res.json();
        
        if (data.tags && Array.isArray(data.tags)) {
          for (let j = 0; j < chunk.length; j++) {
            const item = chunk[j];
            const generatedTags = data.tags[j];
            if (generatedTags && Array.isArray(generatedTags)) {
              const existingTags = item.tags || [];
              const combinedTags = Array.from(new Set([...existingTags, ...generatedTags]));
              
              await contentService.update(item.id, {
                tags: combinedTags
              });
              totalUpdated++;
            }
          }
        }
      }
      
      toast.dismiss(toastId);
      toast.success(`AI bulk tagged ${totalUpdated} items successfully!`);
    } catch (e) {
      console.error(e);
      toast.dismiss(toastId);
      toast.error("Bulk auto-tagging failed");
    } finally {
      setIsBulkTagging(false);
    }
  };

  const handleToggleCanvasPlacement = async (item: ContentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlyOnCanvas = item.onCanvas !== false && !!item.canvasPosition;
    try {
      if (isCurrentlyOnCanvas) {
        await contentService.removeFromCanvas(item.id);
        toast.success(`Removed "${item.title}" from canvas`);
      } else {
        await contentService.placeOnCanvas(item.id, Math.random() * 400 + 100, Math.random() * 400 + 100);
        toast.success(`Placed "${item.title}" onto canvas`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update canvas placement");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await contentService.delete(id);
      toast.success('Deleted item successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete: ' + (error as Error).message);
    }
  };

  const handleArchive = async (item: ContentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await contentService.archive(item.id, item.tags || []);
      toast.success('Archived item successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to archive: ' + (error as Error).message);
    }
  };

  const handleExport = (item: ContentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    exportToMarkdown(item);
    toast.success('Exported to Markdown');
  };

  const handleItemRescrape = async (item: ContentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.url) return;
    
    setRescrapingItemIds(prev => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });

    try {
      const response = await fetch('/api/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url }),
      });
      if (!response.ok) throw new Error('Scraper failed to run');
      const data = await response.json();
      
      await contentService.update(item.id, {
        title: data.title || item.title || 'Scraped Resource Node',
        description: data.description || item.description || '',
        imageUrl: data.image || item.imageUrl || '',
        siteName: data.siteName || item.siteName || null,
      });

      toast.success(`Successfully re-scraped metadata for: "${data.title || item.title}"`);
    } catch (error) {
      console.error(error);
      toast.error('Re-scraping failed: ' + (error as Error).message);
    } finally {
      setRescrapingItemIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tighter text-white">CORE_INDEX_EXPLORER</h1>
          <p className="text-white/40 text-[10px] font-mono mt-1 uppercase font-semibold">
            Allocated nodes: {filteredItems.length} items · ({items.filter(i => !i.archived && i.onCanvas !== false && !!i.canvasPosition).length} on canvas · {items.filter(i => !i.archived && (i.onCanvas === false || !i.canvasPosition)).length} index-only)
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Select All Toggle */}
          {filteredItems.length > 0 && (
            <button
              onClick={handleSelectAll}
              className={cn(
                "flex items-center gap-1.5 border rounded px-2.5 py-1.5 text-[9px] font-bold font-mono uppercase tracking-widest cursor-pointer select-none",
                selectedIds.size === filteredItems.length
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-white/5 border-white/10 text-white/60 hover:border-white/20 hover:text-white"
              )}
              title="Select/deselect all active search items"
            >
              {selectedIds.size === filteredItems.length ? "DESELECT_ALL" : "SELECT_ALL"}
            </button>
          )}

          {/* AI Bulk Tag Control */}
          {filteredItems.length > 0 && (
            <button
              onClick={handleAutoTagAll}
              disabled={isBulkTagging}
              className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded px-2.5 py-1.5 text-[9px] font-bold font-mono text-indigo-300 uppercase tracking-widest cursor-pointer disabled:opacity-50 select-none"
              title="Tag all filtered items using Gemini AI based on context"
            >
              {isBulkTagging ? (
                <Loader2 size={11} className="animate-spin text-indigo-400" />
              ) : (
                <Sparkles size={11} className="text-indigo-400" />
              )}
              AI_TAG_ALL
            </button>
          )}

          {/* Export All as ZIP */}
          {filteredItems.length > 0 && (
            <button
              onClick={handleExportAll}
              disabled={isExportingAll}
              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded px-2.5 py-1.5 text-[9px] font-bold font-mono text-emerald-400 uppercase tracking-widest cursor-pointer disabled:opacity-50 select-none"
              title="Export all filtered nodes to a ZIP archive of Markdown documents"
            >
              {isExportingAll ? (
                <Loader2 size={11} className="animate-spin text-emerald-400" />
              ) : (
                <FolderArchive size={11} className="text-emerald-400" />
              )}
              ZIP_EXPORT_ALL
            </button>
          )}

          {/* Sort Controls */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-white select-none h-8">
            <ArrowUpDown size={11} className="text-white/40 mr-1.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-white outline-none cursor-pointer pr-1"
            >
              <option value="dateDesc" className="bg-[#161618]">Created Date (Newer)</option>
              <option value="dateAsc" className="bg-[#161618]">Created Date (Older)</option>
              <option value="updatedDesc" className="bg-[#161618]">Last Updated (Recent)</option>
              <option value="relevanceDesc" className="bg-[#161618]">Relevance (High)</option>
              <option value="alivenessDesc" className="bg-[#161618]">Aliveness (High)</option>
              <option value="titleAsc" className="bg-[#161618]">Title (A-Z)</option>
            </select>
          </div>

          {/* Grid/List/Compact Layout toggle */}
          <div className="flex bg-white/5 rounded border border-white/10 p-0.5">
            <button 
              onClick={() => setLayout('grid')}
              className={cn("p-1.5 rounded transition-all cursor-pointer", layout === 'grid' ? "bg-white/10 text-white" : "text-white/40 hover:text-white")}
              title="Grid Layout"
            >
              <LayoutGrid size={14} />
            </button>
            <button 
              onClick={() => setLayout('list')}
              className={cn("p-1.5 rounded transition-all cursor-pointer", layout === 'list' ? "bg-white/10 text-white" : "text-white/40 hover:text-white")}
              title="List Layout"
            >
              <ListIcon size={14} />
            </button>
            <button 
              onClick={() => setLayout('compact')}
              className={cn("p-1.5 rounded transition-all cursor-pointer", layout === 'compact' ? "bg-white/10 text-white" : "text-white/40 hover:text-white")}
              title="Compact Layout"
            >
              <AlignJustify size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Items Container */}
      <div className={cn(
        "grid transition-all pb-12",
        layout === 'compact' ? "grid-cols-1 gap-1.5" : "gap-4",
        layout === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "",
        layout === 'list' ? "grid-cols-1" : ""
      )}>
        {itemsToRender.map(item => {
          const isOnCanvas = item.onCanvas !== false && !!item.canvasPosition;

          // ================= COMPACT VIEW =================
          if (layout === 'compact') {
            return (
              <div
                key={item.id}
                onClick={() => setEditingItem(item)}
                className="group bg-[#161618] px-3 py-1.5 rounded border border-white/10 hover:border-indigo-500/40 transition-all flex items-center justify-between gap-3 cursor-pointer h-11 overflow-hidden select-none"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelection(item.id);
                    }}
                    className="size-3.5 accent-indigo-500 rounded border border-white/20 bg-black cursor-pointer shrink-0 z-10"
                  />

                  {/* Small Image */}
                  <div className="size-6 bg-[#0A0A0C] border border-white/10 rounded overflow-hidden shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-300" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/5">
                        <FileText size={10} />
                      </div>
                    )}
                  </div>

                  {/* Title & URL domain */}
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-bold text-[11px] text-white truncate max-w-[180px] sm:max-w-xs md:max-w-md">
                      {item.title}
                    </span>
                    {item.url && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-mono text-indigo-400/70 hover:text-indigo-300 truncate max-w-[140px] hidden md:inline-flex items-center gap-0.5"
                        title={item.url}
                      >
                        <ExternalLink size={9} />
                        <span>{getCleanUrlDisplay(item.url, 20)}</span>
                      </a>
                    )}
                  </div>

                  {/* Tags display in compact layout */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="hidden lg:flex items-center gap-1 shrink-0 max-w-[200px] overflow-hidden">
                      {item.tags.slice(0, 2).map((tag: string) => (
                        <span key={tag} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-white/60 truncate max-w-[90px]">
                          #{tag}
                        </span>
                      ))}
                      {item.tags.length > 2 && (
                        <span className="text-[8px] font-mono text-white/30">+{item.tags.length - 2}</span>
                      )}
                    </div>
                  )}

                  {/* Predefined metadata badges */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0 text-[9px] font-mono">
                    {/* Canvas indicator (ONLY show if on canvas - NO INDEX BADGE) */}
                    {isOnCanvas && (
                      <span className="text-[8px] font-mono px-1 rounded uppercase tracking-wider font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        CANVAS
                      </span>
                    )}
                    <span className="text-white/30 uppercase text-[8px] bg-white/5 border border-white/5 px-1 rounded">{item.type}</span>
                    {item.status && (
                      <span className={cn(
                        "font-bold uppercase px-1 rounded bg-white/5",
                        item.status === 'inbox' && "text-indigo-400",
                        item.status === 'to be purchased' && "text-pink-400",
                        item.status === 'someday maybe' && "text-slate-400",
                        item.status === 'ready' && "text-teal-400",
                        item.status === 'soon' && "text-amber-400",
                        item.status === 'active' && "text-emerald-400",
                        item.status === 'passive' && "text-blue-400",
                        item.status === 'ongoing' && "text-sky-400",
                        item.status === 'on hold' && "text-red-400",
                        item.status === 'done' && "text-purple-400",
                        item.status === 'reviewing' && "text-violet-400",
                        item.status === 'reference' && "text-neutral-400"
                      )}>
                        {item.status}
                      </span>
                    )}
                    <span className="text-indigo-400 font-bold bg-indigo-500/10 px-1 rounded">R_{item.relevanceScore ?? 50}%</span>
                    <span className="text-white/30 font-mono text-[8px]" title="Created date">
                      {formatItemDate(item.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Operations on hover */}
                <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button 
                    onClick={(e) => handleToggleCanvasPlacement(item, e)}
                    className={cn(
                      "p-1 rounded transition-all",
                      isOnCanvas ? "text-indigo-400 hover:text-white hover:bg-indigo-500/20" : "text-white/30 hover:text-indigo-300 hover:bg-white/5"
                    )}
                    title={isOnCanvas ? "Remove from Canvas" : "Place onto Canvas"}
                  >
                    {isOnCanvas ? <Eye size={11} /> : <Plus size={11} />}
                  </button>
                  <button 
                    onClick={(e) => handleItemRescrape(item, e)}
                    disabled={rescrapingItemIds.has(item.id)}
                    className="p-1 text-white/30 hover:text-indigo-400 hover:bg-white/5 rounded transition-all disabled:opacity-30"
                    title="Force Re-Scrape Metadata"
                  >
                    {rescrapingItemIds.has(item.id) ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <RefreshCw size={11} />
                    )}
                  </button>
                  <button 
                    onClick={(e) => handleExport(item, e)}
                    className="p-1 text-white/30 hover:text-white hover:bg-white/5 rounded transition-all"
                    title="Export markdown"
                  >
                    <Download size={11} />
                  </button>
                  {item.url && (
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-white/30 hover:text-indigo-400 hover:bg-white/5 rounded transition-all"
                      title="Open URL"
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                  <button 
                    onClick={(e) => handleArchive(item, e)}
                    className="p-1 text-white/20 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-all"
                    title="Archive Node"
                  >
                    <Archive size={11} />
                  </button>
                  <button 
                    onClick={(e) => handleDelete(item.id, e)}
                    className="p-1 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          }

          // ================= GRID / LIST VIEW =================
          return (
            <div
              key={item.id}
              onClick={() => setEditingItem(item)}
              className={cn(
                "group bg-[#161618] rounded border border-white/10 hover:border-indigo-500/40 transition-all flex flex-col overflow-hidden relative cursor-pointer select-none",
                layout === 'list' && "flex-row min-h-32"
              )}
            >
              {/* List Action: Checkbox Column */}
              {layout === 'list' && (
                <div className="flex items-center justify-center pl-4 pr-1 shrink-0 z-10" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    className="size-4 bg-black border border-white/25 rounded accent-indigo-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Image Section */}
              <div className={cn(
                "bg-[#0A0A0C] overflow-hidden relative shrink-0 border-white/5",
                layout === 'grid' ? "aspect-[2/1] w-full border-b" : "w-44 min-h-full border-r"
              )}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-300" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/5">
                    <FileText size={24} strokeWidth={1} />
                  </div>
                )}
                
                {/* Type Badge & Placement Badge (CANVAS only if on canvas - no INDEX badge) */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-bold text-white/80 backdrop-blur uppercase tracking-tighter border border-white/10">
                    {item.type}
                  </span>
                  {isOnCanvas && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase tracking-tight backdrop-blur border bg-indigo-950/80 text-indigo-300 border-indigo-500/40">
                      CANVAS
                    </span>
                  )}
                </div>

                {/* Grid Action Checkbox Overlay */}
                {layout === 'grid' && (
                  <div className="absolute top-2 right-2 z-10 flex items-center justify-center p-1 bg-black/80 rounded border border-white/15 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      className="size-3.5 accent-indigo-500 bg-black border border-white/20 rounded cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Content Section */}
              <div className={cn("flex flex-col flex-1 min-w-0 justify-between", layout === 'list' ? "p-3" : "p-3.5")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-[13px] leading-tight truncate text-white group-hover:text-indigo-200 transition-colors">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                        {item.progress > 0 && item.progress < 100 && (
                            <div className="w-8 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${item.progress}%` }} />
                            </div>
                        )}
                        {item.alivenessScore !== undefined && (
                            <span className="text-[9px] font-mono text-rose-400 font-bold">A_{item.alivenessScore}%</span>
                        )}
                        <span className="text-[9px] font-mono text-indigo-400 font-bold">R_{item.relevanceScore ?? 50}%</span>
                    </div>
                  </div>

                  {/* URL Link - Clearly Visible & Clickable */}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono truncate flex items-center gap-1 mt-1 transition-colors group/link max-w-full"
                      title={item.url}
                    >
                      <ExternalLink size={10} className="shrink-0 opacity-70 group-hover/link:opacity-100" />
                      <span className="truncate">{item.url}</span>
                    </a>
                  )}

                  <p className={cn("text-[11px] text-white/40 line-clamp-2 font-sans leading-relaxed", layout === 'list' ? "mt-1" : "mt-1.5")}>
                    {item.description}
                  </p>

                  {/* Tags Display (Across All Views) */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {item.tags.slice(0, layout === 'list' ? 8 : 4).map((tag: string) => (
                        <span 
                          key={tag} 
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-white/60 hover:text-white transition-colors"
                        >
                          #{tag}
                        </span>
                      ))}
                      {item.tags.length > (layout === 'list' ? 8 : 4) && (
                        <span className="text-[9px] font-mono text-white/30">
                          +{item.tags.length - (layout === 'list' ? 8 : 4)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[9px] text-white/40 uppercase font-mono">
                    <span className="text-[#818CF8] font-bold">{getSiteDisplayName(item)}</span>
                    {item.author && <span>· By {item.author}</span>}
                    {item.status && (
                      <span className={cn(
                        "font-bold uppercase px-1 rounded bg-white/5",
                        item.status === 'inbox' && "text-indigo-400",
                        item.status === 'active' && "text-emerald-400",
                        item.status === 'done' && "text-purple-400",
                        item.status === 'reference' && "text-neutral-400"
                      )}>
                        {item.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer metadata: Created / Updated Timestamps & Actions */}
                <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                  {/* Dates Display */}
                  <div className="flex items-center gap-3 text-[9px] font-mono text-white/35">
                    <div className="flex items-center gap-1" title="Created date">
                      <Calendar size={10} className="text-white/20" />
                      <span>{formatItemDate(item.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1" title="Last updated date">
                      <Clock size={10} className="text-white/20" />
                      <span>Upd: {formatItemDate(item.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    {/* Canvas placement toggle */}
                    <button
                      onClick={(e) => handleToggleCanvasPlacement(item, e)}
                      className={cn(
                        "p-1.5 rounded transition-all",
                        isOnCanvas ? "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10" : "text-white/30 hover:text-white hover:bg-white/5"
                      )}
                      title={isOnCanvas ? "Remove from Canvas (keep in Index)" : "Place node onto Canvas"}
                    >
                      {isOnCanvas ? <Eye size={12} /> : <Plus size={12} />}
                    </button>
                    <button 
                      onClick={(e) => handleItemRescrape(item, e)}
                      disabled={rescrapingItemIds.has(item.id)}
                      className="p-1.5 text-white/20 hover:text-indigo-400 hover:bg-white/5 rounded transition-all disabled:opacity-30"
                      title="Force Re-Scrape Metadata"
                    >
                      {rescrapingItemIds.has(item.id) ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                    </button>
                    <button 
                      onClick={(e) => handleExport(item, e)}
                      className="p-1.5 text-white/20 hover:text-white hover:bg-white/5 rounded transition-all"
                      title="Export Markdown"
                    >
                      <Download size={12} />
                    </button>
                    {item.url && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-white/20 hover:text-indigo-400 hover:bg-white/5 rounded transition-all"
                        title="Open external URL"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <button 
                      onClick={(e) => handleArchive(item, e)}
                      className="p-1.5 text-white/10 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-all"
                      title="Archive Node"
                    >
                      <Archive size={12} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(item.id, e)}
                      className="p-1.5 text-white/10 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                      title="Delete Node"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progressive Scroll Loading Sentinel & Stats */}
      {sortedItems.length > 0 && (
        <div ref={sentinelRef} className="py-6 flex flex-col items-center justify-center gap-2 border-t border-white/5">
          <p className="text-[10px] font-mono text-white/40 uppercase">
            Showing {Math.min(visibleLimit, sortedItems.length)} of {sortedItems.length} allocated nodes
          </p>

          {visibleLimit < sortedItems.length && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleLimit(prev => Math.min(prev + 100, sortedItems.length))}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded text-[10px] font-mono uppercase font-bold text-white/70 hover:text-white transition-all cursor-pointer"
              >
                LOAD MORE (+100)
              </button>
              <button
                type="button"
                onClick={() => setVisibleLimit(sortedItems.length)}
                className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded text-[10px] font-mono uppercase font-bold text-indigo-300 hover:text-indigo-200 transition-all cursor-pointer"
              >
                LOAD ALL ({sortedItems.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {sortedItems.length === 0 && (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-2">
          <FileText size={28} className="text-white/20" />
          <p className="text-xs font-mono uppercase text-white/50 font-bold">NO_NODES_MATCH_ACTIVE_FILTERS</p>
          <p className="text-[11px] text-white/30 max-w-xs">
            Try adjusting your search query, metrics sliders, or clearing selected tags and types.
          </p>
        </div>
      )}

      {/* Floating Bulk Operations Drawer */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] bg-black/95 border border-white/10 backdrop-blur-md rounded-md p-3 flex items-center justify-between gap-6 min-w-[340px] md:min-w-[500px] shadow-[0_15px_30px_rgba(0,0,0,0.8)]">
          <div className="flex items-center gap-3 pl-1">
            <span className="size-5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-[10px] flex items-center justify-center font-bold border border-indigo-500/20">
              {selectedIds.size}
            </span>
            <span className="text-[10px] text-white/60 font-mono uppercase font-bold tracking-wider">Nodes Selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBulkEditOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
            >
              Bulk Edit
            </button>
            <button
              onClick={handleBulkArchive}
              className="px-3 py-1.5 bg-emerald-700/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-700/20 rounded text-[10px] font-mono uppercase tracking-wider cursor-pointer"
            >
              Archive
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-red-800/10 text-red-400 border border-red-500/20 hover:bg-red-800/20 rounded text-[10px] font-mono uppercase tracking-wider cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <EditContentModal 
        item={editingItem} 
        isOpen={!!editingItem} 
        onClose={() => setEditingItem(null)} 
      />

      <BulkEditModal
        selectedIds={Array.from(selectedIds)}
        items={items}
        isOpen={isBulkEditOpen}
        onClose={() => setIsBulkEditOpen(false)}
        onComplete={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
