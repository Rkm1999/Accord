import { useCallback, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';

export const useLongPress = (onLongPress: (e: any) => void, { delay = 600 } = {}) => {
  const timeout = useRef<number | null>(null);
  const isLongPressActive = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const draggingSide = useUIStore(state => state.draggingSide);

  const cancel = useCallback(() => {
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  const start = useCallback((e: any) => {
    // Don't start if sidebar is being dragged
    if (draggingSide) return;

    const touch = e.touches ? e.touches[0] : e;
    startPos.current = { x: touch.clientX, y: touch.clientY };
    
    isLongPressActive.current = false;
    if (timeout.current) clearTimeout(timeout.current);
    
    timeout.current = window.setTimeout(() => {
      onLongPress(e);
      isLongPressActive.current = true;
    }, delay);
  }, [onLongPress, delay, draggingSide]);

  const stop = useCallback(() => {
    cancel();
  }, [cancel]);

  const move = useCallback((e: any) => {
    if (!timeout.current) return;
    
    const touch = e.touches ? e.touches[0] : e;
    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);
    
    // Cancel on any significant movement (scrolling or swiping)
    if (dx > 10 || dy > 10) {
      cancel();
    }
  }, [cancel]);

  return {
    handlers: {
      onMouseDown: start,
      onMouseUp: stop,
      onMouseLeave: stop,
      onTouchStart: start,
      onTouchMove: move,
      onTouchEnd: stop,
    },
    cancel
  };
};
