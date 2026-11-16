import { useState, useRef } from 'react';
import { 
  X, Link as LinkIcon, Loader2, Sparkles, Tag as TagIcon, Star, User, 
  MapPin, Bookmark, UploadCloud, FileCode, CheckCircle2, AlertCircle, 
  FolderTree, ExternalLink, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { cn, OperationType, handleFirestoreError } from '../lib/utils';
import confetti from 'canvas-confetti';
import { ZONES, ZONE_H, ZONE_W } from '../lib/zones';
import { toast } from 'sonner';
import { getLocationsForType } from '../lib/locationMapping';
import { parseBookmarksHtml, BookmarkParseResult } from '../lib/bookmarkParser';
import { contentService } from '../lib/contentService';
import { formatItemDate } from '../lib/itemUtils';

interface AddContentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExtractedMetadata = {
  title: string;
  description: string;
  image: string;
  type: string;
};

export default function AddContentModal({ isOpen, onClose }: AddContentModalProps) {
  const [mode, setMode] = useState<'single' | 'bulk' | 'bookmarks'>('single');
  const [url, setUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [autoTag, setAutoTag] = useState(false);
  const [metadata, setMetadata] = useState<ExtractedMetadata | null>(null);
  const [tags, setTags] = useState('');
  const [author, setAuthor] = useState('');
  const [relevanceScore, setRelevanceScore] = useState(50);
  const [alivenessScore, setAlivenessScore] = useState(50);
  const [price, setPrice] = useState('');
  const [length, setLength] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [contentType, setContentType] = useState('website');
  const [bulkProgress, setBulkProgress] = useState({ total: 0, current: 0 });

  const [location, setLocation] = useState('raindrop');
  const [customLocation, setCustomLocation] = useState('');
  const [isCustomLocation, setIsCustomLocation] = useState(false);

  // Bookmark HTML Import state
  const [bookmarkFile, setBookmarkFile] = useState<File | null>(null);
  const [rawBookmarkHtml, setRawBookmarkHtml] = useState('');
  const [parsedBookmarks, setParsedBookmarks] = useState<BookmarkParseResult | null>(null);
  const [isParsingBookmarks, setIsParsingBookmarks] = useState(false);
  const [isImportingBookmarks, setIsImportingBookmarks] = useState(false);
  const [bookmarkImportProgress, setBookmarkImportProgress] = useState({ total: 0, current: 0 });
  const [bookmarkExtraTags, setBookmarkExtraTags] = useState('');
  const [bookmarkDefaultStatus, setBookmarkDefaultStatus] = useState<string>('inbox');
  const bookmarkFileInputRef = useRef<HTMLInputElement>(null);

  const changeContentTypeAndLocation = (newType: string) => {
    setContentType(newType);
    const defaultLocs = getLocationsForType(newType);
    if (defaultLocs.length > 0) {
      setLocation(defaultLocs[0]);
      setIsCustomLocation(false);
    } else {
      setLocation('');
      setIsCustomLocation(true);
    }
  };

  const handleExtract = async () => {
    if (!url) return;
    setIsExtracting(true);
    try {
      const response = await fetch('/api/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setMetadata(data);
      if (data.author) setAuthor(data.author);
      if (data.title) {
        const inf = inferType(data.type, url);
        changeContentTypeAndLocation(inf);
      }
    } catch (error) {
      console.error("Extraction failed", error);
      toast.error("Resource scan failed, check connection");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAutoTag = async () => {
    const textTitle = metadata?.title || url;
    const textDesc = metadata?.description || '';
    if (!textTitle) return;
    setIsAutoTagging(true);
    try {
      const res = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ title: textTitle, description: textDesc }] })
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

  const resetAndClose = () => {
    setUrl('');
    setBulkUrls('');
    setMetadata(null);
    setTags('');
    setAuthor('');
    setNotes('');
    setRelevanceScore(50);
    setAlivenessScore(50);
    setPrice('');
    setLength('');
    setSource('');
    setStatus('');
    setContentType('website');
    setLocation('raindrop');
    setCustomLocation('');
    setIsCustomLocation(false);
    setAutoTag(false);
    setBulkProgress({ total: 0, current: 0 });
    setBookmarkFile(null);
    setRawBookmarkHtml('');
    setParsedBookmarks(null);
    setIsParsingBookmarks(false);
    setIsImportingBookmarks(false);
    setBookmarkImportProgress({ total: 0, current: 0 });
    setBookmarkExtraTags('');
    onClose();
  };

  const inferType = (ogType: string, targetUrl: string) => {
    if (!targetUrl) return 'website';
    const low = targetUrl.toLowerCase();
    if (low.includes('youtube.com') || low.includes('youtu.be') || low.includes('vimeo.com')) return 'video';
    if (low.includes('spotify.com') || low.includes('apple.com/podcast') || low.includes('overcast.fm') || low.includes('podcasts.')) return 'podcast';
    if (low.includes('amazon.com') || low.includes('audible.com') || low.includes('goodreads.com')) return 'book';
    if (low.includes('coursera.org') || low.includes('udemy.com') || low.includes('edx.org')) return 'course';
    if (low.includes('twitter.com') || low.includes('x.com') || low.includes('instagram.com') || low.includes('linkedin.com') || low.includes('threads.net')) return 'social post';
    if (low.includes('medium.com') || low.includes('substack.com') || low.includes('dev.to')) return 'article';
    if (low.endsWith('.pdf') || low.includes('/pdf/')) return 'pdf';
    if (low.includes('arxiv.org') || low.includes('biorxiv.org')) return 'paper';
    return 'website';
  };

  const resolveCanvasPosition = async (tagArray: string[]) => {
    if (!tagArray.length || !auth.currentUser) return { x: Math.random() * 800, y: Math.random() * 800 };
    
    const mapDocRef = doc(db, 'tagMappings', auth.currentUser.uid);
    let tagMap: Record<string, string> = {};
    try {
        const docSnap = await getDoc(mapDocRef);
        if (docSnap.exists()) {
            tagMap = docSnap.data().mappings || {};
        }
    } catch(e) {}

    let category = null;
    let newMappings = false;

    for (const t of tagArray) {
        if (tagMap[t]) {
           category = tagMap[t];
           break;
        } else {
           try {
               const res = await fetch('/api/categorize-tag', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ tag: t })
               });
               const data = await res.json();
               if (data.category && ZONES.some(z => z.name === data.category)) {
                   tagMap[t] = data.category;
                   category = data.category;
                   newMappings = true;
                   break;
               }
           } catch(e) {}
        }
    }

    if (newMappings) {
        try {
            await setDoc(mapDocRef, { mappings: tagMap }, { merge: true });
        } catch(e) {}
    }

    if (category) {
        const zone = ZONES.find(z => z.name === category);
        if (zone) {
            const startX = -2 * ZONE_W + zone.col * ZONE_W;
            const startY = -1 * ZONE_H + zone.row * ZONE_H;
            return {
                x: startX + 500 + Math.random() * (ZONE_W - 1000),
                y: startY + 500 + Math.random() * (ZONE_H - 1000)
            };
        }
    }

    return { x: Math.random() * 800, y: Math.random() * 800 };
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    
    const tagArray = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
    const position = await resolveCanvasPosition(tagArray);
    
    const itemData = {
      userId: auth.currentUser.uid,
      title: metadata?.title || url,
      url,
      description: metadata?.description || '',
      imageUrl: metadata?.image || '',
      siteName: (metadata as any)?.siteName || null,
      author: author || null,
      type: contentType as any,
      tags: tagArray,
      relevanceScore,
      alivenessScore,
      progress: 0,
      price: price || '',
      length: length || '',
      source: source || null,
      location: isCustomLocation ? customLocation : location || null,
      status: (status || 'inbox') as any,
      archived: false,
      onCanvas: true,
      notes,
      canvasPosition: position,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await contentService.save(itemData);
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#6366F1', '#ffffff']
      });
      toast.success('Resource saved to canvas and index');
      resetAndClose();
    } catch (error) {
      handleFirestoreError(auth, error, OperationType.CREATE, 'contentItems');
    }
  };

  const handleBulkSave = async () => {
    if (!auth.currentUser || !bulkUrls) return;
    const urls = bulkUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) return;

    setIsExtracting(true);
    setBulkProgress({ total: urls.length, current: 0 });

    for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        setBulkProgress(p => ({ ...p, current: i + 1 }));
        
        try {
            const response = await fetch('/api/extract-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: u }),
            });
            const data = await response.json();
            
            let finalTags = [...tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '')];
            
            if (autoTag) {
              try {
                const tagRes = await fetch('/api/generate-tags', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items: [{ title: data.title || u, description: data.description || '' }] })
                });
                const tagData = await tagRes.json();
                if (tagData.tags && tagData.tags[0]) {
                  finalTags = Array.from(new Set([...finalTags, ...tagData.tags[0]]));
                }
              } catch (tagErr) {
                console.error("Bulk auto tagging failed for URL", u, tagErr);
              }
            }

            const itemType = contentType !== 'website' ? contentType : inferType(data.type || '', u);
            const defaultLocs = getLocationsForType(itemType);
            const itemLoc = isCustomLocation 
              ? (customLocation || defaultLocs[0] || 'PC')
              : (location || defaultLocs[0] || 'PC');
            const position = await resolveCanvasPosition(finalTags);

            await contentService.save({
                userId: auth.currentUser.uid,
                title: data.title || u,
                url: u,
                description: data.description || '',
                imageUrl: data.image || '',
                siteName: data.siteName || null,
                author: data.author || author || null,
                type: itemType as any,
                tags: finalTags,
                relevanceScore,
                alivenessScore,
                progress: 0,
                price: price || '',
                length: length || '',
                source: source || null,
                location: itemLoc,
                status: (status || 'inbox') as any,
                archived: false,
                onCanvas: true,
                notes,
                canvasPosition: { x: position.x + (Math.random() * 200 - 100), y: position.y + (Math.random() * 200 - 100) },
                createdAt: serverTimestamp(),
            });
        } catch (err) {
            console.error(`Failed to process ${u}`, err);
        }
    }

    confetti({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.6 },
        colors: ['#6366F1', '#ffffff']
    });
    
    toast.success(`Imported ${urls.length} resources into canvas and index`);
    resetAndClose();
  };

  // Process Bookmark HTML file
  const handleBookmarkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBookmarkFile(file);
    setIsParsingBookmarks(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawBookmarkHtml(content);
        try {
          const result = parseBookmarksHtml(content);
          setParsedBookmarks(result);
          if (result.totalCount === 0) {
            toast.error("No bookmarks found in HTML file. Ensure it is a valid browser bookmarks export.");
          } else {
            toast.success(`Parsed ${result.totalCount} bookmarks across ${result.allFolders.length} folder tags!`);
          }
        } catch (err) {
          console.error("Bookmark parsing error", err);
          toast.error("Failed to parse bookmark file");
        } finally {
          setIsParsingBookmarks(false);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleRawHtmlParse = () => {
    if (!rawBookmarkHtml.trim()) return;
    setIsParsingBookmarks(true);
    try {
      const result = parseBookmarksHtml(rawBookmarkHtml);
      setParsedBookmarks(result);
      if (result.totalCount === 0) {
        toast.error("No bookmarks found in provided HTML.");
      } else {
        toast.success(`Parsed ${result.totalCount} bookmarks across ${result.allFolders.length} folder tags!`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse bookmark HTML");
    } finally {
      setIsParsingBookmarks(false);
    }
  };

  // Execute Bookmark Import: All items go directly into index without canvas placement
  const handleImportBookmarks = async () => {
    if (!auth.currentUser || !parsedBookmarks || parsedBookmarks.bookmarks.length === 0) return;

    setIsImportingBookmarks(true);
    setBookmarkImportProgress({ total: parsedBookmarks.totalCount, current: 0 });

    const extraTags = bookmarkExtraTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t !== '');

    const itemsToCreate = parsedBookmarks.bookmarks.map(bm => {
      const combinedTags = Array.from(new Set([...bm.tags, ...extraTags]));
      const detectedType = inferType('', bm.url);

      return {
        userId: auth.currentUser!.uid,
        title: bm.title || bm.url,
        url: bm.url,
        description: bm.description || '',
        imageUrl: '',
        siteName: null,
        author: null,
        type: detectedType as any,
        tags: combinedTags,
        folderPath: bm.folderPath && bm.folderPath.length > 0 ? bm.folderPath : undefined,
        relevanceScore: 50,
        alivenessScore: 50,
        progress: 0,
        price: '',
        length: '',
        source: 'Browser Bookmarks Export',
        location: 'Browser',
        status: (bookmarkDefaultStatus || 'inbox') as any,
        archived: false,
        onCanvas: false, // Explicit requirement: DO NOT place in canvas
        canvasPosition: null, // Index only
        notes: bm.folderPath.length ? `Imported from bookmark folders:\n📁 ${bm.folderPath.join(' > ')}` : '',
        createdAt: bm.createdAt || new Date(), // Keep original bookmark created date from browser export if present!
      };
    });

    try {
      const totalImported = await contentService.batchCreate(
        itemsToCreate,
        (current, total) => {
          setBookmarkImportProgress({ current, total });
        }
      );

      confetti({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.6 },
        colors: ['#6366F1', '#10B981', '#ffffff']
      });

      toast.success(`Successfully imported ${totalImported} bookmarks into the Core Index!`);
      resetAndClose();
    } catch (error) {
      console.error("Bookmark batch import failed", error);
      toast.error('Failed to import bookmarks: ' + (error as Error).message);
    } finally {
      setIsImportingBookmarks(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-[#161618] w-full max-w-xl rounded border border-white/10 overflow-hidden relative z-10 shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Tab navigation */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0 bg-[#1C1C1E]">
              <div className="flex gap-4">
                <button 
                  onClick={() => setMode('single')}
                  className={cn("text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer", mode === 'single' ? "text-white" : "text-white/30 hover:text-white/60")}
                >
                  SINGLE_IMPORT
                </button>
                <button 
                  onClick={() => setMode('bulk')}
                  className={cn("text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer", mode === 'bulk' ? "text-white" : "text-white/30 hover:text-white/60")}
                >
                  BULK_TRANSFER
                </button>
                <button 
                  onClick={() => setMode('bookmarks')}
                  className={cn("text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer", mode === 'bookmarks' ? "text-indigo-400 font-extrabold" : "text-white/30 hover:text-white/60")}
                >
                  <Bookmark size={12} className={mode === 'bookmarks' ? "text-indigo-400" : "text-white/30"} />
                  BROWSER_BOOKMARKS
                </button>
              </div>
              <button onClick={resetAndClose} className="text-white/40 hover:text-white transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              
              {/* TAB 1: SINGLE URL IMPORT */}
              {mode === 'single' && (
                <>
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Target Resource URL</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/40" />
                        <input 
                          autoFocus
                          type="text" 
                          placeholder="https://..." 
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleExtract()}
                          className="w-full bg-white/5 border border-white/10 rounded px-10 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                      </div>
                      <button 
                        onClick={handleExtract}
                        disabled={!url || isExtracting}
                        className="bg-indigo-600 text-white px-4 rounded text-xs font-bold uppercase tracking-widest hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                      >
                        {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Scan
                      </button>
                    </div>
                  </div>

                  {metadata && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="bg-black/20 rounded p-4 flex gap-4 border border-white/5">
                        {metadata.image && (
                          <div className="w-20 h-20 bg-[#0A0A0C] border border-white/10 rounded overflow-hidden shrink-0">
                            <img src={metadata.image} alt="" className="w-full h-full object-cover grayscale opacity-60" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-bold text-white text-[13px] leading-tight truncate">{metadata.title}</h4>
                            <select 
                              value={contentType}
                              onChange={(e) => changeContentTypeAndLocation(e.target.value)}
                              className="text-[9px] uppercase font-bold bg-white/5 border border-white/10 text-white/60 rounded px-1.5 py-0.5 focus:outline-none cursor-pointer"
                            >
                              <option value="website">Website</option>
                              <option value="page">Page</option>
                              <option value="article">Article</option>
                              <option value="course">Course</option>
                              <option value="book">Book</option>
                              <option value="audiobook">Audiobook</option>
                              <option value="paper">Paper</option>
                              <option value="highlights">Highlights</option>
                              <option value="notes">Notes</option>
                              <option value="podcast">Podcast</option>
                              <option value="video">Video</option>
                              <option value="pdf">PDF</option>
                              <option value="social post">Social Post</option>
                              <option value="social profile">Social Profile</option>
                              <option value="screenshot">Screenshot</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <p className="text-[11px] text-white/40 line-clamp-2 mt-1 leading-relaxed">{metadata.description}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* TAB 2: BULK URLS */}
              {mode === 'bulk' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">URL Pipeline (One per line)</label>
                      <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer mr-1">
                        <input 
                          type="checkbox"
                          checked={autoTag}
                          onChange={(e) => setAutoTag(e.target.checked)}
                          className="size-3 cursor-pointer accent-indigo-500 rounded bg-white/5"
                        />
                        <span>AI Auto-Tag Batch</span>
                      </label>
                    </div>
                    <textarea 
                       placeholder="https://site1.com&#10;https://site2.com..."
                       value={bulkUrls}
                       onChange={(e) => setBulkUrls(e.target.value)}
                       rows={6}
                       className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500/50 resize-none font-mono"
                    />
                  </div>
                  {isExtracting && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded p-3 flex flex-col gap-2">
                        <div className="flex justify-between text-[9px] font-mono font-bold text-indigo-400">
                            <span>PROCESSING_STREAM...</span>
                            <span>{bulkProgress.current} / {bulkProgress.total}</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-indigo-500" 
                                initial={{ width: 0 }}
                                animate={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: BROWSER BOOKMARKS IMPORT */}
              {mode === 'bookmarks' && (
                <div className="space-y-5">
                  {/* Instructional banner */}
                  <div className="p-3.5 bg-indigo-950/20 border border-indigo-500/20 rounded-md space-y-1.5">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold text-[11px] uppercase tracking-wider font-mono">
                      <FolderTree size={14} className="text-indigo-400" />
                      Browser Bookmarks Importer
                    </div>
                    <p className="text-[11px] text-white/60 leading-relaxed">
                      Upload your browser bookmarks export file (<code className="text-indigo-300 bg-white/5 px-1 py-0.5 rounded font-mono text-[10px]">bookmarks.html</code>). 
                      Every folder will be converted into taxonomy tags and assigned to its bookmarks.
                    </p>
                    <p className="text-[10px] text-emerald-400/90 font-mono font-bold flex items-center gap-1.5 pt-1">
                      <CheckCircle2 size={11} />
                      Imported directly into Core Index Explorer (not placed on canvas).
                    </p>
                  </div>

                  {/* Drag & drop / File input */}
                  <div 
                    onClick={() => bookmarkFileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/15 hover:border-indigo-500/50 rounded-lg p-6 flex flex-col items-center justify-center gap-2.5 cursor-pointer bg-white/[0.02] hover:bg-white/[0.04] transition-all text-center"
                  >
                    <input 
                      type="file"
                      ref={bookmarkFileInputRef}
                      onChange={handleBookmarkFileChange}
                      accept=".html,.htm"
                      className="hidden"
                    />
                    <UploadCloud size={28} className="text-indigo-400" />
                    <div>
                      <p className="text-xs font-bold text-white tracking-wide">
                        {bookmarkFile ? bookmarkFile.name : "Click to select or drop bookmarks HTML file"}
                      </p>
                      <p className="text-[10px] text-white/40 font-mono mt-0.5">Supports Chrome, Safari, Firefox, Edge, Brave, Opera exports</p>
                    </div>
                  </div>

                  {/* Or paste raw HTML option */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                        <FileCode size={11} /> Or Paste Raw Bookmark HTML
                      </label>
                      {rawBookmarkHtml && (
                        <button
                          type="button"
                          onClick={handleRawHtmlParse}
                          className="text-[9px] uppercase font-mono font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          PARSE_HTML
                        </button>
                      )}
                    </div>
                    <textarea 
                      placeholder="<!DOCTYPE NETSCAPE-Bookmark-file-1>..."
                      value={rawBookmarkHtml}
                      onChange={(e) => {
                        setRawBookmarkHtml(e.target.value);
                        if (e.target.value.length > 50) {
                          try {
                            const res = parseBookmarksHtml(e.target.value);
                            setParsedBookmarks(res);
                          } catch(err) {}
                        }
                      }}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] text-white focus:outline-none focus:border-indigo-500/50 resize-none font-mono"
                    />
                  </div>

                  {/* Parsing indicator */}
                  {isParsingBookmarks && (
                    <div className="flex items-center justify-center gap-2 p-3 bg-white/5 rounded text-xs text-white/60 font-mono">
                      <Loader2 size={14} className="animate-spin text-indigo-400" />
                      Parsing HTML bookmarks and folder taxonomy...
                    </div>
                  )}

                  {/* Parsed Results Overview */}
                  {parsedBookmarks && parsedBookmarks.totalCount > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 bg-black/40 border border-white/10 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 size={13} />
                          {parsedBookmarks.totalCount} Bookmarks Ready
                        </span>
                        <span className="text-[10px] font-mono text-white/40">
                          {parsedBookmarks.allFolders.length} Folder Tags
                        </span>
                      </div>

                      {/* Folder tags preview */}
                      {parsedBookmarks.allFolders.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[9px] uppercase font-bold text-white/40 tracking-wider block font-mono">Extracted Folder Tags:</span>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-white/2 rounded custom-scrollbar">
                            {parsedBookmarks.allFolders.map(folder => (
                              <span key={folder} className="text-[9px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                                #{folder}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Extra configuration for bookmark import */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-white/40 tracking-widest font-mono">Default Status</label>
                          <select
                            value={bookmarkDefaultStatus}
                            onChange={(e) => setBookmarkDefaultStatus(e.target.value)}
                            className="w-full bg-[#1c1c1e] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                          >
                            <option value="inbox">Inbox</option>
                            <option value="reference">Reference</option>
                            <option value="ready">Ready</option>
                            <option value="active">Active</option>
                            <option value="someday maybe">Someday Maybe</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-white/40 tracking-widest font-mono">Additional Tags (Optional)</label>
                          <input 
                            type="text"
                            placeholder="bookmark-sync, favorites..."
                            value={bookmarkExtraTags}
                            onChange={(e) => setBookmarkExtraTags(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                          />
                        </div>
                      </div>

                      {/* Preview of first 3 items */}
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <span className="text-[9px] uppercase font-bold text-white/30 tracking-wider block font-mono">Sample Imported Items:</span>
                        <div className="space-y-1.5">
                          {parsedBookmarks.bookmarks.slice(0, 3).map((bm, idx) => (
                            <div key={idx} className="p-2 bg-white/5 rounded border border-white/5 text-[10px] space-y-0.5">
                              <div className="flex justify-between items-center gap-2">
                                <span className="font-bold text-white truncate">{bm.title}</span>
                                {bm.createdAt && (
                                  <span className="text-white/30 font-mono text-[9px] shrink-0">
                                    {formatItemDate(bm.createdAt)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-white/40 font-mono text-[9px] truncate">
                                <span className="text-indigo-400/80 truncate">{bm.url}</span>
                                {bm.tags.length > 0 && (
                                  <span className="text-white/30 shrink-0">({bm.tags.map(t => `#${t}`).join(' ')})</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Importing Progress */}
                  {isImportingBookmarks && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded p-3 flex flex-col gap-2">
                      <div className="flex justify-between text-[9px] font-mono font-bold text-indigo-400">
                        <span>INGESTING_BOOKMARKS_INTO_INDEX...</span>
                        <span>{bookmarkImportProgress.current} / {bookmarkImportProgress.total}</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-indigo-500" 
                          initial={{ width: 0 }}
                          animate={{ width: `${(bookmarkImportProgress.current / (bookmarkImportProgress.total || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Single / Bulk Shared Options */}
              {mode !== 'bookmarks' && (
                <>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">
                            {mode === 'bulk' ? 'BATCH_FORMAT_OVERRIDE' : 'RESOURCE_FORMAT'}
                        </label>
                        <select 
                            value={contentType}
                            onChange={(e) => changeContentTypeAndLocation(e.target.value)}
                            className="w-full bg-[#1c1c1e] border border-white/10 text-white text-xs rounded px-3 py-2.5 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                        >
                            <option value="website">{mode === 'bulk' ? 'AUTO_INFER' : 'Website'}</option>
                            <option value="page">Page</option>
                            <option value="article">Article</option>
                            <option value="course">Course</option>
                            <option value="book">Book</option>
                            <option value="audiobook">Audiobook</option>
                            <option value="paper">Paper</option>
                            <option value="highlights">Highlights</option>
                            <option value="notes">Notes</option>
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
                            <TagIcon size={12} /> TAXONOMY_TAGS
                          </label>
                          {mode === 'single' && metadata && (
                            <button
                              onClick={handleAutoTag}
                              disabled={isAutoTagging}
                              className="flex items-center gap-1 text-[9px] font-bold uppercase text-indigo-400 hover:text-indigo-300 disabled:opacity-55 transition-colors cursor-pointer font-mono"
                            >
                              {isAutoTagging ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                <Sparkles size={10} />
                              )}
                              AUTO_TAG
                            </button>
                          )}
                        </div>
                        <input 
                            type="text" 
                            placeholder="tag1, tag2..."
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                        />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                        <Star size={12} /> RELEVANCE_SCORE
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> ALIVENESS_SCORE
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-1">
                        <User size={12} /> AUTHOR_CREATOR
                      </label>
                      <input 
                          type="text" 
                          placeholder="Enter author, researcher, creator..."
                          value={author}
                          onChange={(e) => setAuthor(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Source / Related To</label>
                      <input 
                          type="text" 
                          placeholder="Enter source, context, or project..."
                          value={source}
                          onChange={(e) => setSource(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                      />
                    </div>
                  </div>

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

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Extended Metadata (.md notes)</label>
                    <textarea 
                        placeholder="Append research notes, quotes, or synthesis..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 resize-none font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Bottom action bar */}
            <div className="p-4 border-t border-white/5 bg-[#1C1C1E] shrink-0">
              {mode === 'bookmarks' ? (
                <button 
                  onClick={handleImportBookmarks}
                  disabled={isImportingBookmarks || !parsedBookmarks || parsedBookmarks.totalCount === 0}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-indigo-500 transition-all disabled:opacity-50 active:scale-[0.98] shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-2 cursor-pointer font-mono"
                >
                  {isImportingBookmarks ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>IMPORTING_{bookmarkImportProgress.current}_OF_{bookmarkImportProgress.total}...</span>
                    </>
                  ) : (
                    <>
                      <Bookmark size={14} />
                      <span>IMPORT_{parsedBookmarks?.totalCount || 0}_BOOKMARKS_TO_INDEX</span>
                    </>
                  )}
                </button>
              ) : (
                <button 
                  onClick={mode === 'single' ? handleSave : handleBulkSave}
                  disabled={isExtracting || (mode === 'single' && (!url || !metadata)) || (mode === 'bulk' && !bulkUrls)}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-indigo-500 transition-all disabled:opacity-50 active:scale-[0.98] shadow-lg shadow-indigo-500/10 cursor-pointer"
                >
                  {mode === 'single' ? 'INITIALIZE_NODE' : 'EXECUTE_BATCH_PROCESS'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
