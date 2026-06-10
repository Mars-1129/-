import { useCallback, useRef, useState } from 'react';

/**
 * 编辑历史 / 撤销重做 Hook
 * 基于完整状态快照的 history stack，最大 50 步
 */

type UseUndoRedoOptions<T> = {
  /** 初始状态 */
  initialState: T;
  /** 最大历史步数，默认 50 */
  maxSteps?: number;
};

type UseUndoRedoReturn<T> = {
  /** 当前状态 */
  current: T;
  /** 推入新状态 */
  pushState: (state: T) => void;
  /** 撤销 */
  undo: () => T | null;
  /** 重做 */
  redo: () => T | null;
  /** 是否可撤销 */
  canUndo: boolean;
  /** 是否可重做 */
  canRedo: boolean;
  /** 重置历史 */
  reset: (state: T) => void;
};

export function useUndoRedo<T>(options: UseUndoRedoOptions<T>): UseUndoRedoReturn<T> {
  const { initialState, maxSteps = 50 } = options;

  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const [current, setCurrent] = useState<T>(initialState);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Keep a ref in sync with current to avoid stale closure reads
  // in pushState/undo/redo when called in rapid succession before re-render
  const currentRef = useRef<T>(initialState);
  currentRef.current = current;

  const pushState = useCallback(
    (state: T) => {
      pastRef.current.push(currentRef.current);
      if (pastRef.current.length > maxSteps) {
        pastRef.current.shift();
      }
      futureRef.current = [];
      currentRef.current = state;
      setCurrent(state);
      setCanUndo(true);
      setCanRedo(false);
    },
    [maxSteps],
  );

  const undo = useCallback((): T | null => {
    const past = pastRef.current;
    if (past.length === 0) return null;

    const previous = past.pop()!;
    futureRef.current.push(currentRef.current);
    currentRef.current = previous;
    setCurrent(previous);
    setCanUndo(past.length > 0);
    setCanRedo(true);
    return previous;
  }, []);

  const redo = useCallback((): T | null => {
    const future = futureRef.current;
    if (future.length === 0) return null;

    const next = future.pop()!;
    pastRef.current.push(currentRef.current);
    currentRef.current = next;
    setCurrent(next);
    setCanUndo(true);
    setCanRedo(future.length > 0);
    return next;
  }, []);

  const reset = useCallback(
    (state: T) => {
      pastRef.current = [];
      futureRef.current = [];
      currentRef.current = state;
      setCurrent(state);
      setCanUndo(false);
      setCanRedo(false);
    },
    [],
  );

  return { current, pushState, undo, redo, canUndo, canRedo, reset };
}
