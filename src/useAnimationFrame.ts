import { useEffect, useRef } from 'react';

export function useAnimationFrame(
  interval: number,
  callback: (timestamp: number) => void
) {
  const cc = useRef<number>();
  useEffect(() => {
    function doSomething(timestamp: number) {
      callback(timestamp);
      cc.current = undefined;
      setTimeout(() => {
        cc.current = requestAnimationFrame(doSomething);
      }, interval);
    }
    cc.current = requestAnimationFrame(doSomething);

    return () => {
      if (cc.current) {
        cancelAnimationFrame(cc.current);
      }
    };
  }, [callback, interval]);
}
