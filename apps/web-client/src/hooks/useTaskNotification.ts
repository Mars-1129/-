import { useCallback, useEffect, useRef, useState } from 'react';

type NotificationPermission = 'default' | 'granted' | 'denied';

type NotifyParams = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
};

export function useTaskNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const pageVisibleRef = useRef(true);
  // Bug 15: 追踪活跃的定时器和通知，确保组件卸载时清理
  const activeTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const activeNotificationsRef = useRef<Notification[]>([]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      pageVisibleRef.current = document.visibilityState === 'visible';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Bug 15: 组件卸载时清理所有定时器和未关闭的通知
      for (const timerId of activeTimersRef.current) {
        clearTimeout(timerId);
      }
      activeTimersRef.current = [];
      for (const n of activeNotificationsRef.current) {
        n.close();
      }
      activeNotificationsRef.current = [];
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false;

    if (Notification.permission === 'granted') {
      setPermission('granted');
      return true;
    }

    if (Notification.permission === 'denied') return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermission);
      return result === 'granted';
    } catch {
      return false;
    }
  }, []);

  const notify = useCallback(
    (params: NotifyParams) => {
      if (permission !== 'granted' || pageVisibleRef.current) return;

      try {
        const n = new Notification(params.title, {
          body: params.body,
          icon: params.icon,
          tag: params.tag ?? 'tikstream-task',
        });

        activeNotificationsRef.current.push(n);

        n.addEventListener('click', () => {
          window.focus();
          n.close();
          activeNotificationsRef.current = activeNotificationsRef.current.filter((x) => x !== n);
        });

        // Bug 15: 5 秒后自动关闭，保存 timerId 用于组件卸载时清理
        const timerId = setTimeout(() => {
          n.close();
          activeNotificationsRef.current = activeNotificationsRef.current.filter((x) => x !== n);
          activeTimersRef.current = activeTimersRef.current.filter((x) => x !== timerId);
        }, 5000);

        activeTimersRef.current.push(timerId);
      } catch {
        // 浏览器可能不支持 Notification
      }
    },
    [permission],
  );

  return { permission, requestPermission, notify, isPageVisible: () => pageVisibleRef.current };
}
