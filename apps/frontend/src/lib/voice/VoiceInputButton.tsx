/**
 * Voice Input Button Component
 * 
 * A microphone button with recording state visualization.
 * Supports push-to-talk (hold) and toggle (click) modes.
 */

import { type FC, type MouseEvent, useCallback, useEffect, useState } from 'react';

/** Props for VoiceInputButton */
export interface VoiceInputButtonProps {
  /** Voice input mode */
  mode: 'push-to-talk' | 'toggle';
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether processing transcription */
  isProcessing: boolean;
  /** Audio level (0.0 - 1.0) for visualization */
  audioLevel: number;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether a model is loaded */
  isModelLoaded?: boolean;
  /** Callback for push-to-talk start */
  onPushToTalkStart?: () => void;
  /** Callback for push-to-talk end */
  onPushToTalkEnd?: () => void;
  /** Callback for toggle click */
  onToggleClick?: () => void;
  /** Keyboard shortcut (e.g., "Alt+Space") */
  shortcut?: string;
  /** Additional CSS classes */
  className?: string;
}

/** Microphone icon */
function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

/** Stop/square icon */
function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Loading spinner icon */
function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
    </svg>
  );
}

/**
 * Voice Input Button
 * 
 * Renders a microphone button that visualizes recording state.
 */
export const VoiceInputButton: FC<VoiceInputButtonProps> = ({
  mode,
  isRecording,
  isProcessing,
  audioLevel,
  disabled = false,
  isModelLoaded = true,
  onPushToTalkStart,
  onPushToTalkEnd,
  onToggleClick,
  shortcut,
  className = '',
}) => {
  // Track if push-to-talk is active (for keyboard handling)
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);

  // Handle mouse down for push-to-talk
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (disabled || isProcessing || !isModelLoaded) return;
    if (mode === 'push-to-talk') {
      e.preventDefault();
      setIsPushToTalkActive(true);
      onPushToTalkStart?.();
    }
  }, [disabled, isProcessing, isModelLoaded, mode, onPushToTalkStart]);

  // Handle mouse up for push-to-talk
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (mode === 'push-to-talk' && isPushToTalkActive) {
      e.preventDefault();
      setIsPushToTalkActive(false);
      onPushToTalkEnd?.();
    }
  }, [mode, isPushToTalkActive, onPushToTalkEnd]);

  // Handle mouse leave (in case user moves mouse off button while holding)
  const handleMouseLeave = useCallback(() => {
    if (mode === 'push-to-talk' && isPushToTalkActive) {
      setIsPushToTalkActive(false);
      onPushToTalkEnd?.();
    }
  }, [mode, isPushToTalkActive, onPushToTalkEnd]);

  // Handle click for toggle mode
  const handleClick = useCallback(() => {
    if (disabled || isProcessing || !isModelLoaded) return;
    if (mode === 'toggle') {
      onToggleClick?.();
    }
  }, [disabled, isProcessing, isModelLoaded, mode, onToggleClick]);

  // Parse shortcut string into key and modifiers
  const parseShortcut = useCallback((shortcutStr: string | undefined) => {
    if (!shortcutStr) return null;
    
    const parts = shortcutStr.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const modifiers = {
      alt: parts.includes('alt') || parts.includes('opt'),
      ctrl: parts.includes('ctrl') || parts.includes('control'),
      shift: parts.includes('shift'),
      meta: parts.includes('meta') || parts.includes('cmd'),
    };
    
    return { key, modifiers };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!shortcut || mode !== 'push-to-talk') return;
    
    const parsed = parseShortcut(shortcut);
    if (!parsed) return;
    
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const keyMatch = e.key.toLowerCase() === parsed.key || 
                       (parsed.key === 'space' && e.key === ' ');
      const altMatch = e.altKey === parsed.modifiers.alt;
      const ctrlMatch = e.ctrlKey === parsed.modifiers.ctrl;
      const shiftMatch = e.shiftKey === parsed.modifiers.shift;
      const metaMatch = e.metaKey === parsed.modifiers.meta;

      // Voice shortcut uses modifier keys (Ctrl+Shift+M), so it won't conflict
      // with normal typing. Allow it even when input is focused.
      if (keyMatch && altMatch && ctrlMatch && shiftMatch && metaMatch) {
        if (!isPushToTalkActive && !disabled && !isProcessing && isModelLoaded) {
          e.preventDefault();
          setIsPushToTalkActive(true);
          onPushToTalkStart?.();
        }
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      const parsed = parseShortcut(shortcut);
      if (!parsed) return;
      
      const keyMatch = e.key.toLowerCase() === parsed.key || 
                       (parsed.key === 'space' && e.key === ' ');

      if (keyMatch && isPushToTalkActive) {
        e.preventDefault();
        setIsPushToTalkActive(false);
        onPushToTalkEnd?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [shortcut, mode, isPushToTalkActive, disabled, isProcessing, isModelLoaded, parseShortcut, onPushToTalkStart, onPushToTalkEnd]);

  // Calculate glow intensity based on audio level
  const glowIntensity = isRecording ? Math.min(audioLevel * 2, 1) : 0;
  const glowSize = 8 + glowIntensity * 8; // 8-16px

  // Determine button state
  const isActive = isRecording || isPushToTalkActive;
  const showSpinner = isProcessing;
  const showStop = isActive && mode === 'toggle';
  const showMic = !showSpinner && !showStop;

  // Build class names
  const baseClasses = 'relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150';
  const stateClasses = isActive
    ? 'bg-[var(--cyber-red)] text-white shadow-[0_0_12px_var(--cyber-red)]'
    : disabled || !isModelLoaded
      ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground';

  // Tooltip text
  let tooltipText = '';
  if (!isModelLoaded) {
    tooltipText = 'Voice model not loaded';
  } else if (isProcessing) {
    tooltipText = 'Processing...';
  } else if (isRecording) {
    tooltipText = mode === 'toggle' ? 'Click to stop' : 'Release to stop';
  } else {
    tooltipText = mode === 'toggle' 
      ? 'Click to start recording' 
      : `Hold ${shortcut || 'button'} to record`;
  }

  return (
    <button
      type="button"
      className={`${baseClasses} ${stateClasses} ${className}`}
      disabled={disabled || isProcessing || !isModelLoaded}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      title={tooltipText}
      aria-label={tooltipText}
    >
      {/* Animated glow ring */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-full bg-[var(--cyber-red)] animate-ping opacity-30"
          style={{
            transform: `scale(${1 + glowIntensity * 0.3})`,
            boxShadow: `0 0 ${glowSize}px var(--cyber-red)`,
          }}
        />
      )}
      
      {/* Audio level ring */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-full border-2 border-[var(--cyber-red)] transition-transform duration-75"
          style={{
            transform: `scale(${1 + audioLevel * 0.2})`,
            opacity: 0.5 + audioLevel * 0.5,
          }}
        />
      )}
      
      {/* Icon */}
      <div className="relative z-10">
        {showSpinner && <SpinnerIcon className="w-5 h-5" />}
        {showStop && <StopIcon className="w-5 h-5" />}
        {showMic && <MicrophoneIcon className="w-5 h-5" />}
      </div>
    </button>
  );
};

export default VoiceInputButton;
