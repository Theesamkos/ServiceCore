import { useState, useCallback } from "react";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

function notify() {
  toastListeners.forEach(fn => fn([...toasts]));
}

export function addToast(toast: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { ...toast, id }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notify();
  }, 4000);
}

export function useToastState() {
  const [list, setList] = useState<Toast[]>([]);
  const register = useCallback((fn: (t: Toast[]) => void) => {
    toastListeners.push(fn);
    return () => { toastListeners = toastListeners.filter(l => l !== fn); };
  }, []);
  return { list, register, setList };
}

export function toast(opts: Omit<Toast, "id">) {
  addToast(opts);
}
