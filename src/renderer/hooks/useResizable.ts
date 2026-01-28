import { useCallback, useEffect, useRef, useState } from 'react';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface UseResizableOptions {
  initialSize: { width: number; height: number } | null;
  initialPosition: { x: number; y: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  onSizeChange?: (size: { width: number; height: number }) => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
}

export function useResizable({
  initialSize,
  initialPosition,
  minSize = { width: 400, height: 300 },
  maxSize = { width: window.innerWidth, height: window.innerHeight },
  onSizeChange,
  onPositionChange,
}: UseResizableOptions) {
  const [size, setSize] = useState(initialSize || { width: 800, height: 600 });
  const [position, setPosition] = useState(initialPosition);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection | null>(null);

  const resizeStartRef = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    posX: 0,
    posY: 0,
  });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: ResizeDirection) => {
      e.stopPropagation();
      setIsResizing(true);
      setResizeDirection(direction);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
        posX: position.x,
        posY: position.y,
      };
    },
    [size, position]
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !resizeDirection) return;

      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;

      let newWidth = resizeStartRef.current.width;
      let newHeight = resizeStartRef.current.height;
      let newX = resizeStartRef.current.posX;
      let newY = resizeStartRef.current.posY;

      // 根据方向调整尺寸和位置
      if (resizeDirection.includes('e')) {
        newWidth = Math.max(
          minSize.width,
          Math.min(maxSize.width, resizeStartRef.current.width + dx)
        );
      }
      if (resizeDirection.includes('w')) {
        const maxDx = resizeStartRef.current.width - minSize.width;
        const constrainedDx = Math.max(-maxDx, Math.min(dx, resizeStartRef.current.posX));
        newWidth = resizeStartRef.current.width - constrainedDx;
        newX = resizeStartRef.current.posX + constrainedDx;
      }
      if (resizeDirection.includes('s')) {
        newHeight = Math.max(
          minSize.height,
          Math.min(maxSize.height, resizeStartRef.current.height + dy)
        );
      }
      if (resizeDirection.includes('n')) {
        const maxDy = resizeStartRef.current.height - minSize.height;
        const constrainedDy = Math.max(-maxDy, Math.min(dy, resizeStartRef.current.posY));
        newHeight = resizeStartRef.current.height - constrainedDy;
        newY = resizeStartRef.current.posY + constrainedDy;
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    },
    [isResizing, resizeDirection, minSize, maxSize]
  );

  const handleResizeEnd = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      setResizeDirection(null);
      onSizeChange?.(size);
      onPositionChange?.(position);
    }
  }, [isResizing, size, position, onSizeChange, onPositionChange]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  const getResizeHandleProps = useCallback(
    (direction: ResizeDirection) => ({
      onMouseDown: (e: React.MouseEvent) => handleResizeStart(e, direction),
    }),
    [handleResizeStart]
  );

  return {
    size,
    position,
    setPosition,
    isResizing,
    resizeDirection,
    getResizeHandleProps,
  };
}
