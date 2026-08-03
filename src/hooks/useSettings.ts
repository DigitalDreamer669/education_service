import { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsContextProvider');
  return ctx;
}
