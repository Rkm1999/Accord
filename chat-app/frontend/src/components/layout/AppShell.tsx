import { ReactNode } from 'react';
import { useUIStore } from '@/store/useUIStore';
import { clsx } from 'clsx';

interface Props {
  children: ReactNode;
  leftSidebar: ReactNode;
  rightSidebar: ReactNode;
}

export const AppShell = ({ children, leftSidebar, rightSidebar }: Props) => {
  const { 
    leftSidebarOpen, rightSidebarOpen, toggleLeftSidebar, toggleRightSidebar,
    sidebarSwipeOffset, draggingSide
  } = useUIStore();

  const handleGlobalClick = () => {
    // Dismiss sidebars on mobile if clicking main area
    if (window.innerWidth < 1024) {
      if (leftSidebarOpen) toggleLeftSidebar(false);
      if (rightSidebarOpen) toggleRightSidebar(false);
    }
  };

  const isDragging = sidebarSwipeOffset > 0;
  const sidebarWidth = 240;

  return (
    <div className="flex h-full w-full relative overflow-hidden bg-accord-dark-300">

      {/* Sidebar Overlays (Mobile) */}
      {(leftSidebarOpen || rightSidebarOpen || isDragging) && (
        <div 
          className="fixed inset-0 bg-black/50 z-[60] lg:hidden transition-opacity duration-300" 
          style={{ 
            opacity: isDragging ? (sidebarSwipeOffset / sidebarWidth) : 1,
            pointerEvents: (leftSidebarOpen || rightSidebarOpen) ? 'auto' : 'none'
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleLeftSidebar(false);
            toggleRightSidebar(false);
          }}
        />
      )}

      {/* 1. Left Sidebar (Channels) */}
      <aside 
        className={clsx(
          "w-60 bg-accord-dark-400 flex flex-col min-w-[240px] shadow-2xl lg:shadow-none z-70",
          "fixed top-0 bottom-0 left-0 lg:static lg:translate-x-0 transition-transform duration-300",
          !leftSidebarOpen && draggingSide !== 'left' && "-translate-x-full",
          draggingSide === 'left' && "transition-none"
        )}
        style={draggingSide === 'left' ? {
          transform: `translateX(${sidebarSwipeOffset - sidebarWidth}px)`
        } : {}}
      >
        {leftSidebar}
      </aside>

      {/* 2. Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-accord-dark-300 relative" onClick={handleGlobalClick}>
        {children}
      </main>

      {/* 3. Right Sidebar (Members) */}
      <aside 
        className={clsx(
          "w-60 bg-accord-dark-400 flex flex-col min-w-[240px] shadow-2xl lg:shadow-none z-70",
          "fixed top-0 bottom-0 right-0 lg:static lg:translate-x-0 transition-transform duration-300",
          !rightSidebarOpen && draggingSide !== 'right' && "translate-x-full",
          draggingSide === 'right' && "transition-none"
        )}
        style={draggingSide === 'right' ? {
          transform: `translateX(${sidebarWidth - sidebarSwipeOffset}px)`
        } : {}}
      >
        {rightSidebar}
      </aside>
    </div>
  );
};
