/**
 * 剧本编辑器快捷键 Hook
 * 支持保存、撤销、删除、移动等快捷操作
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface KeyboardShortcutCallbacks {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onNewShot?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onCancel?: () => void;
  onJumpToShot?: (shotIndex: number) => void;
  onNextShot?: () => void;
  onPrevShot?: () => void;
  onSaveAndRerender?: () => void;
  maxShotCount?: number;
}

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: () => void;
  description: string;
}

/**
 * 检测当前焦点元素是否是输入框
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  // 检查 contenteditable 元素
  if (activeElement.getAttribute('contenteditable') === 'true') {
    return true;
  }

  return false;
}

/**
 * 剧本编辑器快捷键 Hook
 *
 * @example
 * ```tsx
 * useScriptEditorShortcuts({
 *   onSave: () => handleSaveScript(),
 *   onDelete: () => handleDeleteShot(),
 *   onMoveUp: () => handleMoveShot(-1),
 *   onMoveDown: () => handleMoveShot(1),
 * });
 * ```
 */
export function useScriptEditorShortcuts(callbacks: KeyboardShortcutCallbacks): void {
  // 使用 ref 存储回调，避免每次渲染都重新绑定
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const { onSave, onUndo, onRedo, onDelete, onNewShot, onMoveUp, onMoveDown, onDuplicate, onCancel, onSaveAndRerender, onJumpToShot, onPrevShot, onNextShot } = callbacksRef.current;

    // 跳过输入框内的快捷键（除了特定情况）
    const isInInput = isInputFocused();
    const isMod = event.ctrlKey || event.metaKey;

    // Ctrl/Cmd + S: 保存
    if (isMod && event.key === 's') {
      event.preventDefault();
      onSave?.();
      return;
    }

    // Ctrl/Cmd + Z: 撤销
    if (isMod && !event.shiftKey && event.key === 'z') {
      event.preventDefault();
      onUndo?.();
      return;
    }

    // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y: 重做
    if ((isMod && event.shiftKey && event.key === 'z') || (isMod && event.key === 'y')) {
      event.preventDefault();
      onRedo?.();
      return;
    }

    // Ctrl/Cmd + D: 复制分镜
    if (isMod && event.key === 'd') {
      if (!isInInput) {
        event.preventDefault();
        onDuplicate?.();
      }
      return;
    }

    // Ctrl/Cmd + N: 新建分镜
    if (isMod && event.key === 'n') {
      event.preventDefault();
      onNewShot?.();
      return;
    }

    // Delete 或 Backspace: 删除分镜（非输入框内）
    if ((event.key === 'Delete' || event.key === 'Backspace') && !isInInput) {
      event.preventDefault();
      onDelete?.();
      return;
    }

    // Alt + 上箭头: 上移分镜
    if (event.altKey && event.key === 'ArrowUp' && !isInInput) {
      event.preventDefault();
      onMoveUp?.();
      return;
    }

    // Alt + 下箭头: 下移分镜
    if (event.altKey && event.key === 'ArrowDown' && !isInInput) {
      event.preventDefault();
      onMoveDown?.();
      return;
    }

    // Escape: 取消/关闭（仅在页面提供了 onCancel 回调时拦截）
    if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
      return;
    }

    // Ctrl/Cmd + Enter: 保存并重渲染
    if (isMod && event.key === 'Enter') {
      event.preventDefault();
      onSaveAndRerender?.();
      return;
    }

    // 数字键 1-9: 跳转到对应分镜
    if (!isInInput && !isMod && /^[1-9]$/.test(event.key)) {
      const targetIndex = parseInt(event.key, 10);
      const maxCount = callbacksRef.current.maxShotCount ?? 9;
      if (targetIndex <= maxCount) {
        event.preventDefault();
        onJumpToShot?.(targetIndex);
      }
      return;
    }

    // 左箭头: 上一个分镜
    if (!isInInput && !isMod && event.key === 'ArrowLeft') {
      event.preventDefault();
      onPrevShot?.();
      return;
    }

    // 右箭头: 下一个分镜
    if (!isInInput && !isMod && event.key === 'ArrowRight') {
      event.preventDefault();
      onNextShot?.();
      return;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * 快捷键提示信息
 */
export const SHORTCUT_HINTS = [
  { key: 'Ctrl/⌘ + S', actionKey: 'keyboard.saveScript' },
  { key: 'Ctrl/⌘ + Z', actionKey: 'keyboard.undo' },
  { key: 'Ctrl/⌘ + Shift + Z', actionKey: 'keyboard.redo' },
  { key: 'Ctrl/⌘ + D', actionKey: 'keyboard.copyShot' },
  { key: 'Ctrl/⌘ + N', actionKey: 'keyboard.newShot' },
  { key: 'Delete', actionKey: 'keyboard.deleteShot' },
  { key: 'Alt + ↑', actionKey: 'keyboard.moveUp' },
  { key: 'Alt + ↓', actionKey: 'keyboard.moveDown' },
  { key: '← →', actionKey: 'keyboard.switchShot' },
  { key: '1-9', actionKey: 'keyboard.jumpToShot' },
  { key: 'Ctrl/⌘ + Enter', actionKey: 'keyboard.saveAndRerender' },
  { key: 'Escape', actionKey: 'common.cancel' },
] as const;

/**
 * 快捷键提示组件属性
 */
export interface ShortcutHintsProps {
  hints?: readonly { key: string; actionKey: string }[];
  className?: string;
}

/**
 * 快捷键提示显示组件
 *
 * @example
 * ```tsx
 * <ShortcutHints />
 * ```
 */
export function ShortcutHints({ hints = SHORTCUT_HINTS, className = '' }: ShortcutHintsProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-wrap gap-3 text-xs text-slate-500 ${className}`}>
      {hints.map((hint) => (
        <div key={hint.key} className="flex items-center gap-1">
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-slate-400">
            {hint.key}
          </kbd>
          <span>{t(hint.actionKey)}</span>
        </div>
      ))}
    </div>
  );
}
