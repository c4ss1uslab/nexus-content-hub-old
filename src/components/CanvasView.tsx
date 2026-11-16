import { useEffect, useState, useRef, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage } from 'react-konva';
import { getSiteDisplayName, getCleanUrlDisplay } from '../lib/itemUtils';
import { Plus, Minus, Hash, Trash, Check, FolderClosed, Layers } from 'lucide-react';
import useImage from 'use-image';
import EditContentModal from './EditContentModal';
import { ContentItem } from '../types';
import { contentService } from '../lib/contentService';
import { containerService, CanvasContainer } from '../lib/containerService';
import { itemMatchesTags } from '../lib/folderTreeUtils';
import { auth } from '../lib/firebase';
import { ZONES, ZONE_W, ZONE_H } from '../lib/zones';
import { toast } from 'sonner';
import ContainerNode from './ContainerNode';

interface CanvasViewProps {
  items: ContentItem[];
  containers?: CanvasContainer[];
  searchQuery: string;
  selectedTags: string[];
  selectedTypes: string[];
  selectedStatuses?: string[];
  minRelevance?: number;
  minAliveness?: number;
  minProgress?: number;
}

interface ItemNodeProps {
  item: ContentItem;
  width: number;
  height: number;
  x: number;
  y: number;
  isSelected: boolean;
  isSearchMatch?: boolean;
  onDragStart: (id: string, x: number, y: number) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onSelect: (id: string, isShift: boolean) => void;
  onResizeStart: (id: string) => void;
  onResize: (width: number, height: number) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
  onClick: () => void;
}

