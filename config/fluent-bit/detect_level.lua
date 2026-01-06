-- Detect log level from log content
function detect_level(tag, timestamp, record)
    local log = record["log"] or ""
    local level = record["level"] or ""
    
    -- If level already set, keep it
    if level ~= "" then
        return 0, timestamp, record
    end
    
    -- Convert to lowercase for matching
    local log_lower = string.lower(log)
    
    -- Check for common log level patterns
    if string.match(log_lower, "error") or string.match(log_lower, "err") or string.match(log_lower, "fatal") or string.match(log_lower, "panic") then
        record["level"] = "error"
    elseif string.match(log_lower, "warn") or string.match(log_lower, "warning") then
        record["level"] = "warn"
    elseif string.match(log_lower, "debug") or string.match(log_lower, "dbg") then
        record["level"] = "debug"
    elseif string.match(log_lower, "trace") then
        record["level"] = "trace"
    -- Check HTTP status codes for access logs (4xx = warn, 5xx = error)
    elseif string.match(log, "\" 5%d%d ") then
        record["level"] = "error"
    elseif string.match(log, "\" 4%d%d ") then
        record["level"] = "warn"
    elseif string.match(log, "\" [23]%d%d ") then
        record["level"] = "info"
    else
        record["level"] = "info"
    end
    
    return 1, timestamp, record
end
