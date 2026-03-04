import { createContext, useContext } from 'react';

export interface FilterState {
  year: string;
  month: string;
  account: string; // account_id or '' for default (Girokonten), 'all' for all
}

export interface FilterContextValue {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
}

export const FilterContext = createContext<FilterContextValue>({
  filters: { year: '', month: '', account: '' },
  setFilters: () => {},
});

export function useFilters() {
  return useContext(FilterContext);
}