const ItemNode = ({ 
  item, 
  width, 
  height, 
  x,
  y,
  isSelected, 
  isSearchMatch = false,
  onDragStart,
  onDragMove,
  onDragEnd, 
  onSelect, 
  onResizeStart, 
  onResize, 
  onResizeEnd, 
  onClick 
}: ItemNodeProps) => {
  const [image] = useImage(item.imageUrl || '');
  
  // Calculate uniform scale ratio based on base dimensions (220 x 80)
  const scale = Math.min(width / 220, height / 80);
  
  return (
    <Group 
      draggable
      x={x}
      y={y}
      onDragStart={(e) => {
        if (e.target === e.currentTarget) {
          e.cancelBubble = true;
          onDragStart(item.id, e.target.x(), e.target.y());
        }
      }}
      onDragMove={(e) => {
        if (e.target === e.currentTarget) {
          e.cancelBubble = true;
          onDragMove(item.id, e.target.x(), e.target.y());
        }
      }}
      onDragEnd={(e) => {
        if (e.target === e.currentTarget) {
          e.cancelBubble = true;
          onDragEnd(item.id, e.target.x(), e.target.y());
        }
      }}
      onClick={(e) => {
        e.cancelBubble = true;
        
        // Check if Shift or CMD/Ctrl was used during click
        const isShift = !!(e.evt && e.evt.shiftKey);
        onSelect(item.id, isShift);
        
        // Ctrl + click or Cmd + click opens link in new tab
        if (e.evt && (e.evt.ctrlKey || e.evt.metaKey)) {
          window.open(item.url, '_blank', 'noopener,noreferrer');
        }
      }}
      onDblClick={(e) => {
        e.cancelBubble = true;
        onClick();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect(item.id, false);
      }}
      onDblTap={(e) => {
        e.cancelBubble = true;
        onClick();
      }}
    >
      {/* Search match pointing marker hud */}
      {isSearchMatch && (
        <Group x={width / 2} y={-18 * scale}>
          <Text
            text="🎯 SEARCH_TARGET"
            fontSize={6.5 * scale}
            fontFamily="monospace"
            fontStyle="bold"
            fill="#F59E0B"
            align="center"
            width={120 * scale}
            x={-60 * scale}
          />
          <Text
            text="▼"
            fontSize={8 * scale}
            fill="#F59E0B"
            align="center"
            width={20 * scale}
            x={-10 * scale}
            y={6 * scale}
          />
        </Group>
      )}

      {/* Main Body */}
      <Rect
        width={width}
        height={height}
        fill="#161618"
        cornerRadius={Math.max(2, 4 * scale)}
        stroke={isSearchMatch ? "#F59E0B" : (isSelected ? "#6366F1" : "#FFFFFF1A")}
        strokeWidth={isSearchMatch ? Math.max(2, 2.5 * scale) : (isSelected ? Math.max(1, 1.5 * scale) : Math.max(0.5, 1 * scale))}
        shadowColor={isSearchMatch ? "#F59E0B" : undefined}
        shadowBlur={isSearchMatch ? 15 : undefined}
        shadowOpacity={isSearchMatch ? 0.85 : undefined}
      />
      
      {/* Accent Line for Relevance */}
      <Rect
        width={Math.max(2, 4 * scale)}
        height={height}
        fill={item.relevanceScore >= 70 ? "#6366F1" : "#FFFFFF1A"}
        cornerRadius={[Math.max(2, 4 * scale), 0, 0, Math.max(2, 4 * scale)]}
      />
      
      {/* Image / Icon container */}
      <Group x={12 * scale} y={12 * scale}>
        {image ? (
          <Group clipFunc={(ctx) => ctx.rect(0, 0, 40 * scale, 40 * scale)}>
            <KonvaImage
               image={image}
               width={40 * scale}
               height={40 * scale}
               opacity={0.8}
            />
          </Group>
        ) : (
          <Rect 
            width={40 * scale} 
            height={40 * scale} 
            fill="#FFFFFF05" 
            stroke="#FFFFFF1A" 
            strokeWidth={Math.max(0.5, 1 * scale)} 
          />
        )}
      </Group>

      {/* Type Tag */}
      <Group x={12 * scale} y={height - 22 * scale}>
        <Rect width={34 * scale} height={10 * scale} fill="#FFFFFF0A" cornerRadius={Math.max(1, 1 * scale)} />
        <Text
          x={4 * scale}
          y={2 * scale}
          text={item.type.toUpperCase()}
          fontSize={6 * scale}
          fontFamily="monospace"
          fontStyle="bold"
          fill="#FFFFFF66"
          letterSpacing={0.5 * scale}
        />
      </Group>

      {/* Title */}
      <Text
        x={64 * scale}
        y={10 * scale}
        text={item.title}
        fontSize={10.5 * scale}
        fontFamily="sans-serif"
        fontStyle="bold"
        width={width - 76 * scale}
        height={height - 44 * scale}
        align="left"
        verticalAlign="top"
        ellipsis={true}
        wrap="word"
        fill="#FFFFFFE6"
      />

      {/* URL Display */}
      {item.url && (
        <Text
          x={64 * scale}
          y={height - 43 * scale}
          text={`🔗 ${getCleanUrlDisplay(item.url, 28)}`}
          fontSize={6 * scale}
          fontFamily="monospace"
          fill="#818CF8DD"
          width={width - 76 * scale}
          ellipsis={true}
          wrap="none"
        />
      )}

      {/* Price & Length Mini Pill */}
      {(item.price || item.length) && (
        <Group x={64 * scale} y={height - 35 * scale}>
          <Text
            text={`${item.price ? `💵 ${item.price.toUpperCase()}   ` : ''}${item.length ? `⏱️ ${item.length.toUpperCase()}` : ''}`}
            fontSize={5.5 * scale}
            fontFamily="monospace"
            fontStyle="bold"
            fill="#34D399"
          />
        </Group>
      )}

      {/* Site Name */}
      <Text
        x={64 * scale}
        y={height - 31 * scale}
        text={getSiteDisplayName(item)}
        fontSize={6 * scale}
        fontFamily="monospace"
        fontStyle="bold"
        fill="#6366F1AA"
        letterSpacing={0.5 * scale}
        width={width - 76 * scale}
        ellipsis={true}
      />

      {/* Tags footer */}
      <Text
        x={64 * scale}
        y={height - 22 * scale}
        text={item.tags?.length ? item.tags.slice(0, 3).map((t: string) => `#${t}`).join(' ') : 'UNTITLED_CLUSTER'}
        fontSize={8 * scale}
        fontFamily="monospace"
        fill="#FFFFFF33"
        width={Math.max(10, width - 128 * scale)}
        ellipsis={true}
        wrap="none"
      />

      {/* Relevance Score Pill */}
      <Group x={width - 60 * scale} y={height - 22 * scale}>
        <Rect 
          width={24 * scale} 
          height={12 * scale} 
          fill="#6366F122" 
          cornerRadius={Math.max(1, 2 * scale)} 
          stroke="#6366F144" 
          strokeWidth={Math.max(0.3, 0.5 * scale)} 
        />
        <Text
          x={0}
          y={0}
          text={`R_${item.relevanceScore || 0}`}
          fontSize={6 * scale}
          fontFamily="monospace"
          fontStyle="bold"
          fill="#6366F1"
          width={24 * scale}
          height={12 * scale}
          align="center"
          verticalAlign="middle"
        />
      </Group>

      {/* Aliveness Score Pill */}
      {item.alivenessScore !== undefined && (
        <Group x={width - 34 * scale} y={height - 22 * scale}>
          <Rect 
            width={24 * scale} 
            height={12 * scale} 
            fill="#F43F5E22" 
            cornerRadius={Math.max(1, 2 * scale)} 
            stroke="#F43F5E44" 
            strokeWidth={Math.max(0.3, 0.5 * scale)} 
          />
          <Text
            x={0}
            y={0}
            text={`A_${item.alivenessScore || 0}`}
            fontSize={6 * scale}
            fontFamily="monospace"
            fontStyle="bold"
            fill="#F43F5E"
            width={24 * scale}
            height={12 * scale}
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )}

      {/* Status Pill */}
      {item.status && (
        <Group x={64 * scale} y={height - 12 * scale}>
          <Rect 
            width={width - 74 * scale} 
            height={10 * scale} 
            fill="#D946EF11" 
            cornerRadius={Math.max(1, 2 * scale)} 
          />
          <Text
            x={4 * scale}
            y={2 * scale}
            text={`STATUS: ${item.status.toUpperCase()}`}
            fontSize={6 * scale}
            fontFamily="monospace"
            fontStyle="bold"
            fill="#D946EF"
            width={width - 82 * scale}
            wrap="none"
            ellipsis={true}
          />
        </Group>
      )}

      {/* Progress Bar (Bottom Edge) */}
      {item.progress > 0 && (
        <Group y={height - Math.max(1, 2 * scale)}>
          <Rect width={width} height={Math.max(1, 2 * scale)} fill="#FFFFFF05" />
          <Rect width={(item.progress / 100) * width} height={Math.max(1, 2 * scale)} fill="#10B981" />
        </Group>
      )}

      {/* Edit pencil icon */}
      {isSelected && (
        <Group 
          x={width - 24 * scale} 
          y={6 * scale}
          onClick={(e) => {
            e.cancelBubble = true;
            onClick();
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            onClick();
          }}
        >
          <Rect
            width={18 * scale}
            height={18 * scale}
            fill="#6366F1"
            cornerRadius={Math.max(1, 3 * scale)}
            opacity={0.9}
          />
          <Text
            width={18 * scale}
            height={18 * scale}
            text="✎"
            fontSize={10 * scale}
            fill="#FFFFFF"
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )}

      {/* Corner Resize Anchor */}
      {isSelected && (
        <Group
          x={width}
          y={height}
          draggable
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'se-resize';
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'default';
          }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            onResizeStart(item.id);
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const currentW = Math.max(140, e.target.x());
            const currentH = Math.max(60, e.target.y());
            e.target.x(currentW);
            e.target.y(currentH);
            onResize(currentW, currentH);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const finalW = Math.max(140, e.target.x());
            const finalH = Math.max(60, e.target.y());
            onResizeEnd(item.id, finalW, finalH);
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'default';
          }}
        >
          <Rect
            x={-(8 * scale)}
            y={-(8 * scale)}
            width={8 * scale}
            height={8 * scale}
            fill="#6366F1"
            stroke="#161618"
            strokeWidth={Math.max(0.5, 1 * scale)}
            cornerRadius={Math.max(0.5, 1 * scale)}
          />
        </Group>
      )}
    </Group>
  );
};

