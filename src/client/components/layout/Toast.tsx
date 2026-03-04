import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ToastState {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({ message: '', type: 'success', visible: false });

  const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setState({ message, type, visible: true });
    setTimeout(() => setState((s) => ({ ...s, visible: false })), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className={`fixed bottom-6 right-6 px-5 py-3.5 bg-surface border border-border shadow-card-hover rounded-xl text-[13px] font-medium z-[100] transition-all pointer-events-none ${
          state.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        } ${state.type === 'success' ? 'border-l-[3px] border-l-accent text-accent' : 'border-l-[3px] border-l-exp-red text-exp-red'}`}
      >
        {state.message}
      </div>
    </ToastContext.Provider>
  );
}
