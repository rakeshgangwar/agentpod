/**
 * Voice Setup Dialog Component
 *
 * Shows when voice is available but no model is loaded.
 * Allows users to download and select a Whisper model.
 */

import { type FC, useState, useCallback, useEffect } from "react";
import { useVoiceModels, useVoiceInput } from "./useVoiceInput";
import type { DownloadProgress, ModelSize } from "./types";

/** Model size descriptions */
const MODEL_DESCRIPTIONS: Record<ModelSize, { speed: string; accuracy: string; recommended: string }> = {
  tiny: {
    speed: "Very Fast",
    accuracy: "Basic",
    recommended: "Quick dictation, wake word detection",
  },
  base: {
    speed: "Fast",
    accuracy: "Good",
    recommended: "General use (recommended)",
  },
  small: {
    speed: "Medium",
    accuracy: "Better",
    recommended: "Higher accuracy needs",
  },
  medium: {
    speed: "Slower",
    accuracy: "High",
    recommended: "Best quality transcription",
  },
};

/** Format bytes to human readable */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface VoiceSetupDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when setup is complete */
  onComplete?: () => void;
}

export const VoiceSetupDialog: FC<VoiceSetupDialogProps> = ({ open, onClose, onComplete }) => {
  const { availableModels, downloadedModels, refresh: refreshModels } = useVoiceModels();
  const [, voiceActions] = useVoiceInput();

  const [selectedModel, setSelectedModel] = useState<ModelSize>("base");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if selected model is already downloaded
  const isModelDownloaded = downloadedModels.some((m) => m.size === selectedModel);

  // Get selected model info
  const selectedModelInfo = availableModels.find((m) => m.size === selectedModel);

  // Handle model download
  const handleDownload = useCallback(async () => {
    if (!selectedModelInfo) return;

    setIsDownloading(true);
    setError(null);
    setDownloadProgress({ stage: "starting", bytesDownloaded: 0, totalBytes: 0, percent: 0 });

    try {
      await voiceActions.downloadModel(selectedModel);
      await refreshModels();
      setDownloadProgress({ stage: "complete", bytesDownloaded: 0, totalBytes: 0, percent: 100 });
    } catch (err) {
      setError(String(err));
      setDownloadProgress({ stage: "failed", bytesDownloaded: 0, totalBytes: 0, percent: 0 });
    } finally {
      setIsDownloading(false);
    }
  }, [selectedModel, selectedModelInfo, voiceActions, refreshModels]);

  // Handle model load
  const handleLoadModel = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await voiceActions.loadModel(selectedModel);
      onComplete?.();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedModel, voiceActions, onComplete, onClose]);

  // Listen for download progress events
  useEffect(() => {
    if (!isDownloading) return;

    // The useVoiceInput hook already sets up event listeners
    // Progress updates come via the onDownloadProgress callback
    // For now we simulate progress (real events would come from Rust backend)
  }, [isDownloading]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-background border border-[var(--cyber-cyan)]/30 rounded-lg shadow-[0_0_30px_var(--cyber-cyan)/10] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/30 bg-background/50">
          <h2 className="font-mono text-sm uppercase tracking-wider text-[var(--cyber-cyan)]">
            [voice_setup]
          </h2>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Download a speech recognition model to enable voice input
          </p>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Model selection */}
          <div className="space-y-2">
            <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Select Model
            </label>
            <div className="grid gap-2">
              {(["tiny", "base", "small", "medium"] as ModelSize[]).map((size) => {
                const model = availableModels.find((m) => m.size === size);
                const isDownloaded = downloadedModels.some((m) => m.size === size);
                const isSelected = selectedModel === size;
                const desc = MODEL_DESCRIPTIONS[size];

                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedModel(size)}
                    disabled={isDownloading || isLoading}
                    className={`w-full text-left p-3 rounded border transition-all font-mono ${
                      isSelected
                        ? "border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10"
                        : "border-border/30 hover:border-[var(--cyber-cyan)]/50"
                    } ${isDownloading || isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{size}</span>
                        {isDownloaded && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)] border border-[var(--cyber-emerald)]/30">
                            Downloaded
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {model ? formatBytes(model.sizeBytes) : "Loading..."}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="text-[var(--cyber-cyan)]">{desc.speed}</span>
                      {" / "}
                      <span>{desc.accuracy}</span>
                      {" - "}
                      {desc.recommended}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Download progress */}
          {downloadProgress && downloadProgress.stage !== "complete" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-muted-foreground">
                  {downloadProgress.stage === "starting" && "Starting download..."}
                  {downloadProgress.stage === "downloading" && "Downloading..."}
                  {downloadProgress.stage === "failed" && "Download failed"}
                </span>
                <span className="text-[var(--cyber-cyan)]">{downloadProgress.percent}%</span>
              </div>
              <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--cyber-cyan)] transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 rounded bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30 text-[var(--cyber-red)] font-mono text-xs">
              {error}
            </div>
          )}

          {/* Info */}
          <div className="p-3 rounded bg-muted/30 border border-border/30">
            <p className="font-mono text-xs text-muted-foreground">
              Models are processed locally on your device. No audio data is sent to the cloud.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/30 bg-background/50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading || isLoading}
            className="px-4 py-2 font-mono text-xs uppercase tracking-wider border border-border/50 rounded hover:border-[var(--cyber-cyan)]/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {isModelDownloaded ? (
            <button
              type="button"
              onClick={handleLoadModel}
              disabled={isLoading}
              className="px-4 py-2 font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] text-black rounded hover:bg-[var(--cyber-cyan)]/90 transition-colors disabled:opacity-50 shadow-[0_0_12px_var(--cyber-cyan)/20]"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Loading...
                </span>
              ) : (
                "Load Model"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || !selectedModelInfo}
              className="px-4 py-2 font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] text-black rounded hover:bg-[var(--cyber-cyan)]/90 transition-colors disabled:opacity-50 shadow-[0_0_12px_var(--cyber-cyan)/20]"
            >
              {isDownloading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Downloading...
                </span>
              ) : (
                `Download (${selectedModelInfo ? formatBytes(selectedModelInfo.sizeBytes) : "..."})`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceSetupDialog;
