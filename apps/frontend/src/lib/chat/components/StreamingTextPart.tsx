import { useEffect, useRef, memo } from "react";
import { 
  useMessagePartText, 
  useThreadRuntime,
  useMessageRuntime,
  TextMessagePartProvider 
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { useStreamingText } from "../hooks/useStreamingText";

const ANIMATION_SPEED_MS = 5;
const SHOW_CURSOR = true;

const markdownComponents = {
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="aui-md-h1" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="aui-md-h2" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="aui-md-h3" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="aui-md-h4" {...props}>{children}</h4>
  ),
  h5: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 className="aui-md-h5" {...props}>{children}</h5>
  ),
  h6: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6 className="aui-md-h6" {...props}>{children}</h6>
  ),
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="aui-md-p" {...props}>{children}</p>
  ),
  a: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="aui-md-a" {...props}>{children}</a>
  ),
  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="aui-md-blockquote" {...props}>{children}</blockquote>
  ),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="aui-md-ul" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="aui-md-ol" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="aui-md-li" {...props}>{children}</li>
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="aui-md-hr" {...props} />
  ),
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <table className="aui-md-table" {...props}>{children}</table>
  ),
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="aui-md-thead" {...props}>{children}</thead>
  ),
  tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className="aui-md-tbody" {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className="aui-md-tr" {...props}>{children}</tr>
  ),
  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="aui-md-th" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="aui-md-td" {...props}>{children}</td>
  ),
  input: ({ type, checked, disabled, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          readOnly
          className="aui-md-checkbox mr-2 h-4 w-4 rounded border-border"
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
};

function StreamingTextPartInner() {
  const text = useMessagePartText();
  const threadRuntime = useThreadRuntime();
  const messageRuntime = useMessageRuntime();
  const prevTextRef = useRef("");
  
  const isRunning = threadRuntime.getState().isRunning;
  const messageState = messageRuntime.getState();
  const isLastMessage = messageState.isLast;
  const isAssistant = messageState.role === "assistant";
  const shouldAnimate = isRunning && isLastMessage && isAssistant;
  
  const { displayText, setTargetText, reset, isAnimating } = useStreamingText({
    speed: ANIMATION_SPEED_MS,
    enabled: shouldAnimate,
  });
  
  useEffect(() => {
    if (!shouldAnimate) {
      reset();
      prevTextRef.current = "";
      return;
    }
    
    if (text.text !== prevTextRef.current) {
      setTargetText(text.text);
      prevTextRef.current = text.text;
    }
  }, [text.text, shouldAnimate, setTargetText, reset]);
  
  const textToRender = shouldAnimate ? displayText : text.text;
  const showAnimatedCursor = SHOW_CURSOR && isAnimating && shouldAnimate;
  
  return (
    <span className="streaming-text-container">
      <TextMessagePartProvider text={textToRender}>
        <MarkdownTextPrimitive
          remarkPlugins={[remarkGfm]}
          className="aui-md max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={markdownComponents}
        />
      </TextMessagePartProvider>
      {showAnimatedCursor && (
        <span className="streaming-cursor" aria-hidden="true">▋</span>
      )}
    </span>
  );
}

export const StreamingTextPart = memo(StreamingTextPartInner);
export default StreamingTextPart;
