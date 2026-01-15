import type { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 5;

export function useTerminalScrollToBottom(terminal: Terminal | null) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Monitor scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    if (!terminal) return;

    const checkScrollPosition = () => {
      const buffer = terminal.buffer.active;
      const scrollFromBottom = buffer.baseY - buffer.viewportY;
      setShowScrollToBottom(scrollFromBottom > SCROLL_THRESHOLD);
    };

    const scrollDisposable = terminal.onScroll(checkScrollPosition);
    const lineFeedDisposable = terminal.onLineFeed(checkScrollPosition);

    return () => {
      scrollDisposable.dispose();
      lineFeedDisposable.dispose();
    };
  }, [terminal]);

  const handleScrollToBottom = useCallback(() => {
    if (!terminal) return;

    const buffer = terminal.buffer.active;
    const linesToScroll = buffer.baseY - buffer.viewportY;

    if (linesToScroll <= 0) {
      setShowScrollToBottom(false);
      return;
    }

    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Smooth scroll animation
    const duration = Math.min(300, linesToScroll * 10);
    const startTime = performance.now();
    const startPos = buffer.viewportY;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - (1 - progress) ** 3;
      const targetLine = Math.round(startPos + linesToScroll * eased);
      const currentLine = terminal.buffer.active.viewportY;

      if (targetLine > currentLine) {
        terminal.scrollLines(targetLine - currentLine);
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        terminal.scrollToBottom();
        setShowScrollToBottom(false);
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [terminal]);

  return { showScrollToBottom, handleScrollToBottom };
}