export default function CanvasView({ 
  items,
  containers = [],
  searchQuery, 
  selectedTags, 
  selectedTypes,
  selectedStatuses = [],
  minRelevance = 0,
  minAliveness = 0,
  minProgress = 0
}: CanvasViewProps) {
  const [stageScale, setStageScale] = useState(0.8);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  
  // Advanced selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  
  // Resizing state for cards
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingWidth, setResizingWidth] = useState<number>(220);
  const [resizingHeight, setResizingHeight] = useState<number>(80);

  // Resizing state for containers
  const [resizingContainerId, setResizingContainerId] = useState<string | null>(null);
  const [resizingContainerWidth, setResizingContainerWidth] = useState<number>(400);
  const [resizingContainerHeight, setResizingContainerHeight] = useState<number>(300);

  // Keyboard and Drag Shift detection states
  const [shiftPressed, setShiftPressed] = useState(false);
  const [selectionArea, setSelectionArea] = useState<{ startX: number; startY: number; endX: number; endY: number; visible: boolean } | null>(null);

  // Multi dragging items group delta
  const [isMultiDragging, setIsMultiDragging] = useState(false);
  const [activeDragDelta, setActiveDragDelta] = useState({ dx: 0, dy: 0 });
  const dragStartPositions = useRef<Record<string, {x: number; y: number}>>({});
  const dragDraggedStartPos = useRef({ x: 0, y: 0 });

  // Container dragging logic (dragging a folder moves nested contents)
  const [isDraggingContainerId, setIsDraggingContainerId] = useState<string | null>(null);
  const [activeContainerDragDelta, setActiveContainerDragDelta] = useState({ dx: 0, dy: 0 });
  const dragStartContainerPos = useRef({ x: 0, y: 0 });
  const dragStartNestedItemPositions = useRef<Record<string, { x: number; y: number }>>({});

  // Renaming Container dialogue
  const [renamingContainerId, setRenamingContainerId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState('');

  // Keep sturdy refs to avoid any stale key listener closures
  const selectedContainerIdRef = useRef<string | null>(null);
  const handleDeleteContainerRef = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    selectedContainerIdRef.current = selectedContainerId;
  }, [selectedContainerId]);

  const gridPatternImage = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(0, 0, 1, 1);
    }
    return canvas;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      setDimensions({
        width: containerRef.current?.offsetWidth || 0,
        height: containerRef.current?.offsetHeight || 0
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleWheel = (e: any) => {
    if (editingItem || renamingContainerId) return;
    e.evt.preventDefault();
    
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: pointer.x / oldScale - stage.x() / oldScale,
      y: pointer.y / oldScale - stage.y() / oldScale,
    };

    // Calculate dynamic zoom factor based on scroll delta
    const delta = -e.evt.deltaY;
    const factor = Math.exp(delta * 0.005);
    // Clamp factor per single wheel event to keep zooming snappy but controlled
    const clampedFactor = Math.min(Math.max(factor, 0.70), 1.35);
    
    // Zoom range restricted between 5% and 800%
    const newScale = Math.min(Math.max(oldScale * clampedFactor, 0.05), 8.0);

    setStageScale(newScale);
    setStageX(-(mousePointTo.x - pointer.x / newScale) * newScale);
    setStageY(-(mousePointTo.y - pointer.y / newScale) * newScale);
  };

  // Spatial containment helper
  const isItemInContainer = (item: ContentItem, container: any) => {
    const ix = item.canvasPosition?.x || 100;
    const iy = item.canvasPosition?.y || 100;
    const cx = container.x;
    const cy = container.y;
    const cw = container.width || 400;
    const ch = container.height || 300;
    return ix >= cx && ix <= cx + cw && iy >= cy && iy <= cy + ch;
  };

  const filteredItems = items.filter(item => {
    if (item.archived === true) return false;
    // Exclude index-only items from canvas
    if (item.onCanvas === false || !item.canvasPosition) return false;
    const matchesSearch = (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.url || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (item.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = itemMatchesTags(item, selectedTags);
    const matchesTypes = selectedTypes.length === 0 || selectedTypes.includes(item.type);
    const matchesStatus = selectedStatuses.length === 0 || (item.status && selectedStatuses.includes(item.status));
    
    const passesRelevance = (item.relevanceScore ?? 50) >= minRelevance;
    const passesAliveness = (item.alivenessScore ?? 50) >= minAliveness;
    const passesProgress = (item.progress ?? 0) >= minProgress;

    return matchesSearch && matchesTags && matchesTypes && matchesStatus && passesRelevance && passesAliveness && passesProgress;
  });

  // Exclude folded items inside collapsed section containers
  const collapsedContainers = (containers || []).filter(c => c.type === 'collapsible' && c.collapsed);
  const visibleItems = filteredItems.filter(item => {
    const isInsideCollapsed = collapsedContainers.some(c => isItemInContainer(item, c));
    return !isInsideCollapsed;
  });

  // Dragging group elements
  const handleDragStartNode = (id: string, x: number, y: number) => {
    // If the node being dragged is part of selectedIDs, sync start coordinates for ALL selected items.
    if (selectedIds.includes(id)) {
      dragStartPositions.current = {};
      selectedIds.forEach(sid => {
        const item = items.find(i => i.id === sid);
        if (item) {
          dragStartPositions.current[sid] = {
            x: item.canvasPosition?.x || 100,
            y: item.canvasPosition?.y || 100
          };
        }
      });
      dragDraggedStartPos.current = { x, y };
      setIsMultiDragging(true);
    } else {
      setIsMultiDragging(false);
    }
  };

  const handleDragMoveNode = (id: string, x: number, y: number) => {
    if (selectedIds.includes(id) && isMultiDragging) {
      const dx = x - dragDraggedStartPos.current.x;
      const dy = y - dragDraggedStartPos.current.y;
      setActiveDragDelta({ dx, dy });
    }
  };

  const handleDragEndNode = async (id: string, x: number, y: number) => {
    try {
      if (isMultiDragging) {
        const dx = x - dragDraggedStartPos.current.x;
        const dy = y - dragDraggedStartPos.current.y;
        
        // Persist final locations for all bulk dragged nodes
        for (const sid of selectedIds) {
          const sPos = dragStartPositions.current[sid];
          if (sPos) {
            const finalX = Math.round(sPos.x + dx);
            const finalY = Math.round(sPos.y + dy);
            await contentService.updatePosition(sid, finalX, finalY);
          }
        }
        setIsMultiDragging(false);
        setActiveDragDelta({ dx: 0, dy: 0 });
      } else {
        await contentService.updatePosition(id, Math.round(x), Math.round(y));
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to save position');
    }
  };

  // Node Clicking logic
  const handleSelectNode = (id: string, isShift: boolean) => {
    setSelectedContainerId(null);
    if (isShift) {
      setSelectedIds(prev => {
        if (prev.includes(id)) {
          return prev.filter(x => x !== id);
        } else {
          return [...prev, id];
        }
      });
    } else {
      setSelectedIds([id]);
    }
  };

  // Stage background clicking & Shift drag triggers
  const handleStageMouseDown = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelectedIds([]);
      setSelectedContainerId(null);
    }

    if (shiftPressed) {
      const stage = e.target.getStage();
      const pointer = stage.getPointerPosition();
      const x = (pointer.x - stage.x()) / stage.scaleX();
      const y = (pointer.y - stage.y()) / stage.scaleY();

      setSelectionArea({
        startX: x,
        startY: y,
        endX: x,
        endY: y,
        visible: true
      });
    }
  };

  const handleStageMouseMove = (e: any) => {
    if (selectionArea && selectionArea.visible) {
      const stage = e.target.getStage();
      const pointer = stage.getPointerPosition();
      const x = (pointer.x - stage.x()) / stage.scaleX();
      const y = (pointer.y - stage.y()) / stage.scaleY();

      setSelectionArea(prev => prev ? { ...prev, endX: x, endY: y } : null);
    }
  };

  const handleStageMouseUp = () => {
    if (selectionArea && selectionArea.visible) {
      const x1 = Math.min(selectionArea.startX, selectionArea.endX);
      const x2 = Math.max(selectionArea.startX, selectionArea.endX);
      const y1 = Math.min(selectionArea.startY, selectionArea.endY);
      const y2 = Math.max(selectionArea.startY, selectionArea.endY);

      // Collide boundary bounds
      const matching = filteredItems.filter(item => {
        const ix = item.canvasPosition?.x || 100;
        const iy = item.canvasPosition?.y || 100;
        const iw = item.canvasDimensions?.width || 220;
        const ih = item.canvasDimensions?.height || 80;

        return (ix < x2 && ix + iw > x1 && iy < y2 && iy + ih > y1);
      });

      setSelectedIds(matching.map(m => m.id));
      if (matching.length > 0) {
        toast.info(`Selected ${matching.length} items within the selection boundary.`);
      }
    }
    setSelectionArea(null);
  };

  // Container Dragging methods
  const handleContainerDragStart = (id: string, x: number, y: number) => {
    setSelectedContainerId(id);
    setSelectedIds([]);

    const container = containers.find(c => c.id === id);
    if (container) {
      dragStartContainerPos.current = { x, y };
      
      // Select items spatially inside container's bounds
      const nested = filteredItems.filter(item => isItemInContainer(item, container));
      dragStartNestedItemPositions.current = {};
      nested.forEach(ni => {
        dragStartNestedItemPositions.current[ni.id] = {
          x: ni.canvasPosition?.x || 100,
          y: ni.canvasPosition?.y || 100
        };
      });

      setIsDraggingContainerId(id);
    }
  };

  const handleContainerDragMove = (id: string, x: number, y: number) => {
    if (isDraggingContainerId === id) {
      const dx = x - dragStartContainerPos.current.x;
      const dy = y - dragStartContainerPos.current.y;
      setActiveContainerDragDelta({ dx, dy });
    }
  };

  const handleContainerDragEnd = async (id: string, x: number, y: number) => {
    if (isDraggingContainerId === id) {
      try {
        const dx = x - dragStartContainerPos.current.x;
        const dy = y - dragStartContainerPos.current.y;

        // Save container location
        await containerService.update(id, { x: Math.round(x), y: Math.round(y) });

        // Offset positions of all spatially grouped library cards
        for (const itemId in dragStartNestedItemPositions.current) {
          const orig = dragStartNestedItemPositions.current[itemId];
          await contentService.updatePosition(
            itemId, 
            Math.round(orig.x + dx), 
            Math.round(orig.y + dy)
          );
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to update container group positions");
      } finally {
        setIsDraggingContainerId(null);
        setActiveContainerDragDelta({ dx: 0, dy: 0 });
        dragStartNestedItemPositions.current = {};
      }
    }
  };

  // Spawn New Containers (organic blobs or collapsible blocks) in center of current viewpoint
  const handleCreateContainer = async (type: 'blob' | 'collapsible') => {
    if (!auth.currentUser) return;
    const centerScale = stageScale || 0.8;
    const viewWidth = dimensions.width || 800;
    const viewHeight = dimensions.height || 600;

    // Center viewport math
    const cx = Math.round((-stageX + viewWidth / 2) / centerScale - 200);
    const cy = Math.round((-stageY + viewHeight / 2) / centerScale - 150);

    const colors = ['#A855F7', '#EC4899', '#06B6D4', '#EAB308', '#EF4444', '#3B82F6', '#22C55E', '#10B981'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const containerData = {
      type,
      title: type === 'blob' ? 'Organic Cluster' : 'Foldable Section',
      x: cx,
      y: cy,
      width: 400,
      height: 300,
      collapsed: false,
      color: randomColor
    };

    const toastId = toast.loading(`Spawning canvas ${type}...`);
    try {
      await containerService.save(auth.currentUser.uid, containerData);
      toast.dismiss(toastId);
      toast.success(`Successfully created ${type} container at viewpoint center!`);
    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error(`Spawning container failed.`);
    }
  };

  // Toggle Collapse on sections
  const handleToggleCollapse = async (id: string) => {
    const container = containers.find(c => c.id === id);
    if (container) {
      try {
        await containerService.update(id, { collapsed: !container.collapsed });
        // Clear item selections to avoid viewport drift on hidden items
        setSelectedIds([]);
      } catch (err) {
        console.error(err);
        toast.error("Collapse state change failed");
      }
    }
  };

  // Delete containers
  const handleDeleteContainer = async (id: string) => {
    const container = containers.find(c => c.id === id);
    if (!container) return;
    const isBlob = container.type === 'blob';
    try {
      await containerService.delete(id);
      setSelectedContainerId(null);
      toast.success(`${isBlob ? 'Blob' : 'Folder'} deleted successfully.`);
    } catch (err) {
      console.error(err);
      toast.error("Delete container failed.");
    }
  };

  // Renaming utilities
  const handleDoubleClickContainer = (id: string) => {
    const container = containers.find(c => c.id === id);
    if (container) {
      setRenamingContainerId(id);
      setRenamingTitle(container.title);
    }
  };

  const handleSaveRename = async () => {
    if (!renamingContainerId) return;
    try {
      await containerService.update(renamingContainerId, { title: renamingTitle.trim() });
      toast.success("Container title updated.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to rename container");
    } finally {
      setRenamingContainerId(null);
    }
  };

  // Tag sorting algorithm helper
  const findSortedZoneName = (tags: string[]): string => {
    const lowerTags = (tags || []).map(t => t.trim().toLowerCase());
    
    // Explicit Instruction: Anything with '#metacrisis' goes under research
    if (lowerTags.includes('metacrisis')) {
      return 'RESEARCH';
    }

    // Direct associations first
    for (const tag of lowerTags) {
      if (tag === 'music' || tag === 'song' || tag === 'audio' || tag === 'sound' || tag === 'playlist' || tag === 'band' || tag === 'instrument') return 'MUSIC';
      if (tag === 'athlete' || tag === 'sport' || tag === 'fitness' || tag === 'workout' || tag === 'gym' || tag === 'running' || tag === 'health' || tag === 'body') return 'ATHLETE';
      if (tag === 'research' || tag === 'paper' || tag === 'study' || tag === 'academic' || tag === 'science' || tag === 'thesis' || tag === 'meta') return 'RESEARCH';
      if (tag === 'ai' || tag === 'ml' || tag === 'artificial intelligence' || tag === 'model' || tag === 'llm' || tag === 'chatgpt' || tag === 'prompt') return 'AI';
      if (tag === 'art' || tag === 'painting' || tag === 'aesthetic' || tag === 'drawing' || tag === 'paint' || tag === 'artist' || tag === 'illustration') return 'ART';
      if (tag === 'lab' || tag === 'experiment' || tag === 'code' || tag === 'testing' || tag === 'prototype' || tag === 'coding' || tag === 'developer') return 'LAB';
      if (tag === 'design' || tag === 'ui' || tag === 'ux' || tag === 'figma' || tag === 'layout' || tag === 'typography' || tag === 'wireframe') return 'DESIGN';
      if (tag === 'alchemy' || tag === 'magic' || tag === 'mystic' || tag === 'transmute' || tag === 'esoteric' || tag === 'spiritual' || tag === 'meditation' || tag === 'yoga') return 'ALCHEMY';
      if (tag === 'player' || tag === 'game' || tag === 'gaming' || tag === 'steam' || tag === 'xbox' || tag === 'play' || tag === 'puzzle') return 'PLAYER';
      if (tag === 'host' || tag === 'podcast' || tag === 'presenter' || tag === 'interview' || tag === 'video' || tag === 'hosting' || tag === 'youtube') return 'HOST';
      if (tag === 'log' || tag === 'journal' || tag === 'notes' || tag === 'history' || tag === 'daily' || tag === 'archive' || tag === 'diary') return 'LOG';
      if (tag === 'regen' || tag === 'ecology' || tag === 'sustainability' || tag === 'climate' || tag === 'green' || tag === 'nature' || tag === 'agriculture') return 'REGEN';
    }

    // Broad pattern matches
    for (const tag of lowerTags) {
      if (tag.includes('music') || tag.includes('sound') || tag.includes('song')) return 'MUSIC';
      if (tag.includes('gym') || tag.includes('fit') || tag.includes('run') || tag.includes('sport') || tag.includes('body')) return 'ATHLETE';
      if (tag.includes('research') || tag.includes('scientific') || tag.includes('academic') || tag.includes('paper') || tag.includes('thesis') || tag.includes('science')) return 'RESEARCH';
      if (tag.includes('ai') || tag.includes('llm') || tag.includes('artificial') || tag.includes('model') || tag.includes('intelligence') || tag.includes('gpt')) return 'AI';
      if (tag.includes('art') || tag.includes('paint') || tag.includes('photograph') || tag.includes('gallery')) return 'ART';
      if (tag.includes('code') || tag.includes('dev') || tag.includes('program') || tag.includes('github') || tag.includes('rust') || tag.includes('js') || tag.includes('ts')) return 'LAB';
      if (tag.includes('design') || tag.includes('ui') || tag.includes('ux') || tag.includes('canvas') || tag.includes('figma')) return 'DESIGN';
      if (tag.includes('magic') || tag.includes('alchemy') || tag.includes('spirit') || tag.includes('soul') || tag.includes('zen') || tag.includes('mindful') || tag.includes('yoga')) return 'ALCHEMY';
      if (tag.includes('game') || tag.includes('gaming') || tag.includes('play')) return 'PLAYER';
      if (tag.includes('host') || tag.includes('podcast') || tag.includes('vocal') || tag.includes('interview')) return 'HOST';
      if (tag.includes('journal') || tag.includes('note') || tag.includes('log') || tag.includes('diary')) return 'LOG';
      if (tag.includes('regen') || tag.includes('green') || tag.includes('climate') || tag.includes('earth') || tag.includes('sustainable') || tag.includes('nature') || tag.includes('eco')) return 'REGEN';
    }

    // Fallback zone
    return 'LOG';
  };

  // Perform Auto sort on selected nodes
  const handleAutoSortSelected = async () => {
    if (selectedIds.length === 0) {
      toast.error("Please click elements or Shift+drag select items to sort first!");
      return;
    }

    const toastId = toast.loading(`Auto-Sorting ${selectedIds.length} nodes to archetypes...`);
    const zoneCounts: Record<string, number> = {};

    try {
      for (const sid of selectedIds) {
        const item = filteredItems.find(i => i.id === sid);
        if (!item) continue;

        const zoneName = findSortedZoneName(item.tags || []);
        const count = zoneCounts[zoneName] || 0;
        zoneCounts[zoneName] = count + 1;

        const zoneObj = ZONES.find(zo => zo.name === zoneName) || ZONES.find(zo => zo.name === 'LOG')!;
        const zoneStartX = -2 * ZONE_W + zoneObj.col * ZONE_W;
        const zoneStartY = -1 * ZONE_H + zoneObj.row * ZONE_H;

        // Lay items out in simple grid row layout per archetype
        const cols = 5;
        const colWidth = 280;
        const rowHeight = 120;

        const c = count % cols;
        const r = Math.floor(count / cols);

        const targetX = Math.round(zoneStartX + 200 + c * colWidth);
        const targetY = Math.round(zoneStartY + 450 + r * rowHeight);

        await contentService.updatePosition(sid, targetX, targetY);
      }
      toast.dismiss(toastId);
      toast.success(`Successfully partitioned ${selectedIds.length} nodes to archetypes!`);
    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error("Auto sort failed.");
    }
  };

  // Bind the up-to-date delete container function to the ref
  useEffect(() => {
    handleDeleteContainerRef.current = handleDeleteContainer;
  }, [handleDeleteContainer]);

  // Track key listeners for Area Selection Mode and container deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftPressed(true);
      }
      
      // If user typing in inputs, ignore
      if (document.activeElement && (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' || 
        document.activeElement.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const curContainerId = selectedContainerIdRef.current;
        if (curContainerId) {
          e.preventDefault();
          handleDeleteContainerRef.current(curContainerId);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftPressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    const handleBlur = () => setShiftPressed(false);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Spatial Search Autocentering effect - centers first matching item when search query changes
  useEffect(() => {
    if (!searchQuery) return;
    const queryLower = searchQuery.toLowerCase();
    
    const matchedItem = visibleItems.find(item => 
      (item.title || '').toLowerCase().includes(queryLower) ||
      (item.description || '').toLowerCase().includes(queryLower)
    );

    if (matchedItem) {
      const ix = matchedItem.canvasPosition?.x || 100;
      const iy = matchedItem.canvasPosition?.y || 100;
      const iw = matchedItem.canvasDimensions?.width || 220;
      const ih = matchedItem.canvasDimensions?.height || 80;

      const viewWidth = dimensions.width || 800;
      const viewHeight = dimensions.height || 600;

      const currentScale = stageScale || 0.8;
      const targetX = Math.round(-(ix + iw / 2) * currentScale + viewWidth / 2);
      const targetY = Math.round(-(iy + ih / 2) * currentScale + viewHeight / 2);

      setStageX(targetX);
      setStageY(targetY);
    }
  }, [searchQuery, visibleItems.length, dimensions.width, dimensions.height]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#09090A] cursor-grab active:cursor-grabbing outline-none">
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stageX}
        y={stageY}
        draggable={!shiftPressed && (!selectionArea || !selectionArea.visible)}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMouseMove}
        onTouchEnd={handleStageMouseUp}
        onDragMove={(e) => {
          if (e.target === e.target.getStage()) {
            setStageX(e.target.x());
            setStageY(e.target.y());
          }
        }}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStageX(e.target.x());
            setStageY(e.target.y());
          }
        }}
      >
        <Layer>
          {/* Spatial Archetype Zones */}
          <Group listening={false}>
            {ZONES.map(z => {
              const startX = -2 * ZONE_W + z.col * ZONE_W;
              const startY = -1 * ZONE_H + z.row * ZONE_H;
              return (
                <Group key={z.name} x={startX} y={startY}>
                  <Rect
                    width={ZONE_W}
                    height={ZONE_H}
                    fill={z.color}
                    opacity={0.02}
                  />
                  <Rect
                    width={ZONE_W}
                    height={ZONE_H}
                    stroke={z.color}
                    strokeWidth={4}
                    opacity={0.15}
                    dash={[40, 20]}
                  />
                  <Text
                    x={80}
                    y={80}
                    text={z.name}
                    fontSize={160}
                    fontFamily="monospace"
                    fontStyle="bold"
                    fill={z.color}
                    opacity={0.15}
                    letterSpacing={10}
                  />
                </Group>
              );
            })}
          </Group>

          {/* Infinite Grid dot pattern background layer */}
          {gridPatternImage && (
            <Rect
              x={-8000}
              y={-8000}
              width={16000}
              height={16000}
              fillPatternImage={gridPatternImage as any}
              fillPatternRepeat="repeat"
              listening={false}
              perfectDrawEnabled={false}
            />
          )}

          {/* Group and collapsible folders container nodes */}
          {(containers || []).map(container => {
            const isSelected = selectedContainerId === container.id;
            const isResizing = resizingContainerId === container.id;

            const cWidth = isResizing ? resizingContainerWidth : (container.width || 400);
            const cHeight = isResizing ? resizingContainerHeight : (container.height || 300);

            // Fetch nested active library items inside it
            const nestedItems = filteredItems.filter(item => isItemInContainer(item, container));

            // Dynamic dragging offsets
            const isDraggingThis = isDraggingContainerId === container.id;
            const renderingX = container.x + (isDraggingThis ? activeContainerDragDelta.dx : 0);
            const renderingY = container.y + (isDraggingThis ? activeContainerDragDelta.dy : 0);

            return (
              <ContainerNode
                key={container.id}
                container={{
                  ...container,
                  x: renderingX,
                  y: renderingY,
                  width: cWidth,
                  height: cHeight
                }}
                isSelected={isSelected}
                itemCount={nestedItems.length}
                onSelect={(cid) => {
                  setSelectedContainerId(cid);
                  setSelectedIds([]);
                }}
                onDragStart={handleContainerDragStart}
                onDragMove={handleContainerDragMove}
                onDragEnd={handleContainerDragEnd}
                onResizeStart={(cid) => {
                  setResizingContainerId(cid);
                  setResizingContainerWidth(container.width || 400);
                  setResizingContainerHeight(container.height || 300);
                }}
                onResizeMove={(cid, rw, rh) => {
                  setResizingContainerWidth(rw);
                  setResizingContainerHeight(rh);
                }}
                onResizeEnd={async (cid, rw, rh) => {
                  setResizingContainerId(null);
                  try {
                    await containerService.update(cid, { width: Math.round(rw), height: Math.round(rh) });
                  } catch (err) {
                    console.error(err);
                    toast.error("Container resize failed to persist");
                  }
                }}
                onToggleCollapse={handleToggleCollapse}
                onDoubleClick={handleDoubleClickContainer}
                onDelete={handleDeleteContainer}
              />
            );
          })}

          {/* Library resource cards nodes */}
          {visibleItems.map(item => {
            const isSelected = selectedIds.includes(item.id);
            const isResizing = resizingId === item.id;
            const width = isResizing ? resizingWidth : (item.canvasDimensions?.width || 220);
            const height = isResizing ? resizingHeight : (item.canvasDimensions?.height || 80);

            // Compute actual coordinates with drag offset mapping
            let itemX = item.canvasPosition?.x || 100;
            let itemY = item.canvasPosition?.y || 100;

            if (isSelected && isMultiDragging) {
              itemX = (dragStartPositions.current[item.id]?.x ?? itemX) + activeDragDelta.dx;
              itemY = (dragStartPositions.current[item.id]?.y ?? itemY) + activeDragDelta.dy;
            } else if (isDraggingContainerId) {
              // Offset visually if its parent section is being dragged
              const hasThisItem = dragStartNestedItemPositions.current[item.id] !== undefined;
              if (hasThisItem) {
                const startNestedPos = dragStartNestedItemPositions.current[item.id];
                itemX = startNestedPos.x + activeContainerDragDelta.dx;
                itemY = startNestedPos.y + activeContainerDragDelta.dy;
              }
            }

            const isSearchMatch = searchQuery ? (
              (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
              (item.description || '').toLowerCase().includes(searchQuery.toLowerCase())
            ) : false;

            return (
              <ItemNode 
                key={item.id} 
                item={item} 
                width={width}
                height={height}
                x={itemX}
                y={itemY}
                isSelected={isSelected}
                isSearchMatch={isSearchMatch}
                onDragStart={handleDragStartNode}
                onDragMove={handleDragMoveNode}
                onDragEnd={handleDragEndNode} 
                onSelect={handleSelectNode}
                onResizeStart={(id) => {
                  setResizingId(id);
                  setResizingWidth(item.canvasDimensions?.width || 220);
                  setResizingHeight(item.canvasDimensions?.height || 80);
                }}
                onResize={(w, h) => {
                  setResizingWidth(w);
                  setResizingHeight(h);
                }}
                onResizeEnd={async (id, w, h) => {
                  setResizingId(null);
                  try {
                    await contentService.updateDimensions(id, Math.round(w), Math.round(h));
                  } catch (err) {
                    console.error(err);
                    toast.error("Failed to save dimensions");
                  }
                }}
                onClick={() => setEditingItem(item)}
              />
            );
          })}

          {/* Shift Drag Area Selection dashed borders rectangle visual indicator */}
          {selectionArea && selectionArea.visible && (
            <Rect
              x={Math.min(selectionArea.startX, selectionArea.endX)}
              y={Math.min(selectionArea.startY, selectionArea.endY)}
              width={Math.abs(selectionArea.endX - selectionArea.startX)}
              height={Math.abs(selectionArea.endY - selectionArea.startY)}
              fill="rgba(99, 102, 241, 0.08)"
              stroke="#6366F1"
              strokeWidth={1.5}
              dash={[6, 3]}
            />
          )}
        </Layer>
      </Stage>
      
      {/* HUD Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap items-center justify-center gap-1.5 p-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded shadow-2xl pointer-events-auto max-w-[90vw]">
        <button className="p-1 px-2 hover:bg-white/10 rounded text-white/60 hover:text-white flex items-center justify-center cursor-pointer" onClick={() => setStageScale(s => s * 1.1)} title="Zoom In"><Plus size={13} /></button>
        <span className="px-1 text-[9px] font-mono font-bold text-indigo-400 min-w-[32px] text-center select-none">{Math.round(stageScale * 100)}%</span>
        <button className="p-1 px-2 hover:bg-white/10 rounded text-white/60 hover:text-white flex items-center justify-center cursor-pointer" onClick={() => setStageScale(s => s / 1.1)} title="Zoom Out"><Minus size={13} /></button>
        
        <div className="w-px h-3.5 bg-white/20 mx-1"></div>
        
        <button 
          onClick={() => { setStageScale(0.8); setStageX(0); setStageY(0); }}
          className="px-2 py-1 hover:bg-white/10 rounded text-[9px] text-white/70 uppercase font-bold cursor-pointer font-mono"
          title="Reset Zoom & Pan"
        >
          RESET
        </button>

        <div className="w-px h-3.5 bg-white/20 mx-1"></div>

        {/* Create Blobs, collapsible rectangular sections, and auto-sort trigger buttons */}
        <button 
          onClick={() => handleCreateContainer('blob')}
          className="px-2.5 py-1.5 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 rounded text-[11px] text-purple-200 cursor-pointer flex items-center justify-center active:scale-95 transition-all"
          title="Spawn an organic hand-drawn folder blob at center"
        >
          <span>✏️</span>
        </button>

        <button 
          onClick={() => handleCreateContainer('collapsible')}
          className="px-2.5 py-1.5 bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 rounded text-[11px] text-blue-200 cursor-pointer flex items-center justify-center active:scale-95 transition-all"
          title="Spawn a collapsible rect category folder at center"
        >
          <span>📁</span>
        </button>

        <div className="w-px h-3.5 bg-white/20 mx-1"></div>

        <button 
          onClick={handleAutoSortSelected}
          disabled={selectedIds.length === 0}
          className={`px-2.5 py-1.5 rounded text-[11px] cursor-pointer flex items-center justify-center active:scale-95 transition-all ${
            selectedIds.length > 0 
              ? "bg-indigo-600 border border-indigo-500 hover:bg-indigo-500 text-white" 
              : "bg-white/5 border border-white/12 text-white/30 cursor-not-allowed"
          }`}
          title="Organize / Partition your selected nodes spatially according to tag associations"
        >
          <span>⚡</span>
        </button>

        {selectedContainerId && (() => {
          const selContainer = containers.find(c => c.id === selectedContainerId);
          if (!selContainer) return null;
          const colors = [
            '#818CF8', // default Indigo
            '#F472B6', // Pink
            '#10B981', // Emerald
            '#FBBF24', // Amber
            '#EF4444', // Red
            '#A78BFA', // Purple
            '#38BDF8', // Sky Blue
            '#F97316', // Orange
          ];
          return (
            <>
              <div className="w-px h-3.5 bg-white/20 mx-1"></div>
              <div className="flex items-center gap-1 bg-white/5 rounded px-1.5 py-1" title="Change Container Color">
                {colors.map(col => {
                  const isActive = (selContainer.color || '#818CF8') === col;
                  return (
                    <button
                      key={col}
                      onClick={async () => {
                        try {
                          await containerService.update(selContainer.id, { color: col });
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to update color.");
                        }
                      }}
                      className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-all hover:scale-125 ${
                        isActive ? 'ring-2 ring-white scale-110' : 'opacity-85'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  );
                })}
              </div>
              <button
                onClick={async () => {
                  try {
                    await containerService.update(selContainer.id, { subtle: !selContainer.subtle });
                  } catch (err) {
                    console.error(err);
                    toast.error("Failed to update container styling");
                  }
                }}
                className={`ml-1.5 px-2 py-1.5 rounded text-[10px] font-bold font-mono tracking-wider transition-all select-none cursor-pointer flex items-center gap-1 border h-[24px] ${
                  selContainer.subtle 
                    ? "bg-indigo-600/30 text-indigo-400 border-indigo-500/40" 
                    : "bg-white/5 text-white/30 border-white/5 hover:text-white/60 hover:bg-white/10"
                }`}
                title="Toggle subtle styling (transparent background, colored border only)"
              >
                <span>💧 SUBTLE</span>
              </button>
            </>
          );
        })()}
      </div>

      {/* Inline Renaming Dialogue Popover (avoids iframe pop-up blocks) */}
      {renamingContainerId && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-[#161618] border border-white/15 rounded p-4 shadow-2xl flex flex-col gap-3">
            <span className="text-[9px] uppercase font-bold text-indigo-400 tracking-wider font-mono">RENAME_CORE_CONTAINER</span>
            <input 
              type="text" 
              value={renamingTitle}
              onChange={(e) => setRenamingTitle(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
              placeholder="Enter title..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setRenamingContainerId(null);
              }}
            />
            <div className="flex gap-2 justify-end mt-1">
              <button 
                onClick={() => setRenamingContainerId(null)}
                className="px-3 py-1.5 rounded text-[9px] uppercase font-bold text-white/40 hover:text-white"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveRename}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[9px] uppercase font-bold tracking-wider"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Node detailed modal form */}
      <EditContentModal 
        item={editingItem} 
        isOpen={!!editingItem} 
        onClose={() => setEditingItem(null)} 
      />

      {/* Instructional HUD indicators */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 pointer-events-none select-none max-w-[85vw]">
        <div className="bg-black/70 backdrop-blur px-3 py-2 rounded border border-white/10 text-[9px] font-mono uppercase tracking-widest text-white/45 flex flex-col gap-1">
          <span>SELECT: SHIFT+CLICK / MULTI-DRAG // AREA SEL: SHIFT+DRAG CANVAS</span>
          <span>SPAWN GROUPS: USE TOP HUD BUTTONS // RENAMING: DOUBLE-CLICK TITLE</span>
          <span>COLLAPSIBLE SECION: CLICK [+] OR [−] BUTTON TO BULK HIDE OR EXPAND</span>
        </div>
      </div>
    </div>
  );
}
