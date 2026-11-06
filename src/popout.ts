import { createContext, useContext, type ReactNode } from 'react';

export const PopoutContext = createContext<(p: ReactNode | null) => void>(() => {});
export const usePopout = () => useContext(PopoutContext);
