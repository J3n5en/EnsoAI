import { ScrollText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

interface CodexViewSessionButtonProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isTranscriptOpen: boolean;
  onClick: () => void;
}

const BUTTON_SIZE = 36;
const VIEW_BTN_LAYOUT_SETTLE_FRAMES = 3;
const VIEW_BTN_BOUNDS_EPSILON = 0.5;

function isBoundsStable(previous: DOMRect, next: DOMRect) {
  return (
    Math.abs(previous.width - next.width) < VIEW_BTN_BOUNDS_EPSILON &&
    Math.abs(previous.height - next.height) < VIEW_BTN_BOUNDS_EPSILON &&
    Math.abs(previous.left - next.left) < VIEW_BTN_BOUNDS_EPSILON &&
    Math.abs(previous.top - next.top) < VIEW_BTN_BOUNDS_EPSILON
  );
}

interface CodexViewSessionButtonInnerProps {
  containerBounds: DOMRect;
  initialPosition: { x: number; y: number };
  isTranscriptOpen: boolean;
  onClick: () => void;
}

function CodexViewSessionButtonInner({
  containerBounds,
  initialPosition,
  isTranscriptOpen,
  onClick,
}: CodexViewSessionButtonInnerProps) {
  const { t } = useI18n();
  const setCodexViewSessionButtonPosition = useSettingsStore(
    (s) => s.setCodexViewSessionButtonPosition
  );

  // Handle position change: convert { x, y } back to { top, right }
  const handlePositionChange = useCallback(
    (position: { x: number; y: number }) => {
      const top = position.y - containerBounds.top;
      const right = containerBounds.width - (position.x - containerBounds.left) - BUTTON_SIZE;

      setCodexViewSessionButtonPosition({ top, right });
    },
    [containerBounds, setCodexViewSessionButtonPosition]
  );

  const { position, isDragging, hasDragged, dragHandlers } = useDraggable({
    initialPosition,
    bounds: { width: BUTTON_SIZE, height: BUTTON_SIZE },
    containerBounds: containerBounds
      ? {
          width: containerBounds.width,
          height: containerBounds.height,
          left: containerBounds.left,
          top: containerBounds.top,
        }
      : undefined,
    onPositionChange: handlePositionChange,
  });

  const handleClick = (e: React.MouseEvent) => {
    // Prevent click if dragged
    if (hasDragged) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      {...dragHandlers}
      className={cn(
        'absolute z-10 flex items-center justify-center rounded-full',
        'border backdrop-blur-sm',
        'shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.16)]',
        isDragging && 'cursor-grabbing opacity-70 scale-95',
        !isDragging && 'cursor-grab transition-transform duration-100 active:scale-95',
        isTranscriptOpen
          ? 'bg-accent text-accent-foreground border-accent/50'
          : 'bg-background/95 text-muted-foreground border-border/50 hover:bg-accent/30 hover:text-foreground hover:border-accent/30'
      )}
      style={{
        left: `${position.x - containerBounds.left}px`,
        top: `${position.y - containerBounds.top}px`,
        width: `${BUTTON_SIZE}px`,
        height: `${BUTTON_SIZE}px`,
      }}
      title={t('View Session')}
    >
      <ScrollText className="h-4 w-4" />
    </button>
  );
}

export function CodexViewSessionButton({
  containerRef,
  isTranscriptOpen,
  onClick,
}: CodexViewSessionButtonProps) {
  const savedPosition = useSettingsStore((s) => s.codexViewSessionButtonPosition);
  const [containerBounds, setContainerBounds] = useState<DOMRect | null>(null);
  const [isLayoutSettled, setIsLayoutSettled] = useState(false);
  const [isSettingsHydrated, setIsSettingsHydrated] = useState(() =>
    useSettingsStore.persist.hasHydrated()
  );
  const frameRef = useRef<number | null>(null);

  const updateContainerBounds = useCallback(() => {
    if (!containerRef.current) return null;
    return containerRef.current.getBoundingClientRect();
  }, [containerRef]);

  useEffect(() => {
    setIsSettingsHydrated(useSettingsStore.persist.hasHydrated());

    const unsubscribeHydrate = useSettingsStore.persist.onHydrate(() => {
      setIsSettingsHydrated(false);
    });
    const unsubscribeFinishHydration = useSettingsStore.persist.onFinishHydration(() => {
      setIsSettingsHydrated(true);
    });

    return () => {
      unsubscribeHydrate();
      unsubscribeFinishHydration();
    };
  }, []);

  useEffect(() => {
    let previousBounds: DOMRect | null = null;
    let stableFrameCount = 0;

    const stopMeasure = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const measure = () => {
      const bounds = updateContainerBounds();
      if (!bounds) {
        frameRef.current = requestAnimationFrame(measure);
        return;
      }

      setContainerBounds(bounds);

      if (previousBounds && isBoundsStable(previousBounds, bounds)) {
        stableFrameCount += 1;
      } else {
        stableFrameCount = 1;
      }

      previousBounds = bounds;

      if (stableFrameCount >= VIEW_BTN_LAYOUT_SETTLE_FRAMES) {
        setIsLayoutSettled(true);
        frameRef.current = null;
        return;
      }

      frameRef.current = requestAnimationFrame(measure);
    };

    const startMeasure = () => {
      stopMeasure();
      previousBounds = null;
      stableFrameCount = 0;
      setIsLayoutSettled(false);
      frameRef.current = requestAnimationFrame(measure);
    };

    startMeasure();

    const observer = new ResizeObserver(() => {
      startMeasure();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      stopMeasure();
    };
  }, [containerRef, updateContainerBounds]);

  const initialPosition = useMemo(() => {
    if (!isSettingsHydrated || !savedPosition || !containerBounds) {
      return null;
    }

    return {
      x: containerBounds.left + containerBounds.width - savedPosition.right - BUTTON_SIZE,
      y: containerBounds.top + savedPosition.top,
    };
  }, [containerBounds, isSettingsHydrated, savedPosition]);

  if (!isSettingsHydrated || !isLayoutSettled || !containerBounds || !initialPosition) {
    return null;
  }

  return (
    <CodexViewSessionButtonInner
      containerBounds={containerBounds}
      initialPosition={initialPosition}
      isTranscriptOpen={isTranscriptOpen}
      onClick={onClick}
    />
  );
}
