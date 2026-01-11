"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import GlobalSearch from "./GlobalSearch";

interface KeyboardShortcutsContextType {
  openSearch: () => void;
  closeSearch: () => void;
  isSearchOpen: boolean;
}

const KeyboardShortcutsContext = createContext<
  KeyboardShortcutsContextType | undefined
>(undefined);

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  // Return default values if context is not available (during SSR)
  if (!context) {
    return { openSearch: () => {}, closeSearch: () => {}, isSearchOpen: false };
  }
  return context;
}

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({
  children,
}: KeyboardShortcutsProviderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd/Ctrl + K - Open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Escape - Close search
      if (e.key === "Escape" && isSearchOpen) {
        e.preventDefault();
        setIsSearchOpen(false);
        return;
      }

      // Shortcuts that only work when not in input
      if (!isInput) {
        // / - Open search (like GitHub)
        if (e.key === "/") {
          e.preventDefault();
          setIsSearchOpen(true);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchOpen]);

  return (
    <KeyboardShortcutsContext.Provider
      value={{ openSearch, closeSearch, isSearchOpen }}
    >
      {children}
      <GlobalSearch isOpen={isSearchOpen} onClose={closeSearch} />
    </KeyboardShortcutsContext.Provider>
  );
}
