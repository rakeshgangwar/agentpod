import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

const unlisteners: UnlistenFn[] = [];

interface ConsoleLogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: string[];
  timestamp: number;
}

const consoleLogs: ConsoleLogEntry[] = [];
const MAX_LOGS = 500;

function setupConsoleCapture(): void {
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const captureLog = (level: ConsoleLogEntry['level'], originalFn: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      originalFn(...args);
      
      const entry: ConsoleLogEntry = {
        level,
        args: args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch {
            return String(arg);
          }
        }),
        timestamp: Date.now(),
      };
      
      consoleLogs.push(entry);
      if (consoleLogs.length > MAX_LOGS) {
        consoleLogs.shift();
      }
    };
  };

  console.log = captureLog('log', originalConsole.log);
  console.info = captureLog('info', originalConsole.info);
  console.warn = captureLog('warn', originalConsole.warn);
  console.error = captureLog('error', originalConsole.error);
  console.debug = captureLog('debug', originalConsole.debug);
}

interface GetConsoleLogsPayload {
  level?: string;
  limit?: number;
  clear?: boolean;
}

async function handleGetConsoleLogs(event: { payload: GetConsoleLogsPayload }): Promise<void> {
  console.log('[MCP-DEBUG] handleGetConsoleLogs called with:', event.payload);
  try {
    const { level, limit = 100, clear = false } = event.payload || {};
    
    let logs = [...consoleLogs];
    
    if (level && level !== 'all') {
      logs = logs.filter(log => log.level === level);
    }
    
    logs = logs.slice(-limit);
    
    if (clear) {
      consoleLogs.length = 0;
    }
    
    console.log('[MCP-DEBUG] Emitting response with', logs.length, 'logs');
    await emit('get-console-logs-response', {
      success: true,
      data: {
        logs,
        totalCount: consoleLogs.length,
        returnedCount: logs.length,
      }
    });
  } catch (error) {
    console.error('[MCP-DEBUG] handleGetConsoleLogs error:', error);
    await emit('get-console-logs-response', { success: false, error: String(error) });
  }
}

export async function initMcpDebug(): Promise<void> {
  console.log('[MCP-DEBUG] Initializing...');
  
  setupConsoleCapture();
  
  (window as unknown as Record<string, unknown>).__MCP_CONSOLE_LOGS__ = consoleLogs;
  
  unlisteners.push(await listen('get-local-storage', handleLocalStorage));
  unlisteners.push(await listen('execute-js', handleExecuteJs));
  unlisteners.push(await listen('get-element-position', handleGetElementPosition));
  unlisteners.push(await listen('send-text-to-element', handleSendTextToElement));
  
  console.log('[MCP-DEBUG] Registering get-console-logs listener...');
  unlisteners.push(await listen<GetConsoleLogsPayload>('get-console-logs', async (event) => {
    console.log('[MCP-DEBUG] get-console-logs event RECEIVED:', event);
    await handleGetConsoleLogs(event);
  }));
  console.log('[MCP-DEBUG] get-console-logs listener registered');
  
  (window as unknown as Record<string, unknown>).__MCP_DEBUG_READY__ = true;
  console.log('[MCP-DEBUG] Ready');
}

export async function cleanupMcpDebug(): Promise<void> {
  for (const unlisten of unlisteners) unlisten();
  unlisteners.length = 0;
}

interface LocalStoragePayload {
  action: string;
  key?: string;
  value?: string;
}

async function handleLocalStorage(event: { payload: LocalStoragePayload }): Promise<void> {
  try {
    const { action, key, value } = event.payload;
    let result: unknown;
    
    switch (action) {
      case 'get':
        if (key) {
          result = { success: true, data: localStorage.getItem(key) };
        } else {
          const items: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) items[k] = localStorage.getItem(k) || '';
          }
          result = { success: true, data: items };
        }
        break;
      case 'set':
        if (!key) throw new Error('Key required');
        localStorage.setItem(key, value || '');
        result = { success: true };
        break;
      case 'remove':
        if (!key) throw new Error('Key required');
        localStorage.removeItem(key);
        result = { success: true };
        break;
      case 'clear':
        localStorage.clear();
        result = { success: true };
        break;
      case 'keys':
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) keys.push(k);
        }
        result = { success: true, data: keys };
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    await emit('get-local-storage-response', result);
  } catch (error) {
    await emit('get-local-storage-response', { success: false, error: String(error) });
  }
}

