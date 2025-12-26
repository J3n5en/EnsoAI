import { useCallback, useEffect, useRef } from 'react';

/**
 * A ref-based debounce hook that avoids closure issues
 *
 * @param delay - Delay in milliseconds
 * @returns Object with trigger, cancel, and flush functions
 *
 * @example
 * ```ts
 * const { trigger, cancel, flush } = useDebouncedSave(1000);
 *
 * // Trigger debounced action
 * trigger('value', (val) => console.log(val));
 *
 * // Cancel pending action
 * cancel();
 *
 * // Execute pending action immediately
 * flush();
 * ```
 */
export function useDebouncedSave<T = string>(delay: number) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<T | null>(null);
  const callbackRef = useRef<((value: T) => void) | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const trigger = useCallback(
    (value: T, callback: (value: T) => void) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      valueRef.current = value;
      callbackRef.current = callback;
      timeoutRef.current = setTimeout(() => {
        if (valueRef.current && callbackRef.current) {
          callbackRef.current(valueRef.current);
        }
        timeoutRef.current = null;
        valueRef.current = null;
        callbackRef.current = null;
      }, delay);
    },
    [delay]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    valueRef.current = null;
    callbackRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current && valueRef.current && callbackRef.current) {
      clearTimeout(timeoutRef.current);
      callbackRef.current(valueRef.current);
      timeoutRef.current = null;
      valueRef.current = null;
      callbackRef.current = null;
    }
  }, []);

  return { trigger, cancel, flush };
}
