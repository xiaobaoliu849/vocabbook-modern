 import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
 import { api, API_PATHS } from '../utils/api';
 
 interface GlobalStateContextType {
     dueCount: number;
     refreshDueCount: () => Promise<void>;
     notifyWordAdded: () => void;
     notifyWordDeleted: () => void;
     notifyWordUpdated: () => void;
     lastUpdate: number;
 }
 
 const GlobalStateContext = createContext<GlobalStateContextType | undefined>(undefined);
 
 export function GlobalStateProvider({ children }: { children: ReactNode }) {
     const [dueCount, setDueCount] = useState<number>(0);
     const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
 
     const fetchDueCount = useCallback(async () => {
         try {
             const result = await api.get<any>(API_PATHS.REVIEW_DUE + '?limit=1');
             setDueCount(result.total_due ?? result.count ?? 0);
         } catch (error) {
             console.error('Failed to fetch due count:', error);
         }
     }, []);
 
     useEffect(() => {
         fetchDueCount();
         const interval = setInterval(fetchDueCount, 60000);
         return () => clearInterval(interval);
     }, [fetchDueCount]);
 
     const refreshDueCount = useCallback(async () => {
         await fetchDueCount();
     }, [fetchDueCount]);
 
     const notifyWordAdded = useCallback(() => {
         setLastUpdate(Date.now());
         fetchDueCount();
     }, [fetchDueCount]);
 
     const notifyWordDeleted = useCallback(() => {
         setLastUpdate(Date.now());
         fetchDueCount();
     }, [fetchDueCount]);
 
     const notifyWordUpdated = useCallback(() => {
         setLastUpdate(Date.now());
         fetchDueCount();
     }, [fetchDueCount]);
 
     return (
         <GlobalStateContext.Provider value={{
             dueCount,
             refreshDueCount: async () => { await fetchDueCount(); },
             notifyWordAdded,
             notifyWordDeleted,
             notifyWordUpdated,
             lastUpdate
         }}>
             {children}
         </GlobalStateContext.Provider>
     );
 }
 
 export function useGlobalState() {
     const context = useContext(GlobalStateContext);
     if (context === undefined) {
         throw new Error('useGlobalState must be used within a GlobalStateProvider');
     }
     return context;
 }
