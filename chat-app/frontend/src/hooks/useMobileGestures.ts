import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';

export const useMobileGestures = () => {
  const { 
    leftSidebarOpen, rightSidebarOpen, toggleLeftSidebar, toggleRightSidebar,
    sidebarSwipeOffset, setSidebarSwipeOffset, setDraggingSide
  } = useUIStore();
  
  const startX = useRef(0);
  const startY = useRef(0);
  const draggingSidebarRef = useRef<'left' | 'right' | null>(null);
  const edgeThreshold = 40;
  const sidebarWidth = 240;

  useEffect(() => {
    if (window.innerWidth >= 1024) return;

    const handleTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      
      let side: 'left' | 'right' | null = null;
      if (leftSidebarOpen) {
        if (startX.current < sidebarWidth) side = 'left';
      } else if (rightSidebarOpen) {
        if (startX.current > window.innerWidth - sidebarWidth) side = 'right';
      } else {
        if (startX.current < edgeThreshold) side = 'left';
        else if (startX.current > window.innerWidth - edgeThreshold) side = 'right';
      }
      
      draggingSidebarRef.current = side;
      // DON'T setDraggingSide here, wait for move to distinguish from tap
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!draggingSidebarRef.current) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - startX.current;
      const diffY = currentY - startY.current;

      // Small jitter threshold to distinguish from a simple tap
      if (Math.abs(diffX) < 5 && Math.abs(diffY) < 5) return;

      // Ignore if vertical scroll is dominant initially
      if (Math.abs(diffY) > Math.abs(diffX) && sidebarSwipeOffset === 0) {
        draggingSidebarRef.current = null;
        setDraggingSide(null);
        return;
      }

      setDraggingSide(draggingSidebarRef.current);

      if (draggingSidebarRef.current === 'left') {
        let offset = leftSidebarOpen ? (sidebarWidth + diffX) : diffX;
        offset = Math.min(Math.max(offset, 0), sidebarWidth);
        setSidebarSwipeOffset(offset);
      } else if (draggingSidebarRef.current === 'right') {
        let offset = rightSidebarOpen ? (sidebarWidth - diffX) : -diffX;
        offset = Math.min(Math.max(offset, 0), sidebarWidth);
        setSidebarSwipeOffset(offset);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!draggingSidebarRef.current) return;

      const endX = e.changedTouches[0].clientX;
      const diffX = endX - startX.current;

      const threshold = 80;
      const side = draggingSidebarRef.current;
      draggingSidebarRef.current = null;

      if (side === 'left') {
        const totalOffset = leftSidebarOpen ? (sidebarWidth + diffX) : diffX;
        if (totalOffset > threshold) toggleLeftSidebar(true);
        else toggleLeftSidebar(false);
      } else if (side === 'right') {
        const totalOffset = rightSidebarOpen ? (sidebarWidth - diffX) : -diffX;
        if (totalOffset > threshold) toggleRightSidebar(true);
        else toggleRightSidebar(false);
      }
      
      setSidebarSwipeOffset(0);
      setDraggingSide(null);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [leftSidebarOpen, rightSidebarOpen, sidebarSwipeOffset]);
};