async function handleExecuteJs(event: { payload: string }): Promise<void> {
  try {
    const code = event.payload;
    const result = new Function(`return (${code})`)();
    
    await emit('execute-js-response', {
      result: typeof result === 'object' ? JSON.stringify(result) : String(result),
      type: typeof result
    });
  } catch (error) {
    await emit('execute-js-response', {
      result: null,
      type: 'error',
      error: String(error)
    });
  }
}

interface ElementPositionPayload {
  selectorType: string;
  selectorValue: string;
  shouldClick?: boolean;
}

async function handleGetElementPosition(event: { payload: ElementPositionPayload }): Promise<void> {
  try {
    const { selectorType, selectorValue, shouldClick = false } = event.payload;
    
    const element = findElement(selectorType, selectorValue);
    if (!element) {
      await emit('get-element-position-response', {
        success: false,
        error: `Element not found: ${selectorType}="${selectorValue}"`
      });
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 + window.scrollX;
    const centerY = rect.top + rect.height / 2 + window.scrollY;
    
    if (shouldClick && element instanceof HTMLElement) {
      element.click();
    }
    
    await emit('get-element-position-response', {
      success: true,
      data: {
        x: centerX,
        y: centerY,
        element: {
          tag: element.tagName,
          classes: element.className,
          id: element.id,
          text: element.textContent?.trim()?.slice(0, 100) || ''
        },
        clicked: shouldClick
      }
    });
  } catch (error) {
    await emit('get-element-position-response', { success: false, error: String(error) });
  }
}

interface SendTextPayload {
  selectorType: string;
  selectorValue: string;
  text: string;
  delayMs?: number;
}

async function handleSendTextToElement(event: { payload: SendTextPayload }): Promise<void> {
  try {
    const { selectorType, selectorValue, text, delayMs = 20 } = event.payload;
    
    const element = findElement(selectorType, selectorValue) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!element) {
      await emit('send-text-to-element-response', {
        success: false,
        error: `Element not found: ${selectorType}="${selectorValue}"`
      });
      return;
    }
    
    element.focus();
    
    for (const char of text) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      
      if ('value' in element) {
        element.value += char;
      } else if ((element as HTMLElement).isContentEditable) {
        document.execCommand('insertText', false, char);
      }
      
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      
      if (delayMs > 0) await sleep(delayMs);
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    await emit('send-text-to-element-response', {
      success: true,
      data: {
        element: {
          tag: element.tagName,
          classes: element.className,
          id: element.id,
          text: text
        }
      }
    });
  } catch (error) {
    await emit('send-text-to-element-response', { success: false, error: String(error) });
  }
}

function findElement(selectorType: string, selectorValue: string): Element | null {
  switch (selectorType) {
    case 'id':
      return document.getElementById(selectorValue);
    case 'class':
      return document.getElementsByClassName(selectorValue)[0] || null;
    case 'tag':
      return document.getElementsByTagName(selectorValue)[0] || null;
    case 'text':
      return findElementByText(selectorValue);
    case 'selector':
      return document.querySelector(selectorValue);
    default:
      return document.querySelector(selectorValue);
  }
}

function findElementByText(text: string): Element | null {
  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    if (element.textContent?.trim() === text) return element;
    if (element instanceof HTMLInputElement && element.placeholder === text) return element;
    if (element.getAttribute('aria-label') === text) return element;
  }
  for (const element of allElements) {
    if (element.textContent?.includes(text)) return element;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { initMcpDebug, cleanupMcpDebug };
