"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "./notification-provider.module.css";

type Notification = {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "error" | "success";
};

type NotificationContextValue = {
  notify: (notification: Notification) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timers = useRef(new Map<string, number>());
  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);
  const notify = useCallback(
    (notification: Notification) => {
      setNotifications((current) =>
        current.some((item) => item.id === notification.id)
          ? current.map((item) =>
              item.id === notification.id ? notification : item,
            )
          : [...current, notification],
      );
      const previousTimer = timers.current.get(notification.id);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      timers.current.set(
        notification.id,
        window.setTimeout(() => dismiss(notification.id), 15_000),
      );
    },
    [dismiss],
  );
  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) window.clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {notifications.length > 0 ? (
        <div aria-label="Notifications" className={styles.stack}>
          {notifications.map((notification) => (
            <Alert
              closable
              description={notification.description}
              key={notification.id}
              onClose={() => dismiss(notification.id)}
              role={notification.severity === "error" ? "alert" : "status"}
              severity={notification.severity}
              small
              title={notification.title}
            />
          ))}
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("NotificationProvider absent");
  return context;
}
