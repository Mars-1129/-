import * as React from 'react';
import { cn } from '../../lib/utils/cn';

// ================================================================
// Tabs 组件 — 推拉门风格 (Pill)，适配暗色主题
// ================================================================

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>');
  return ctx;
}

// ---- Tabs (容器) ----
type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
};

export function Tabs({ value, onValueChange, children, className }: TabsProps): JSX.Element {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// ---- TabsList (标签栏) ----
type TabsListProps = {
  children: React.ReactNode;
  className?: string;
};

export function TabsList({ children, className }: TabsListProps): JSX.Element {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex gap-1 rounded-xl bg-slate-900 p-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---- TabsTrigger (单个标签) ----
type TabsTriggerProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

export function TabsTrigger({ value, children, className }: TabsTriggerProps): JSX.Element {
  const { value: activeValue, onValueChange } = useTabs();

  return (
    <button
      role="tab"
      aria-selected={activeValue === value}
      onClick={() => onValueChange(value)}
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        activeValue === value
          ? 'bg-slate-800 text-slate-100 shadow-sm'
          : 'text-slate-400 hover:text-slate-200',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---- TabsContent (内容区) ----
type TabsContentProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

export function TabsContent({ value, children, className }: TabsContentProps): JSX.Element | null {
  const { value: activeValue } = useTabs();
  if (value !== activeValue) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}
