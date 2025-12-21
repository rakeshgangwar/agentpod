# Tauri MCP Server

This is a Model Context Protocol (MCP) server that connects to a Tauri application's socket server to provide tools for controlling and interacting with the Tauri application.

## Overview

The server bridges MCP clients (like LLMs) with a Tauri application by:

1. Connecting to the Tauri socket server via a Unix socket/named pipe
2. Providing MCP tools that map to Tauri functionality
3. Running as a stdio-based MCP server that any MCP client can use

## Available Tools

The server provides the following MCP tools:

### `take_screenshot`

Take a screenshot of a Tauri application window.

**Parameters:**
- `window_label` (optional): The label of the window to capture (default: "main")
- `quality` (optional): JPEG quality from 1-100
- `max_width` (optional): Maximum image width in pixels
- `max_size_mb` (optional): Maximum file size in MB

**Returns:**
- Image content with base64-encoded data

### `execute_js`

Execute JavaScript code in a Tauri window.

**Parameters:**
- `code`: JavaScript code to execute
- `window_label` (optional): The window to execute in (default: "main")
- `timeout_ms` (optional): Maximum execution time in milliseconds

**Returns:**
- The result of the JavaScript execution, serialized as a string

### `manage_window`

Control Tauri application windows.

**Parameters:**
- `operation`: Operation to perform (e.g., "focus", "minimize", "maximize", "setPosition", "setSize")
- `window_label` (optional): Target window (default: "main")
- `x` (optional): X position for setPosition
- `y` (optional): Y position for setPosition
- `width` (optional): Width for setSize
- `height` (optional): Height for setSize

**Returns:**
- Success message

### `manage_local_storage`

Manage localStorage in the Tauri webview.

**Parameters:**
- `action`: Action to perform ("get", "set", "remove", "clear", or "keys")
- `key` (optional): Key to get, set, or remove
- `value` (optional): Value to set
- `window_label` (optional): Target window (default: "main")

**Returns:**
- Operation result

### `get_console_logs`

Retrieve captured console logs from the application window.

**Parameters:**
- `window_label` (optional): Target window (default: "main")
- `level` (optional): Filter by log level ("log", "info", "warn", "error", "debug", or "all")
- `limit` (optional): Maximum number of entries to return (default: 100, max: 500)
- `clear` (optional): Clear the log buffer after retrieval (default: false)

**Returns:**
- Array of log entries with level, args, and timestamp

### `get_network_logs`

Retrieve captured network requests (fetch and XMLHttpRequest) from the application window.

**Parameters:**
- `window_label` (optional): Target window (default: "main")
- `method` (optional): Filter by HTTP method (GET, POST, PUT, DELETE, etc.)
- `url_pattern` (optional): Filter by URL pattern (regex)
- `status` (optional): Filter by HTTP status code
- `limit` (optional): Maximum number of entries to return (default: 100, max: 500)
- `clear` (optional): Clear the log buffer after retrieval (default: false)

**Returns:**
- Array of network log entries with method, url, status, headers, body, timing, and error info

### `get_element_position`

Find an HTML element and get its position coordinates.

**Parameters:**
- `selector_type`: Type of selector ("id", "class", "tag", "text", or "selector")
- `selector_value`: The selector value to search for
- `should_click` (optional): Click the element after finding it (default: false)
- `window_label` (optional): Target window (default: "main")

**Returns:**
- Element position (x, y) and metadata (tag, classes, id, text)

### `send_text_to_element`

Find an element and send text input to it.

**Parameters:**
- `selector_type`: Type of selector ("id", "class", "tag", "text", or "selector")
- `selector_value`: The selector value to search for
- `text`: Text to input into the element
- `delay_ms` (optional): Delay between keystrokes in ms (default: 20)
- `window_label` (optional): Target window (default: "main")

**Returns:**
- Success status and element metadata

### `simulate_mouse_movement`

Simulate mouse cursor movement and clicks.

**Parameters:**
- `x`: Target X coordinate
- `y`: Target Y coordinate
- `relative` (optional): Treat coordinates as relative to current position (default: false)
- `click` (optional): Perform a click at the target position (default: false)
- `button` (optional): Mouse button for click ("left", "right", "middle")

**Returns:**
- Success status and final cursor position

### `simulate_text_input`

Simulate keyboard text input at the current focus.

**Parameters:**
- `text`: Text to type
- `delay_ms` (optional): Delay between keystrokes in ms
- `initial_delay_ms` (optional): Initial delay before typing starts

**Returns:**
- Success status, characters typed, and duration

## Setup and Usage

1. Ensure the Tauri application is running with the socket server active
2. Start this MCP server
3. Connect your MCP client to this server
4. Use the tools to interact with the Tauri application

The server connects to the Tauri socket at `/private/tmp/tauri-mcp.sock`.

## Error Handling

All tools follow the MCP error reporting convention:
- If a tool succeeds, it returns a result object with `content`
- If a tool fails, it returns an object with `isError: true` and an error message in `content`

## Example

Using the `take_screenshot` tool from an MCP client:

```json
{
  "name": "take_screenshot",
  "arguments": {
    "window_label": "main",
    "quality": 90,
    "max_width": 1920
  }
}
```

The response will include base64-encoded image data that can be rendered or saved as a JPEG file. 