import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Message } from '../types';

type ModalType = 'createChannel' | 'startDM' | 'search' | 'profile' | 'userDetail' | 'notificationSettings' | 'emojiUpload' | 'image' | 'emojiPicker' | null;

interface UIState {
  activeModal: ModalType;
  userDetailUsername: string | null;
  selectedImageUrl: string | null;
  pickerMessageId: number | null; // null for chat input
  emojiPickerPosition: { top: number; left: number } | null;
  isEmojiKeyboardOpen: boolean;
  
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  sidebarSwipeOffset: number; // 0 to 240
  draggingSide: 'left' | 'right' | null;
  
  keyboardHeight: number;
  replyingTo: Message | null;
  editingMessageId: number | null;
  searchTargetId: number | null;

  openModal: (type: ModalType, data?: any, position?: { top: number; left: number }) => void;
  closeModal: () => void;
  toggleLeftSidebar: (open?: boolean) => void;
  toggleRightSidebar: (open?: boolean) => void;
  setSidebarSwipeOffset: (offset: number) => void;
  setDraggingSide: (side: 'left' | 'right' | null) => void;
  setKeyboardHeight: (height: number) => void;
  setReplyingTo: (message: Message | null) => void;
  setEditingMessageId: (id: number | null) => void;
  setSearchTargetId: (id: number | null) => void;
  setIsEmojiKeyboardOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeModal: null,
      userDetailUsername: null,
      selectedImageUrl: null,
      pickerMessageId: null,
      emojiPickerPosition: null,
      isEmojiKeyboardOpen: false,
      
      leftSidebarOpen: false,
      rightSidebarOpen: false,
      sidebarSwipeOffset: 0,
      draggingSide: null,
      
      keyboardHeight: 300,
      replyingTo: null,
      editingMessageId: null,
      searchTargetId: null,

      openModal: (type, data, position) => set({ 
        activeModal: type,
        userDetailUsername: type === 'userDetail' ? data : null,
        selectedImageUrl: type === 'image' ? data : null,
        pickerMessageId: type === 'emojiPicker' ? data : null,
        emojiPickerPosition: position || null,
      }),
      closeModal: () => set({ 
        activeModal: null, 
        userDetailUsername: null,
        selectedImageUrl: null,
        pickerMessageId: null,
        emojiPickerPosition: null,
        isEmojiKeyboardOpen: false,
      }),
      
      toggleLeftSidebar: (open) => set((state) => ({ 
        leftSidebarOpen: open !== undefined ? open : !state.leftSidebarOpen,
        rightSidebarOpen: open === true ? false : state.rightSidebarOpen,
        sidebarSwipeOffset: 0,
        draggingSide: null
      })),
      
      toggleRightSidebar: (open) => set((state) => ({ 
        rightSidebarOpen: open !== undefined ? open : !state.rightSidebarOpen,
        leftSidebarOpen: open === true ? false : state.leftSidebarOpen,
        sidebarSwipeOffset: 0,
        draggingSide: null
      })),

      setSidebarSwipeOffset: (offset) => set({ sidebarSwipeOffset: offset }),
      setDraggingSide: (side) => set({ draggingSide: side }),
      
      setKeyboardHeight: (height) => set({ keyboardHeight: height }),
      setReplyingTo: (message) => set({ replyingTo: message }),
      setEditingMessageId: (id) => set({ editingMessageId: id }),
      setSearchTargetId: (id) => set({ searchTargetId: id }),
      setIsEmojiKeyboardOpen: (open) => set({ isEmojiKeyboardOpen: open }),
    }),
    {
      name: 'accord-ui',
      partialize: (state) => ({ 
        keyboardHeight: state.keyboardHeight 
      }),
    }
  )
);
