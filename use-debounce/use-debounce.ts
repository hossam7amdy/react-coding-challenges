import { useEffect, useRef, useState } from "react";

type Timeout = ReturnType<typeof setTimeout>;

export function useDebounce<T>(value: T, delay: number) {
  const timerRef = useRef<Timeout>(null);
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delay]);

  return debouncedValue;
}
