import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { ThemeName } from '../editor/themes';

export type { ThemeName };

export interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  transparent: boolean;
  setTransparent: (transparent: boolean) => void;
  bgImage: string | null;
  setBgImage: (url: string | null) => void;
  bgBlur: number;
  setBgBlur: (blur: number) => void;
  bgOpacity: number;
  setBgOpacity: (opacity: number) => void;
  showMascot: boolean;
  setShowMascot: (show: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY_THEME = 'hoshicp:theme';
const STORAGE_KEY_TRANSPARENT = 'hoshicp:transparent';
const STORAGE_KEY_BG = 'hoshicp:bg_image';
const STORAGE_KEY_BLUR = 'hoshicp:bg_blur';
const STORAGE_KEY_OPACITY = 'hoshicp:bg_opacity';
const STORAGE_KEY_MASCOT = 'hoshicp:show_mascot';

const getStorageItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStorageItem = (key: string, val: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, val);
  } catch {}
};

const removeStorageItem = (key: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
};

export const THEME_LIST: { id: ThemeName; label: string; previewColor: string }[] = [
  { id: 'cute-hoshino', label: 'Cute Hoshino', previewColor: '#ff70a0' },
  { id: 'classic-dark', label: 'Classic Dark', previewColor: '#007acc' },
  { id: 'classic-light', label: 'Classic Light', previewColor: '#0284c7' },
  { id: 'dracula', label: 'Dracula', previewColor: '#bd93f9' },
  { id: 'one-dark', label: 'One Dark', previewColor: '#61afef' },
  { id: 'catppuccin', label: 'Catppuccin', previewColor: '#cba6f7' },
];

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeName;
  defaultTransparent?: boolean;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'cute-hoshino',
  defaultTransparent = true,
}) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = getStorageItem(STORAGE_KEY_THEME);
    if (
      saved === 'cute-hoshino' ||
      saved === 'classic-dark' ||
      saved === 'classic-light' ||
      saved === 'dracula' ||
      saved === 'one-dark' ||
      saved === 'catppuccin'
    ) {
      return saved;
    }
    return defaultTheme;
  });

  const [transparent, setTransparentState] = useState<boolean>(() => {
    const saved = getStorageItem(STORAGE_KEY_TRANSPARENT);
    if (saved !== null) return saved === 'true';
    return defaultTransparent;
  });

  const [bgImage, setBgImageState] = useState<string | null>(() => {
    return getStorageItem(STORAGE_KEY_BG);
  });

  const [bgBlur, setBgBlurState] = useState<number>(() => {
    const saved = getStorageItem(STORAGE_KEY_BLUR);
    if (saved !== null) return Number(saved);
    return 16;
  });

  const [bgOpacity, setBgOpacityState] = useState<number>(() => {
    const saved = getStorageItem(STORAGE_KEY_OPACITY);
    if (saved !== null) return Number(saved);
    return 0.18;
  });

  const [showMascot, setShowMascotState] = useState<boolean>(() => {
    const saved = getStorageItem(STORAGE_KEY_MASCOT);
    if (saved !== null) return saved === 'true';
    return true;
  });

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    setStorageItem(STORAGE_KEY_THEME, t);
  };

  const setTransparent = (val: boolean) => {
    setTransparentState(val);
    setStorageItem(STORAGE_KEY_TRANSPARENT, String(val));
  };

  const setBgImage = (url: string | null) => {
    setBgImageState(url);
    if (url) setStorageItem(STORAGE_KEY_BG, url);
    else removeStorageItem(STORAGE_KEY_BG);
  };

  const setBgBlur = (val: number) => {
    setBgBlurState(val);
    setStorageItem(STORAGE_KEY_BLUR, String(val));
  };

  const setBgOpacity = (val: number) => {
    setBgOpacityState(val);
    setStorageItem(STORAGE_KEY_OPACITY, String(val));
  };

  const setShowMascot = (val: boolean) => {
    setShowMascotState(val);
    setStorageItem(STORAGE_KEY_MASCOT, String(val));
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.setProperty('--glass-blur', `${bgBlur}px`);
    }
  }, [theme, bgBlur]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      transparent,
      setTransparent,
      bgImage,
      setBgImage,
      bgBlur,
      setBgBlur,
      bgOpacity,
      setBgOpacity,
      showMascot,
      setShowMascot,
    }),
    [theme, transparent, bgImage, bgBlur, bgOpacity, showMascot]
  );

  return (
    <ThemeContext.Provider value={value}>
      <div
        data-theme={theme}
        className="relative flex h-screen w-screen overflow-hidden text-[var(--theme-text)] transition-colors duration-150"
        style={{
          backgroundColor: transparent ? 'transparent' : 'var(--theme-bg)',
        }}
      >
        {/* Custom Wallpaper Backdrop */}
        {bgImage && (
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center transition-opacity"
            style={{
              backgroundImage: `url(${bgImage})`,
              filter: `blur(${bgBlur}px)`,
              opacity: bgOpacity,
            }}
          />
        )}

        {/* Hoshino Anime Mascot Watermark (for cute-hoshino theme) */}
        {theme === 'cute-hoshino' && showMascot && !bgImage && (
          <div className="hoshino-mascot-watermark pointer-events-none absolute inset-0 z-0" />
        )}

        <div className="relative z-10 flex h-full w-full flex-col">{children}</div>
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
