import { useCallback, useEffect, useRef, useState } from 'react';

interface UseDraggableOptions {
  initialPosition: { x: number; y: number } | null;
  bounds?: { width: number; height: number }; // 元素尺寸
  containerBounds?: { width: number; height: number; left?: number; top?: number }; // 容器尺寸和偏移
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
  const [hasDragged, setHasDragged] = useState(false); // 跟踪是否真正拖动过
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialDragPosition = useRef({ x: 0, y: 0 }); // 记录拖动开始时的位置

  // 计算边界约束
  const clampPosition = useCallback(
    (pos: { x: number; y: number }) => {
      const container = containerBounds || {
        width: window.innerWidth,
        height: window.innerHeight,
        left: 0,
        top: 0,
      };

      // 如果提供了容器偏移（fixed 定位场景），使用绝对坐标
      if (container.left !== undefined && container.top !== undefined) {
        const minX = container.left;
        const maxX = container.left + container.width - bounds.width;
        const minY = container.top;
        const maxY = container.top + container.height - bounds.height;

        return {
          x: Math.max(minX, Math.min(pos.x, maxX)),
          y: Math.max(minY, Math.min(pos.y, maxY)),
        };
      }

      // 默认逻辑（相对定位）
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

  // 使用 useState 初始化函数，只执行一次
  const [position, setPosition] = useState(() => {
    if (initialPosition) {
      return clampPosition(initialPosition);
    }
    // 默认居中
    const container = containerBounds || {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    return clampPosition({
      x: (container.width - bounds.width) / 2,
      y: (container.height - bounds.height) / 2,
    });
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      setHasDragged(false); // 重置拖动标记
      initialDragPosition.current = { x: position.x, y: position.y }; // 记录初始位置
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

      // 如果移动距离超过 5px，认为是拖动而非点击
      if (!hasDragged) {
        const dx = newPos.x - initialDragPosition.current.x;
        const dy = newPos.y - initialDragPosition.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 5) {
          setHasDragged(true);
        }
      }

      setPosition(clampPosition(newPos));
    },
    [isDragging, clampPosition, hasDragged]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onPositionChange?.(position);
      // 延迟重置 hasDragged，让 click 事件能够检测到
      setTimeout(() => setHasDragged(false), 100);
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

  // 窗口 resize 时重新验证位置
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition]);

  return {
    position,
    isDragging,
    hasDragged, // 是否真正发生了拖动
    dragHandlers: {
      onMouseDown: handleMouseDown,
    },
  };
}
