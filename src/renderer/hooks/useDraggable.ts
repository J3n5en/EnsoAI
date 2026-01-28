import { useCallback, useEffect, useRef, useState } from 'react';

interface UseDraggableOptions {
  initialPosition: { x: number; y: number } | null;
  bounds?: { width: number; height: number }; // 元素尺寸
  containerBounds?: { width: number; height: number }; // 容器尺寸 (默认 window)
  minVisibleArea?: { x: number; y: number }; // 最小可见区域
  onPositionChange?: (position: { x: number; y: number }) => void;
}

export function useDraggable({
  initialPosition,
  bounds = { width: 0, height: 0 },
  containerBounds,
  minVisibleArea = { x: 32, y: 32 },
  onPositionChange,
}: UseDraggableOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  // 计算边界约束
  const clampPosition = useCallback(
    (pos: { x: number; y: number }) => {
      const container = containerBounds || {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      const minX = -bounds.width + minVisibleArea.x;
      const maxX = container.width - minVisibleArea.x;
      const minY = 0;
      const maxY = container.height - minVisibleArea.y;

      return {
        x: Math.max(minX, Math.min(pos.x, maxX)),
        y: Math.max(minY, Math.min(pos.y, maxY)),
      };
    },
    [bounds, containerBounds, minVisibleArea]
  );

  // 初始化位置（居中或使用保存的位置）
  useEffect(() => {
    if (initialPosition) {
      setPosition(clampPosition(initialPosition));
    } else {
      // 默认居中
      const container = containerBounds || {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const centered = {
        x: (container.width - bounds.width) / 2,
        y: (container.height - bounds.height) / 2,
      };
      setPosition(clampPosition(centered));
    }
  }, [initialPosition, bounds, containerBounds, clampPosition]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const newPos = {
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y,
      };

      setPosition(clampPosition(newPos));
    },
    [isDragging, clampPosition]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onPositionChange?.(position);
    }
  }, [isDragging, position, onPositionChange]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return {
    position,
    isDragging,
    dragHandlers: {
      onMouseDown: handleMouseDown,
    },
  };
}
