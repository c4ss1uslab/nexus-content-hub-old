import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, signInWithGoogle, signOut, db } from './lib/firebase';
import { Library, LayoutGrid, Plus, LogOut, Compass, Search, Filter, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CanvasView from './components/CanvasView';
import ListView from './components/ListView';
import ArchiveView from './components/ArchiveView';
import AddContentModal from './components/AddContentModal';
import { cn, OperationType, handleFirestoreError } from './lib/utils';
import Sidebar from './components/Sidebar';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ContentItem, Supertag } from './types';
import { supertagService } from './lib/supertagService';
import { Toaster } from 'sonner';

export default function App() {
  const [user, loading] = useAuthState(auth);
  const [view, setView] = useState<'canvas' | 'list' | 'archive'>('canvas');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [minRelevance, setMinRelevance] = useState(0);
  const [minAliveness, setMinAliveness] = useState(0);
  const [minProgress, setMinProgress] = useState(0);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [supertags, setSupertags] = useState<Supertag[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter by selected location/platform - Hook placed at top-level before early returns
  const locationFilteredItems = useMemo(() => {
    if (selectedLocations.length === 0) return items;
    return items.filter(item => item.location && selectedLocations.includes(item.location));
  }, [items, selectedLocations]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    const q = query(
      collection(db, 'contentItems'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ContentItem[];
        setItems(data);
      },
      (error) => handleFirestoreError(auth, error, OperationType.LIST, 'contentItems')
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setContainers([]);
      return;
    }

    const q = query(
      collection(db, 'canvasContainers'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setContainers(data);
      },
      (error) => handleFirestoreError(auth, error, OperationType.LIST, 'canvasContainers')
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSupertags([]);
      return;
    }

    const unsubscribe = supertagService.subscribe(user.uid, (list) => {
      setSupertags(list);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0F0F11]">
        <motion.div 
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-xs font-mono tracking-[0.2em] text-indigo-500"
        >
          SYSTEM_BOOTING...
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0F0F11] px-4 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #ffffff20 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm z-10"
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-4 h-4 bg-indigo-500 rounded-sm"></div>
            <h1 className="text-xl font-bold tracking-tighter text-white">NEXUS_CORE v2.4</h1>
          </div>
          <p className="text-xs text-white/40 mb-8 tracking-wide leading-relaxed font-mono uppercase">
            Centralized content virtualization. High density node processing active.
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-indigo-600 text-white py-3 px-8 rounded text-xs font-bold tracking-widest hover:bg-indigo-500 transition-all flex items-center justify-center gap-3 active:scale-[0.98] shadow-lg shadow-indigo-500/20"
          >
            AUTHORIZE WITH_GOOGLE
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#0F0F11] text-[#D1D1D1] text-xs select-none overflow-hidden font-sans">
      {/* Header */}
      <header className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-[#161618] shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-indigo-500 rounded-sm"></div>
            <span className="font-bold tracking-tighter text-sm text-white">NEXUS_HUB</span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-white/40 border-l border-white/10 pl-6 font-mono text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
              <span>SYNC_ACTIVE</span>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-8">
          <div className="relative flex items-center bg-white/5 border border-white/10 rounded px-3 py-1.5 group focus-within:border-indigo-500/50 transition-colors">
            <Search className="size-3.5 opacity-40 mr-2" />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Query library..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none w-full text-white placeholder:text-white/20 text-[11px]"
            />
            <span className="ml-2 px-1 rounded bg-white/10 text-[9px] text-white/50 border border-white/10 shrink-0">CMD+P</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <nav className="flex items-center bg-black/20 rounded p-1 border border-white/5">
            <button
              onClick={() => setView('canvas')}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-tight transition-all",
                view === 'canvas' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-white/40 hover:text-white"
              )}
            >
              Canvas
            </button>
            <button
              onClick={() => setView('list')}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-tight transition-all",
                view === 'list' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-white/40 hover:text-white"
              )}
            >
              Index
            </button>
            <button
              onClick={() => setView('archive')}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-tight transition-all",
                view === 'archive' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-white/40 hover:text-white"
              )}
            >
              Archive
            </button>
          </nav>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 text-white h-7 px-3 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-500 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Import
          </button>
          
          <button 
            onClick={() => signOut()}
            className="text-white/40 hover:text-white p-2 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 flex overflow-hidden relative">
        <Sidebar 
          items={items}
          supertags={supertags}
          userId={user.uid}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
          selectedTypes={selectedTypes}
          setSelectedTypes={setSelectedTypes}
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          selectedLocations={selectedLocations}
          setSelectedLocations={setSelectedLocations}
          minRelevance={minRelevance}
          setMinRelevance={setMinRelevance}
          minAliveness={minAliveness}
          setMinAliveness={setMinAliveness}
          minProgress={minProgress}
          setMinProgress={setMinProgress}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        
        <div className="flex-1 relative overflow-hidden bg-[#09090A]">
          {isSidebarCollapsed && (
            <button
              onClick={() => setIsSidebarCollapsed(false)}
              className="absolute top-4 left-4 z-[99] p-2 bg-[#161618] hover:bg-neutral-800 text-indigo-400 hover:text-white border border-white/10 rounded backdrop-blur shadow-xl transition-all flex items-center justify-center cursor-pointer active:scale-95"
              title="Expand Filters Sidebar"
            >
              <ChevronRight size={16} />
            </button>
          )}
          <AnimatePresence mode="wait">
            {view === 'canvas' ? (
              <motion.div
                key="canvas"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <CanvasView 
                  items={locationFilteredItems}
                  containers={containers}
                  searchQuery={searchQuery}
                  selectedTags={selectedTags}
                  selectedTypes={selectedTypes}
                  selectedStatuses={selectedStatuses}
                  minRelevance={minRelevance}
                  minAliveness={minAliveness}
                  minProgress={minProgress}
                />
              </motion.div>
            ) : view === 'list' ? (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#09090A] overflow-y-auto custom-scrollbar"
              >
                <ListView 
                  items={locationFilteredItems}
                  searchQuery={searchQuery}
                  selectedTags={selectedTags}
                  selectedTypes={selectedTypes}
                  selectedStatuses={selectedStatuses}
                  minRelevance={minRelevance}
                  minAliveness={minAliveness}
                  minProgress={minProgress}
                />
              </motion.div>
            ) : (
                <motion.div
                  key="archive"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-[#09090A] overflow-y-auto custom-scrollbar"
                >
                  <ArchiveView />
                </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-7 px-4 flex items-center justify-between bg-[#0A0A0C] border-t border-white/10 text-[9px] text-white/30 font-mono">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> ENGINE_READY</span>
          <span>GPU_ACCELERATION: ACTIVE</span>
        </div>
        <div className="flex items-center gap-6">
          <span>SYNC_STATUS: UP_TO_DATE</span>
          <span>MEM: 1.2GB / 8GB</span>
        </div>
      </footer>

      <AddContentModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
      />
      <Toaster theme="dark" closeButton richColors />
    </div>
  );
}
