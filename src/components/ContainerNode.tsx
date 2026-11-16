import { Group, Rect, Text, Circle } from 'react-konva';

interface ContainerNodeProps {
  container: {
    id: string;
    type: 'blob' | 'collapsible';
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    collapsed: boolean;
    color: string;
    subtle?: boolean;
  };
  isSelected: boolean;
  itemCount: number;
  onSelect: (id: string) => void;
  onDragStart: (id: string, x: number, y: number) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onResizeStart: (id: string) => void;
  onResizeMove: (id: string, w: number, h: number) => void;
  onResizeEnd: (id: string, w: number, h: number) => void;
  onToggleCollapse: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ContainerNode({
  container,
  isSelected,
  itemCount,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onToggleCollapse,
  onDoubleClick,
  onDelete
}: ContainerNodeProps) {
  const { id, type, title, x, y, width, height, collapsed, color, subtle } = container;

  // Render variables
  const isBlob = type === 'blob';
  const displayTitle = title || (isBlob ? 'NEW_BLOB' : 'COLLAPSIBLE_GROUP');
  const actualHeight = (type === 'collapsible' && collapsed) ? 40 : height;
  const cardColor = color || '#818CF8';

  return (
    <Group
      x={x}
      y={y}
      draggable
      onDragStart={(e) => {
        if (e.target === e.currentTarget) {
          e.cancelBubble = true;
          onDragStart(id, e.target.x(), e.target.y());
        }
      }}
      onDragMove={(e) => {
        if (e.target === e.currentTarget) {
          e.cancelBubble = true;
          onDragMove(id, e.target.x(), e.target.y());
        }
      }}
      onDragEnd={(e) => {
        if (e.target === e.currentTarget) {
          e.cancelBubble = true;
          onDragEnd(id, e.target.x(), e.target.y());
        }
      }}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect(id);
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect(id);
      }}
      onDblClick={(e) => {
        e.cancelBubble = true;
        onDoubleClick(id);
      }}
      onDblTap={(e) => {
        e.cancelBubble = true;
        onDoubleClick(id);
      }}
    >
      {/* Background shape */}
      {isBlob ? (
        // Organic organic shape (Hand-drawn feel using wavy irregular corner values)
        <Rect
          width={width}
          height={height}
          fill={subtle ? "rgba(0,0,0,0)" : `${cardColor}0D`} // transparent vs 5% fill opacity
          stroke={cardColor}
          strokeWidth={isSelected ? 2 : 1.5}
          dash={[10, 6]}
          cornerRadius={[
            Math.min(width, height) * 0.4,
            Math.min(width, height) * 0.35,
            Math.min(width, height) * 0.45,
            Math.min(width, height) * 0.3
          ]}
        />
      ) : (
        // Collapsible rectangular form
        <Group>
          {/* Main rectangular box */}
          <Rect
            width={width}
            height={actualHeight}
            fill="#121214cc" // semi translucent dark backing
            stroke={isSelected ? cardColor : `${cardColor}40`}
            strokeWidth={isSelected ? 2 : 1}
            cornerRadius={8}
          />
          {/* Header Bar */}
          <Rect
            width={width}
            height={40}
            fill={`${cardColor}15`}
            cornerRadius={[8, 8, 0, 0]}
          />
          
          {/* Collapse/Expand Toggle Area (visual interactive element) */}
          <Group 
            x={16} 
            y={12}
            onClick={(e) => {
              e.cancelBubble = true;
              onToggleCollapse(id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onToggleCollapse(id);
            }}
          >
            <Rect
              width={16}
              height={16}
              fill={`${cardColor}30`}
              cornerRadius={3}
            />
            <Text
              text={collapsed ? '+' : '−'}
              x={0}
              y={collapsed ? 2 : 1}
              width={16}
              height={16}
              align="center"
              fontSize={11}
              fontStyle="bold"
              fill={cardColor}
            />
          </Group>
        </Group>
      )}

      {/* Title block */}
      <Text
        x={isBlob ? 24 : 44}
        y={15}
        text={displayTitle}
        fontFamily="sans-serif"
        fontSize={12}
        fontStyle="bold"
        fill={isBlob ? `${cardColor}cc` : '#FFFFFF'}
        width={width - 100}
        ellipsis={true}
        wrap="none"
      />

      {/* Metadata Indicators: Item Count & Group Info */}
      <Text
        x={isBlob ? 24 : 44}
        y={isBlob ? 32 : 15}
        text={isBlob ? `(${itemCount} NODES)` : ` `}
        fontFamily="monospace"
        fontSize={8}
        fill={`${cardColor}80`}
      />
      
      {!isBlob && (
        <Text
          x={width - (isSelected ? 90 : 70)}
          y={15}
          text={collapsed ? `HIDING ${itemCount}` : `SHOWN: ${itemCount}`}
          fontFamily="monospace"
          fontSize={8}
          fontStyle="bold"
          fill={collapsed ? '#FDA4AF' : `${cardColor}bb`}
          align="right"
          width={60}
        />
      )}

      {/* Selected Controls overlay: Resizing Handles */}
      {isSelected && (
        <Group>
          {/* Corner Resize Handle (bottom right corner) */}
          {(!collapsed || isBlob) && (
            <Group
              x={width}
              y={actualHeight}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true;
                onResizeStart(id);
              }}
              onDragMove={(e) => {
                e.cancelBubble = true;
                const newW = Math.max(160, e.target.x());
                const newH = Math.max(isBlob ? 120 : 80, e.target.y());
                e.target.x(newW);
                e.target.y(newH);
                onResizeMove(id, newW, newH);
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                const finalW = Math.max(160, e.target.x());
                const finalH = Math.max(isBlob ? 120 : 80, e.target.y());
                onResizeEnd(id, finalW, finalH);
              }}
            >
              <Circle
                x={0}
                y={0}
                radius={12}
                fill={cardColor}
                stroke="#121214"
                strokeWidth={2}
                shadowColor="#000000"
                shadowBlur={4}
                shadowOpacity={0.4}
              />
              <Text
                text="⤡"
                x={-6}
                y={-6}
                fontSize={10}
                fontStyle="bold"
                fill="#FFFFFF"
                align="center"
              />
            </Group>
          )}
        </Group>
      )}
    </Group>
  );
}
