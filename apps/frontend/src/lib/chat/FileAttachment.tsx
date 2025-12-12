/**
 * File Attachment Component for Chat Input
 * 
 * Allows users to attach files (images, PDFs, etc.) to their messages.
 * Files are converted to base64 data URLs before sending.
 */

import { useState, useRef, useCallback, type FC } from "react";

export interface AttachedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string; // base64 data URL
  preview?: string; // For images, same as url; for others, icon placeholder
}

interface FileAttachmentProps {
  attachments: AttachedFile[];
  onAttachmentsChange: (attachments: AttachedFile[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
}

// Default accepted file types
const DEFAULT_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
];

// Generate unique ID
function generateId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Convert file to base64 data URL
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Get file icon based on MIME type
function getFileIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("text/")) return "📝";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.startsWith("video/")) return "🎬";
  return "📎";
}

/**
 * FileAttachmentButton - Button to trigger file selection
 */
export const FileAttachmentButton: FC<{
  onClick: () => void;
  disabled?: boolean;
  hasAttachments?: boolean;
}> = ({ onClick, disabled, hasAttachments }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        p-2 rounded-md transition-colors
        ${hasAttachments 
          ? "text-primary bg-primary/10" 
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
      title="Attach files"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    </button>
  );
};

/**
 * FileAttachmentPreview - Shows attached files with remove option
 */
export const FileAttachmentPreview: FC<{
  attachments: AttachedFile[];
  onRemove: (id: string) => void;
}> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 border-b border-border">
      {attachments.map((file) => (
        <div
          key={file.id}
          className="relative group flex items-center gap-2 px-2 py-1 bg-muted rounded-md text-sm"
        >
          {file.mime.startsWith("image/") ? (
            <img
              src={file.url}
              alt={file.name}
              className="w-8 h-8 object-cover rounded"
            />
          ) : (
            <span className="text-lg">{getFileIcon(file.mime)}</span>
          )}
          <div className="flex flex-col min-w-0">
            <span className="truncate max-w-[120px] text-xs font-medium">
              {file.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="
              absolute -top-1 -right-1 w-4 h-4 
              bg-destructive text-destructive-foreground 
              rounded-full text-xs 
              opacity-0 group-hover:opacity-100 
              transition-opacity
              flex items-center justify-center
            "
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

/**
 * FileAttachment - Main component with hidden file input
 */
export const FileAttachment: FC<FileAttachmentProps> = ({
  attachments,
  onAttachmentsChange,
  disabled = false,
  maxFiles = 5,
  maxSizeMB = 10,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const files = Array.from(e.target.files || []);

      if (files.length === 0) return;

      // Check max files limit
      if (attachments.length + files.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        return;
      }

      const newAttachments: AttachedFile[] = [];

      for (const file of files) {
        // Check file type
        if (!acceptedTypes.includes(file.type)) {
          setError(`File type ${file.type} not supported`);
          continue;
        }

        // Check file size
        if (file.size > maxSizeMB * 1024 * 1024) {
          setError(`File ${file.name} exceeds ${maxSizeMB}MB limit`);
          continue;
        }

        try {
          const dataUrl = await fileToDataUrl(file);
          newAttachments.push({
            id: generateId(),
            name: file.name,
            mime: file.type,
            size: file.size,
            url: dataUrl,
            preview: file.type.startsWith("image/") ? dataUrl : undefined,
          });
        } catch (err) {
          console.error("Failed to read file:", file.name, err);
          setError(`Failed to read ${file.name}`);
        }
      }

      if (newAttachments.length > 0) {
        onAttachmentsChange([...attachments, ...newAttachments]);
      }

      // Reset input
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [attachments, onAttachmentsChange, maxFiles, maxSizeMB, acceptedTypes]
  );

  const handleRemove = useCallback(
    (id: string) => {
      onAttachmentsChange(attachments.filter((a) => a.id !== id));
    },
    [attachments, onAttachmentsChange]
  );

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(",")}
        onChange={handleFileSelect}
        disabled={disabled}
        className="hidden"
      />

      {/* Error message */}
      {error && (
        <div className="text-xs text-destructive px-2 py-1">{error}</div>
      )}

      {/* Preview attached files */}
      <FileAttachmentPreview attachments={attachments} onRemove={handleRemove} />

      {/* Export the open function for external use */}
      <FileAttachmentButton
        onClick={openFilePicker}
        disabled={disabled || attachments.length >= maxFiles}
        hasAttachments={attachments.length > 0}
      />
    </>
  );
};

export default FileAttachment;
