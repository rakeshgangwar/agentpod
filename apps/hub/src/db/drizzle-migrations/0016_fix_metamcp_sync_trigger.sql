-- Fix MetaMCP sync trigger: Remove INSERT trigger (API handles initial sync via tRPC)
-- Keep UPDATE trigger as backup for syncing changes

-- Drop the INSERT trigger that causes duplicates
DROP TRIGGER IF EXISTS sync_mcp_server_insert ON mcp_servers;
DROP TRIGGER IF EXISTS trigger_sync_mcp_server_to_metamcp_insert ON mcp_servers;

-- Create helper function for JSON array conversion (if not exists)
CREATE OR REPLACE FUNCTION jsonb_array_to_text_array(input_jsonb jsonb)
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
    result text[];
BEGIN
    SELECT ARRAY_AGG(elem::text)
    INTO result
    FROM jsonb_array_elements_text(COALESCE(input_jsonb, '[]'::jsonb)) AS elem;
    RETURN COALESCE(result, ARRAY[]::text[]);
END;
$$;

-- Update the UPDATE trigger function to handle syncing changes
-- This fires when server config changes AFTER initial sync is done
CREATE OR REPLACE FUNCTION sync_mcp_server_to_metamcp_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  args_array text[];
  type_val text;
BEGIN
  -- Skip if called from MetaMCP sync context
  IF current_setting('application_name', true) = 'metamcp_sync' THEN
    RETURN NEW;
  END IF;

  -- Skip if metamcp_server_id is not set (not yet synced by API)
  IF NEW.metamcp_server_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if metamcp_server_id just got set (API just did the sync)
  IF OLD.metamcp_server_id IS NULL AND NEW.metamcp_server_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only sync if relevant fields changed
  IF OLD.name = NEW.name 
     AND OLD.description IS NOT DISTINCT FROM NEW.description
     AND OLD.type = NEW.type 
     AND OLD.command IS NOT DISTINCT FROM NEW.command
     AND OLD.args IS NOT DISTINCT FROM NEW.args
     AND OLD.url IS NOT DISTINCT FROM NEW.url
     AND OLD.environment IS NOT DISTINCT FROM NEW.environment
     AND OLD.auth_config IS NOT DISTINCT FROM NEW.auth_config
  THEN
    RETURN NEW;
  END IF;

  args_array := jsonb_array_to_text_array(NEW.args);
  type_val := CASE NEW.type::text
    WHEN 'STREAMABLE_HTTP' THEN 'STREAMABLE_HTTP'
    WHEN 'SSE' THEN 'SSE'
    ELSE 'STDIO'
  END;

  -- Update the existing MetaMCP server record
  PERFORM dblink_exec('dbname=metamcp user=agentpod password=agentpod-dev-password application_name=agentpod_sync',
    format('UPDATE mcp_servers SET 
              name = %L,
              description = %L,
              type = %L::mcp_server_type,
              command = %L,
              args = %L::text[],
              url = %L,
              env = %L::jsonb,
              bearer_token = %L,
              headers = %L::jsonb
            WHERE uuid = %L::uuid',
        NEW.name, NEW.description, type_val, NEW.command,
        args_array, NEW.url, COALESCE(NEW.environment, '{}'),
        NEW.auth_config->>'bearer_token',
        COALESCE(NEW.auth_config->'headers', '{}'),
        NEW.metamcp_server_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'MCP server sync (update) to MetaMCP failed for server %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Recreate UPDATE trigger with new function
DROP TRIGGER IF EXISTS sync_mcp_server_update ON mcp_servers;
CREATE TRIGGER sync_mcp_server_update
  AFTER UPDATE ON mcp_servers
  FOR EACH ROW
  EXECUTE FUNCTION sync_mcp_server_to_metamcp_update();
