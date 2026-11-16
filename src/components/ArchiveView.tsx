import { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ExternalLink, Trash2, Download, RotateCcw, BoxSelect, Calendar, Clock } from 'lucide-react';
import { getSiteDisplayName, getCleanUrlDisplay, formatItemDate } from '../lib/itemUtils';
import { motion, AnimatePresence } from 'motion/react';
import EditContentModal from './EditContentModal';
import { exportToMarkdown } from '../lib/exportUtils';
import { toast } from 'sonner';

export default function ArchiveView() {
  const [items, setItems] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'contentItems'),
      where('userId', '==', auth.currentUser.uid),
      where('archived', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItems(newItems);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'contentItems', id));
      toast.success('Deleted item from archive');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete: ' + (error as Error).message);
    }
  };

  const handleRestore = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'contentItems', id), {
        archived: false,
        updatedAt: serverTimestamp()
      });
      toast.success('Restored item to active library');
    } catch (error) {
      console.error(error);
      toast.error('Failed to restore: ' + (error as Error).message);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tighter text-white">ARCHIVE_NEXUS</h1>
          <p className="text-[10px] uppercase font-bold text-white/20 tracking-widest mt-1">Staging area for completed data nodes ({items.length} items)</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white/10 border border-dashed border-white/5 rounded">
           <BoxSelect size={48} className="mb-4 opacity-20" />
           <p className="text-xs uppercase font-bold tracking-widest">Archive is empty</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-20">
            <AnimatePresence>
            {items.map((item) => (
                <motion.div 
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setEditingItem(item)}
                    className="group bg-[#161618]/60 hover:bg-[#161618] rounded border border-white/5 hover:border-indigo-500/40 transition-all flex flex-col overflow-hidden cursor-pointer"
                >
                <div className="aspect-video bg-[#0A0A0C] relative overflow-hidden shrink-0">
                    {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover opacity-40 group-hover:opacity-75 transition-opacity" referrerPolicy="no-referrer" />
                    ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/5">
                        <BoxSelect size={24} />
                    </div>
                    )}
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-bold text-white/60 backdrop-blur uppercase tracking-tighter border border-white/5">
                        {item.type}
                    </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-white/70 group-hover:text-white text-xs line-clamp-1 transition-colors leading-relaxed">
                            {item.title}
                        </h3>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-indigo-400/80 hover:text-indigo-300 font-mono truncate flex items-center gap-1 mt-1 transition-colors group/link max-w-full"
                            title={item.url}
                          >
                            <ExternalLink size={10} className="shrink-0 opacity-70 group-hover/link:opacity-100" />
                            <span className="truncate">{getCleanUrlDisplay(item.url, 28)}</span>
                          </a>
                        )}
                        <p className="text-[9px] text-[#818CF8]/60 font-bold uppercase tracking-widest mt-1">{getSiteDisplayName(item)}</p>
                        <p className="text-[10px] text-white/30 line-clamp-2 mt-1 leading-relaxed">
                            {item.description}
                        </p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center justify-between text-[9px] font-mono text-white/30 mb-2">
                        <span className="flex items-center gap-1"><Calendar size={9} /> {formatItemDate(item.createdAt)}</span>
                        <span className="flex items-center gap-1"><Clock size={9} /> {formatItemDate(item.updatedAt)}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-mono text-indigo-400 font-bold bg-indigo-500/10 px-1 rounded">R_{item.relevanceScore ?? 50}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={(e) => handleRestore(item.id, e)}
                                className="p-1.5 text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-all"
                                title="Restore to Index"
                            >
                                <RotateCcw size={12} />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); exportToMarkdown(item); }}
                                className="p-1.5 text-white/30 hover:text-white hover:bg-white/5 rounded transition-all"
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
                                className="p-1.5 text-white/30 hover:text-indigo-400 hover:bg-white/5 rounded transition-all"
                                title="Open URL"
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                            <button 
                                onClick={(e) => handleDelete(item.id, e)}
                                className="p-1.5 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                                title="Delete from Archive"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                      </div>
                    </div>
                </div>
                </motion.div>
            ))}
            </AnimatePresence>
        </div>
      )}

      <EditContentModal 
        item={editingItem} 
        isOpen={!!editingItem} 
        onClose={() => setEditingItem(null)} 
      />
    </div>
  );
}
