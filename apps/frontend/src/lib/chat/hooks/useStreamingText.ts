import { useCallback, useEffect, useRef, useState } from "react";

export interface UseStreamingTextOptions {
  /** Milliseconds per character. Default: 5 (~200 chars/sec) */
  speed?: number;
  /** When false, text appears immediately (use for historical messages) */
  enabled?: boolean;
  onComplete?: () => void;
}

export interface UseStreamingTextReturn {
  displayText: string;
  addChunk: (chunk: string) => void;
  setTargetText: (text: string) => void;
  reset: () => void;
  isAnimating: boolean;
  isComplete: boolean;
}

export function useStreamingText(
  options: UseStreamingTextOptions = {}
): UseStreamingTextReturn {
  const { speed = 5, enabled = true, onComplete } = options;
  
  const [targetText, setTargetText] = useState("");
  const [displayText, setDisplayText] = useState("");
  
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const charIndexRef = useRef<number>(0);
  const isAnimatingRef = useRef(false);
  const completeFiredRef = useRef(false);
  
  const addChunk = useCallback((chunk: string) => {
    if (!chunk) return;
    setTargetText((prev) => prev + chunk);
  }, []);
  
  const reset = useCallback(() => {
    setTargetText("");
    setDisplayText("");
    charIndexRef.current = 0;
    completeFiredRef.current = false;
    
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    lastTimeRef.current = 0;
    isAnimatingRef.current = false;
  }, []);
  
  useEffect(() => {
    if (!enabled) {
      setDisplayText(targetText);
      charIndexRef.current = targetText.length;
      return;
    }
    
    if (charIndexRef.current >= targetText.length) {
      if (targetText.length > 0 && !completeFiredRef.current) {
        completeFiredRef.current = true;
        onComplete?.();
      }
      return;
    }
    
    if (isAnimatingRef.current) return;
    
    isAnimatingRef.current = true;
    
    const animate = (time: number) => {
      const currentTarget = targetText;
      
      if (charIndexRef.current < currentTarget.length) {
        if (time - lastTimeRef.current > speed) {
          charIndexRef.current++;
          setDisplayText(currentTarget.slice(0, charIndexRef.current));
          lastTimeRef.current = time;
        }
        frameRef.current = requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        frameRef.current = null;
        
        if (!completeFiredRef.current) {
          completeFiredRef.current = true;
          onComplete?.();
        }
      }
    };
    
    frameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      isAnimatingRef.current = false;
    };
  }, [targetText, speed, enabled, onComplete]);
  
  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);
  
  const isAnimating = isAnimatingRef.current || charIndexRef.current < targetText.length;
  const isComplete = charIndexRef.current >= targetText.length && targetText.length > 0;
  
  return {
    displayText: enabled ? displayText : targetText,
    addChunk,
    setTargetText,
    reset,
    isAnimating,
    isComplete,
  };
}

export default useStreamingText;
