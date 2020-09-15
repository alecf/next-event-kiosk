import { useState, useCallback } from 'react';
export function usePersistentState<T>(
  key: string,
  value: T
): [T, (value: T) => void] {
  const item = window.localStorage.getItem(key);
  const itemValue = item !== null ? JSON.parse(item) : value;
  const [state, setState] = useState<T>(itemValue);

  const setStatePersistently = useCallback(
    (value: T) => {
      setState(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    [key]
  );
  return [state, setStatePersistently];
}
