import { createLogger } from "../utils/logger";
import postgres from "postgres";

const log = createLogger("sso-sync");

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod";

const metamcpConnectionString = 
  process.env.METAMCP_DATABASE_URL || 
  connectionString.replace(/\/agentpod$/, "/metamcp");

export async function ensureSsoViews(): Promise<void> {
  log.info("Setting up bidirectional sync triggers for MetaMCP...");

  const agentpodClient = postgres(connectionString, { max: 1 });
  const metamcpClient = postgres(metamcpConnectionString, { max: 1 });

  try {
    const metamcpTablesExist = await waitForMetaMcpTables(metamcpClient, 10, 3000);
    if (!metamcpTablesExist) {
      log.warn("MetaMCP tables not ready after retries, skipping SSO setup");
      return;
    }

    // Forward sync: AgentPod → MetaMCP
    await setupDblink(agentpodClient);
    await createSyncFunctions(agentpodClient);
    await createSyncTriggers(agentpodClient);
    await initialSync(agentpodClient, metamcpClient);

    // Reverse sync: MetaMCP → AgentPod
    await setupReverseSyncDblink(metamcpClient);
    await createReverseSyncFunctions(metamcpClient);
    await createReverseSyncTriggers(metamcpClient);
    await initialReverseSync(agentpodClient, metamcpClient);

    log.info("Bidirectional sync triggers configured successfully");
  } catch (error) {
    log.error("Failed to set up bidirectional sync", { error });
  } finally {
    await agentpodClient.end();
    await metamcpClient.end();
  }
}

async function checkMetaMcpTables(client: postgres.Sql): Promise<boolean> {
  try {
    const result = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      ) as users_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'sessions'
      ) as sessions_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'oauth_sessions'
      ) as oauth_sessions_exists
    `;
    const usersExist = Boolean(result[0]?.users_exists);
    const sessionsExist = Boolean(result[0]?.sessions_exists);
    const oauthSessionsExist = Boolean(result[0]?.oauth_sessions_exists);
    log.info("MetaMCP table check", { usersExist, sessionsExist, oauthSessionsExist, raw: result[0] });
    return usersExist && sessionsExist && oauthSessionsExist;
  } catch (error) {
    log.error("Failed to check MetaMCP tables", { error });
    return false;
  }
}

async function waitForMetaMcpTables(
  client: postgres.Sql,
  maxRetries: number,
  delayMs: number
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const tablesExist = await checkMetaMcpTables(client);
    if (tablesExist) {
      log.info("MetaMCP tables ready", { attempt });
      return true;
    }
    
    if (attempt < maxRetries) {
      log.info("Waiting for MetaMCP tables...", { attempt, maxRetries, nextRetryIn: `${delayMs}ms` });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

async function setupDblink(client: postgres.Sql): Promise<void> {
  await client`CREATE EXTENSION IF NOT EXISTS dblink`;
  log.info("dblink extension enabled");
}

async function createSyncFunctions(client: postgres.Sql): Promise<void> {
  const password = process.env.POSTGRES_PASSWORD || "agentpod-dev-password";
  const connStr = `dbname=metamcp user=agentpod password=${password} application_name=agentpod_sync`;

  await client.unsafe(`
    CREATE OR REPLACE FUNCTION jsonb_array_to_text_array(jsonb_arr jsonb)
    RETURNS text[] AS $$
    BEGIN
      IF jsonb_arr IS NULL OR jsonb_arr = 'null'::jsonb THEN
        RETURN '{}'::text[];
      END IF;
      RETURN ARRAY(SELECT jsonb_array_elements_text(jsonb_arr));
    EXCEPTION WHEN OTHERS THEN
      RETURN '{}'::text[];
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await client.unsafe(`
    CREATE OR REPLACE FUNCTION sync_user_to_metamcp_insert()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}',
        format('INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at) 
                VALUES (%L, %L, %L, %L, %L, %L, %L)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, email = EXCLUDED.email,
                    email_verified = EXCLUDED.email_verified, image = EXCLUDED.image,
                    updated_at = EXCLUDED.updated_at',
            NEW.id, NEW.name, NEW.email, NEW.email_verified, NEW.image,
            NEW.created_at, NEW.updated_at)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for user %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_user_to_metamcp_update()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}',
        format('UPDATE users SET name = %L, email = %L, email_verified = %L, image = %L, updated_at = %L WHERE id = %L',
            NEW.name, NEW.email, NEW.email_verified, NEW.image, NEW.updated_at, NEW.id)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for user update %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_user_to_metamcp_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}', format('DELETE FROM users WHERE id = %L', OLD.id));
      RETURN OLD;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for user delete %: %', OLD.id, SQLERRM;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_session_to_metamcp_insert()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}',
        format('INSERT INTO sessions (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id) 
                VALUES (%L, %L, %L, %L, %L, %L, %L, %L)
                ON CONFLICT (id) DO UPDATE SET
                    expires_at = EXCLUDED.expires_at, token = EXCLUDED.token,
                    updated_at = EXCLUDED.updated_at, ip_address = EXCLUDED.ip_address,
                    user_agent = EXCLUDED.user_agent',
            NEW.id, NEW.expires_at, NEW.token, NEW.created_at, NEW.updated_at,
            NEW.ip_address, NEW.user_agent, NEW.user_id)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for session %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_session_to_metamcp_update()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}',
        format('UPDATE sessions SET expires_at = %L, token = %L, updated_at = %L, ip_address = %L, user_agent = %L WHERE id = %L',
            NEW.expires_at, NEW.token, NEW.updated_at, NEW.ip_address, NEW.user_agent, NEW.id)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for session update %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_session_to_metamcp_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}', format('DELETE FROM sessions WHERE id = %L', OLD.id));
      RETURN OLD;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for session delete %: %', OLD.id, SQLERRM;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_account_to_metamcp_insert()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}',
        format('INSERT INTO accounts (id, account_id, provider_id, user_id, access_token, refresh_token, 
                    id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at) 
                VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)
                ON CONFLICT (id) DO UPDATE SET
                    access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
                    id_token = EXCLUDED.id_token, access_token_expires_at = EXCLUDED.access_token_expires_at,
                    refresh_token_expires_at = EXCLUDED.refresh_token_expires_at, scope = EXCLUDED.scope,
                    password = EXCLUDED.password, updated_at = EXCLUDED.updated_at',
            NEW.id, NEW.account_id, NEW.provider_id, NEW.user_id, NEW.access_token,
            NEW.refresh_token, NEW.id_token, NEW.access_token_expires_at,
            NEW.refresh_token_expires_at, NEW.scope, NEW.password, NEW.created_at, NEW.updated_at)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for account %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_account_to_metamcp_update()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}',
        format('UPDATE accounts SET access_token = %L, refresh_token = %L, id_token = %L,
                    access_token_expires_at = %L, refresh_token_expires_at = %L, scope = %L,
                    password = %L, updated_at = %L WHERE id = %L',
            NEW.access_token, NEW.refresh_token, NEW.id_token,
            NEW.access_token_expires_at, NEW.refresh_token_expires_at,
            NEW.scope, NEW.password, NEW.updated_at, NEW.id)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for account update %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_account_to_metamcp_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}', format('DELETE FROM accounts WHERE id = %L', OLD.id));
      RETURN OLD;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SSO sync to MetaMCP failed for account delete %: %', OLD.id, SQLERRM;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_mcp_server_to_metamcp_insert()
    RETURNS TRIGGER AS $$
    DECLARE
      args_array text[];
      type_val text;
    BEGIN
      IF current_setting('application_name', true) = 'metamcp_sync' THEN
        RETURN NEW;
      END IF;

      args_array := jsonb_array_to_text_array(NEW.args);
      type_val := CASE NEW.type::text
        WHEN 'STREAMABLE_HTTP' THEN 'STREAMABLE_HTTP'
        WHEN 'SSE' THEN 'SSE'
        ELSE 'STDIO'
      END;
      
      PERFORM dblink_exec('${connStr}',
        format('INSERT INTO mcp_servers (uuid, name, description, type, command, args, url, env, bearer_token, headers, user_id, created_at) 
                VALUES (%L::uuid, %L, %L, %L::mcp_server_type, %L, %L::text[], %L, %L::jsonb, %L, %L::jsonb, %L, %L)
                ON CONFLICT (uuid) DO NOTHING',
            NEW.id, NEW.name, NEW.description, type_val, NEW.command,
            args_array, NEW.url, COALESCE(NEW.environment, '{}'),
            NEW.auth_config->>'bearer_token',
            COALESCE(NEW.auth_config->'headers', '{}'),
            NEW.user_id, NEW.created_at)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'MCP server sync to MetaMCP failed for server %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_mcp_server_to_metamcp_update()
    RETURNS TRIGGER AS $$
    DECLARE
      args_array text[];
      type_val text;
    BEGIN
      IF current_setting('application_name', true) = 'metamcp_sync' THEN
        RETURN NEW;
      END IF;

      args_array := jsonb_array_to_text_array(NEW.args);
      type_val := CASE NEW.type::text
        WHEN 'STREAMABLE_HTTP' THEN 'STREAMABLE_HTTP'
        WHEN 'SSE' THEN 'SSE'
        ELSE 'STDIO'
      END;
      
      PERFORM dblink_exec('${connStr}',
        format('UPDATE mcp_servers SET name = %L, description = %L, type = %L::mcp_server_type,
                    command = %L, args = %L::text[], url = %L, env = %L::jsonb,
                    bearer_token = %L, headers = %L::jsonb
                WHERE uuid = %L::uuid',
            NEW.name, NEW.description, type_val, NEW.command,
            args_array, NEW.url, COALESCE(NEW.environment, '{}'),
            NEW.auth_config->>'bearer_token',
            COALESCE(NEW.auth_config->'headers', '{}'),
            NEW.id)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'MCP server sync to MetaMCP failed for update %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_mcp_server_to_metamcp_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      IF current_setting('application_name', true) = 'metamcp_sync' THEN
        RETURN OLD;
      END IF;
      PERFORM dblink_exec('${connStr}', format('DELETE FROM mcp_servers WHERE uuid = %L::uuid', OLD.id));
      RETURN OLD;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'MCP server sync to MetaMCP failed for delete %: %', OLD.id, SQLERRM;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    -- OAuth Session Sync Functions (AgentPod → MetaMCP)
    -- Only sync when status is 'authorized' (has valid tokens)
    CREATE OR REPLACE FUNCTION sync_oauth_session_to_metamcp_insert()
    RETURNS TRIGGER AS $$
    DECLARE
      client_info jsonb;
      tokens_jsonb jsonb;
    BEGIN
      -- Only sync authorized sessions with tokens
      IF NEW.status != 'authorized' OR NEW.access_token IS NULL THEN
        RETURN NEW;
      END IF;

      -- Build client_information jsonb
      client_info := jsonb_build_object(
        'client_id', COALESCE(NEW.client_id, ''),
        'client_secret', COALESCE(NEW.client_secret, '')
      );

      -- Build tokens jsonb
      tokens_jsonb := jsonb_build_object(
        'access_token', NEW.access_token,
        'refresh_token', COALESCE(NEW.refresh_token, ''),
        'token_type', COALESCE(NEW.token_type, 'Bearer'),
        'expires_at', CASE WHEN NEW.expires_at IS NOT NULL 
                          THEN extract(epoch from NEW.expires_at)::bigint 
                          ELSE NULL END,
        'scope', COALESCE(NEW.scope, '')
      );

      PERFORM dblink_exec('${connStr}',
        format('INSERT INTO oauth_sessions (uuid, mcp_server_uuid, client_information, tokens, code_verifier, created_at, updated_at) 
                VALUES (%L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L, %L, %L)
                ON CONFLICT (mcp_server_uuid) DO UPDATE SET
                    client_information = EXCLUDED.client_information,
                    tokens = EXCLUDED.tokens,
                    code_verifier = EXCLUDED.code_verifier,
                    updated_at = EXCLUDED.updated_at',
            NEW.id, NEW.mcp_server_id, client_info, tokens_jsonb,
            NEW.code_verifier, NEW.created_at, NEW.updated_at)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'OAuth session sync to MetaMCP failed for session %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_oauth_session_to_metamcp_update()
    RETURNS TRIGGER AS $$
    DECLARE
      client_info jsonb;
      tokens_jsonb jsonb;
    BEGIN
      -- If status changed FROM authorized, delete from MetaMCP
      IF OLD.status = 'authorized' AND NEW.status != 'authorized' THEN
        PERFORM dblink_exec('${connStr}', format('DELETE FROM oauth_sessions WHERE uuid = %L::uuid', OLD.id));
        RETURN NEW;
      END IF;

      -- Only sync authorized sessions with tokens
      IF NEW.status != 'authorized' OR NEW.access_token IS NULL THEN
        RETURN NEW;
      END IF;

      -- Build client_information jsonb
      client_info := jsonb_build_object(
        'client_id', COALESCE(NEW.client_id, ''),
        'client_secret', COALESCE(NEW.client_secret, '')
      );

      -- Build tokens jsonb
      tokens_jsonb := jsonb_build_object(
        'access_token', NEW.access_token,
        'refresh_token', COALESCE(NEW.refresh_token, ''),
        'token_type', COALESCE(NEW.token_type, 'Bearer'),
        'expires_at', CASE WHEN NEW.expires_at IS NOT NULL 
                          THEN extract(epoch from NEW.expires_at)::bigint 
                          ELSE NULL END,
        'scope', COALESCE(NEW.scope, '')
      );

      PERFORM dblink_exec('${connStr}',
        format('INSERT INTO oauth_sessions (uuid, mcp_server_uuid, client_information, tokens, code_verifier, created_at, updated_at) 
                VALUES (%L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L, %L, %L)
                ON CONFLICT (mcp_server_uuid) DO UPDATE SET
                    client_information = EXCLUDED.client_information,
                    tokens = EXCLUDED.tokens,
                    code_verifier = EXCLUDED.code_verifier,
                    updated_at = EXCLUDED.updated_at',
            NEW.id, NEW.mcp_server_id, client_info, tokens_jsonb,
            NEW.code_verifier, NEW.created_at, NEW.updated_at)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'OAuth session sync to MetaMCP failed for update %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_oauth_session_to_metamcp_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM dblink_exec('${connStr}', format('DELETE FROM oauth_sessions WHERE uuid = %L::uuid', OLD.id));
      RETURN OLD;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'OAuth session sync to MetaMCP failed for delete %: %', OLD.id, SQLERRM;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `);

  log.info("SSO sync functions created");
}

async function createSyncTriggers(client: postgres.Sql): Promise<void> {
  await client.unsafe(`
    DROP TRIGGER IF EXISTS sync_user_insert ON "user";
    DROP TRIGGER IF EXISTS sync_user_update ON "user";
    DROP TRIGGER IF EXISTS sync_user_delete ON "user";
    DROP TRIGGER IF EXISTS sync_session_insert ON session;
    DROP TRIGGER IF EXISTS sync_session_update ON session;
    DROP TRIGGER IF EXISTS sync_session_delete ON session;
    DROP TRIGGER IF EXISTS sync_account_insert ON account;
    DROP TRIGGER IF EXISTS sync_account_update ON account;
    DROP TRIGGER IF EXISTS sync_account_delete ON account;

    CREATE TRIGGER sync_user_insert AFTER INSERT ON "user"
      FOR EACH ROW EXECUTE FUNCTION sync_user_to_metamcp_insert();
    CREATE TRIGGER sync_user_update AFTER UPDATE ON "user"
      FOR EACH ROW EXECUTE FUNCTION sync_user_to_metamcp_update();
    CREATE TRIGGER sync_user_delete AFTER DELETE ON "user"
      FOR EACH ROW EXECUTE FUNCTION sync_user_to_metamcp_delete();

    CREATE TRIGGER sync_session_insert AFTER INSERT ON session
      FOR EACH ROW EXECUTE FUNCTION sync_session_to_metamcp_insert();
    CREATE TRIGGER sync_session_update AFTER UPDATE ON session
      FOR EACH ROW EXECUTE FUNCTION sync_session_to_metamcp_update();
    CREATE TRIGGER sync_session_delete AFTER DELETE ON session
      FOR EACH ROW EXECUTE FUNCTION sync_session_to_metamcp_delete();

    CREATE TRIGGER sync_account_insert AFTER INSERT ON account
      FOR EACH ROW EXECUTE FUNCTION sync_account_to_metamcp_insert();
    CREATE TRIGGER sync_account_update AFTER UPDATE ON account
      FOR EACH ROW EXECUTE FUNCTION sync_account_to_metamcp_update();
    CREATE TRIGGER sync_account_delete AFTER DELETE ON account
      FOR EACH ROW EXECUTE FUNCTION sync_account_to_metamcp_delete();

    DROP TRIGGER IF EXISTS sync_mcp_server_insert ON mcp_servers;
    DROP TRIGGER IF EXISTS sync_mcp_server_update ON mcp_servers;
    DROP TRIGGER IF EXISTS sync_mcp_server_delete ON mcp_servers;

    CREATE TRIGGER sync_mcp_server_insert AFTER INSERT ON mcp_servers
      FOR EACH ROW EXECUTE FUNCTION sync_mcp_server_to_metamcp_insert();
    CREATE TRIGGER sync_mcp_server_update AFTER UPDATE ON mcp_servers
      FOR EACH ROW EXECUTE FUNCTION sync_mcp_server_to_metamcp_update();
    CREATE TRIGGER sync_mcp_server_delete AFTER DELETE ON mcp_servers
      FOR EACH ROW EXECUTE FUNCTION sync_mcp_server_to_metamcp_delete();

    -- OAuth Session Sync Triggers
    DROP TRIGGER IF EXISTS sync_oauth_session_insert ON mcp_oauth_sessions;
    DROP TRIGGER IF EXISTS sync_oauth_session_update ON mcp_oauth_sessions;
    DROP TRIGGER IF EXISTS sync_oauth_session_delete ON mcp_oauth_sessions;

    CREATE TRIGGER sync_oauth_session_insert AFTER INSERT ON mcp_oauth_sessions
      FOR EACH ROW EXECUTE FUNCTION sync_oauth_session_to_metamcp_insert();
    CREATE TRIGGER sync_oauth_session_update AFTER UPDATE ON mcp_oauth_sessions
      FOR EACH ROW EXECUTE FUNCTION sync_oauth_session_to_metamcp_update();
    CREATE TRIGGER sync_oauth_session_delete AFTER DELETE ON mcp_oauth_sessions
      FOR EACH ROW EXECUTE FUNCTION sync_oauth_session_to_metamcp_delete();
  `);

  log.info("SSO sync triggers created");
}

async function initialSync(agentpodClient: postgres.Sql, metamcpClient: postgres.Sql): Promise<void> {
  log.info("Running initial SSO data sync...");

  const users = await agentpodClient`SELECT id, name, email, email_verified, image, created_at, updated_at FROM "user"`;
  for (const user of users) {
    try {
      await metamcpClient`
        INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.email_verified}, ${user.image}, ${user.created_at}, ${user.updated_at})
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (err) {
      log.warn("Failed to sync user", { userId: user.id, error: err });
    }
  }
  log.info(`Synced ${users.length} users to MetaMCP`);

  const sessions = await agentpodClient`SELECT id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id FROM session`;
  for (const session of sessions) {
    try {
      await metamcpClient`
        INSERT INTO sessions (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
        VALUES (${session.id}, ${session.expires_at}, ${session.token}, ${session.created_at}, ${session.updated_at}, ${session.ip_address}, ${session.user_agent}, ${session.user_id})
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (err) {
      log.warn("Failed to sync session", { sessionId: session.id, error: err });
    }
  }
  log.info(`Synced ${sessions.length} sessions to MetaMCP`);

  const accounts = await agentpodClient`SELECT id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at FROM account`;
  for (const account of accounts) {
    try {
      await metamcpClient`
        INSERT INTO accounts (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at)
        VALUES (${account.id}, ${account.account_id}, ${account.provider_id}, ${account.user_id}, ${account.access_token}, ${account.refresh_token}, ${account.id_token}, ${account.access_token_expires_at}, ${account.refresh_token_expires_at}, ${account.scope}, ${account.password}, ${account.created_at}, ${account.updated_at})
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (err) {
      log.warn("Failed to sync account", { accountId: account.id, error: err });
    }
  }
  log.info(`Synced ${accounts.length} accounts to MetaMCP`);

  const mcpServers = await agentpodClient`
    SELECT id, user_id, name, description, type, command, args, url, environment, auth_config, created_at 
    FROM mcp_servers WHERE enabled = true
  `;
  for (const server of mcpServers) {
    try {
      const argsArray = Array.isArray(server.args) ? server.args : [];
      const typeVal = server.type === "STREAMABLE_HTTP" ? "STREAMABLE_HTTP" : server.type === "SSE" ? "SSE" : "STDIO";
      const bearerToken = server.auth_config?.bearer_token || null;
      const headers = server.auth_config?.headers || {};
      
      await metamcpClient`
        INSERT INTO mcp_servers (uuid, name, description, type, command, args, url, env, bearer_token, headers, user_id, created_at)
        VALUES (
          ${server.id}::uuid, 
          ${server.name}, 
          ${server.description}, 
          ${typeVal}::mcp_server_type, 
          ${server.command}, 
          ${argsArray}::text[], 
          ${server.url}, 
          ${server.environment || {}}::jsonb, 
          ${bearerToken}, 
          ${headers}::jsonb, 
          ${server.user_id}, 
          ${server.created_at}
        )
        ON CONFLICT (uuid) DO NOTHING
      `;
    } catch (err) {
      log.warn("Failed to sync MCP server", { serverId: server.id, error: err });
    }
  }
  log.info(`Synced ${mcpServers.length} MCP servers to MetaMCP`);

  // Sync OAuth sessions (only authorized ones with tokens)
  const oauthSessions = await agentpodClient`
    SELECT id, mcp_server_id, client_id, client_secret, access_token, refresh_token, 
           token_type, expires_at, scope, code_verifier, status, created_at, updated_at 
    FROM mcp_oauth_sessions WHERE status = 'authorized' AND access_token IS NOT NULL
  `;
  for (const session of oauthSessions) {
    try {
      const clientInfo = JSON.stringify({
        client_id: session.client_id || "",
        client_secret: session.client_secret || ""
      });
      const tokens = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token || "",
        token_type: session.token_type || "Bearer",
        expires_at: session.expires_at ? Math.floor(new Date(session.expires_at).getTime() / 1000) : null,
        scope: session.scope || ""
      });

      await metamcpClient`
        INSERT INTO oauth_sessions (uuid, mcp_server_uuid, client_information, tokens, code_verifier, created_at, updated_at)
        VALUES (
          ${session.id}::uuid, 
          ${session.mcp_server_id}::uuid, 
          ${clientInfo}::jsonb, 
          ${tokens}::jsonb, 
          ${session.code_verifier}, 
          ${session.created_at}, 
          ${session.updated_at}
        )
        ON CONFLICT (mcp_server_uuid) DO UPDATE SET
          client_information = EXCLUDED.client_information,
          tokens = EXCLUDED.tokens,
          code_verifier = EXCLUDED.code_verifier,
          updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      log.warn("Failed to sync OAuth session", { sessionId: session.id, error: err });
    }
  }
  log.info(`Synced ${oauthSessions.length} OAuth sessions to MetaMCP`);

  log.info("Initial SSO sync completed");
}

async function setupReverseSyncDblink(metamcpClient: postgres.Sql): Promise<void> {
  await metamcpClient`CREATE EXTENSION IF NOT EXISTS dblink`;
  log.info("dblink extension enabled in MetaMCP database");
}

async function createReverseSyncFunctions(metamcpClient: postgres.Sql): Promise<void> {
  const password = process.env.POSTGRES_PASSWORD || "agentpod-dev-password";
  const connStr = `dbname=agentpod user=agentpod password=${password} application_name=metamcp_sync`;

  await metamcpClient.unsafe(`
    CREATE OR REPLACE FUNCTION text_array_to_jsonb(arr text[])
    RETURNS jsonb AS $$
    BEGIN
      IF arr IS NULL THEN
        RETURN '[]'::jsonb;
      END IF;
      RETURN to_jsonb(arr);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION sync_mcp_server_to_agentpod_insert()
    RETURNS TRIGGER AS $$
    DECLARE
      args_jsonb jsonb;
      auth_config jsonb;
      type_val text;
    BEGIN
      IF current_setting('application_name', true) = 'agentpod_sync' THEN
        RETURN NEW;
      END IF;

      args_jsonb := text_array_to_jsonb(NEW.args);
      auth_config := jsonb_build_object(
        'bearer_token', COALESCE(NEW.bearer_token, ''),
        'headers', COALESCE(NEW.headers, '{}'::jsonb)
      );
      type_val := COALESCE(NEW.type::text, 'STDIO');
      
      PERFORM dblink_exec('${connStr}',
        format('INSERT INTO mcp_servers (id, user_id, name, description, type, command, args, url, environment, auth_config, auth_type, enabled, created_at, updated_at) 
                VALUES (%L, %L, %L, %L, %L::mcp_server_type, %L, %L::jsonb, %L, %L::jsonb, %L::jsonb, %L::mcp_auth_type, true, %L, NOW())
                ON CONFLICT (id) DO NOTHING',
            NEW.uuid::text, NEW.user_id, NEW.name, NEW.description, type_val, NEW.command,
            args_jsonb, NEW.url, COALESCE(NEW.env, '{}'),
            auth_config,
            CASE WHEN NEW.bearer_token IS NOT NULL AND NEW.bearer_token != '' THEN 'bearer_token' ELSE 'none' END,
            NEW.created_at)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'MCP server reverse sync to AgentPod failed for server %: %', NEW.uuid, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_mcp_server_to_agentpod_update()
    RETURNS TRIGGER AS $$
    DECLARE
      args_jsonb jsonb;
      auth_config jsonb;
      type_val text;
    BEGIN
      IF current_setting('application_name', true) = 'agentpod_sync' THEN
        RETURN NEW;
      END IF;

      args_jsonb := text_array_to_jsonb(NEW.args);
      auth_config := jsonb_build_object(
        'bearer_token', COALESCE(NEW.bearer_token, ''),
        'headers', COALESCE(NEW.headers, '{}'::jsonb)
      );
      type_val := COALESCE(NEW.type::text, 'STDIO');
      
      PERFORM dblink_exec('${connStr}',
        format('UPDATE mcp_servers SET 
                    name = %L, description = %L, type = %L::mcp_server_type,
                    command = %L, args = %L::jsonb, url = %L, environment = %L::jsonb,
                    auth_config = %L::jsonb, 
                    auth_type = %L::mcp_auth_type,
                    updated_at = NOW()
                WHERE id = %L',
            NEW.name, NEW.description, type_val, NEW.command,
            args_jsonb, NEW.url, COALESCE(NEW.env, '{}'),
            auth_config,
            CASE WHEN NEW.bearer_token IS NOT NULL AND NEW.bearer_token != '' THEN 'bearer_token' ELSE 'none' END,
            NEW.uuid::text)
      );
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'MCP server reverse sync to AgentPod failed for update %: %', NEW.uuid, SQLERRM;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION sync_mcp_server_to_agentpod_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      IF current_setting('application_name', true) = 'agentpod_sync' THEN
        RETURN OLD;
      END IF;
      PERFORM dblink_exec('${connStr}', format('DELETE FROM mcp_servers WHERE id = %L', OLD.uuid::text));
      RETURN OLD;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'MCP server reverse sync to AgentPod failed for delete %: %', OLD.uuid, SQLERRM;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `);

  log.info("Reverse sync functions created in MetaMCP database");
}

async function createReverseSyncTriggers(metamcpClient: postgres.Sql): Promise<void> {
  await metamcpClient.unsafe(`
    DROP TRIGGER IF EXISTS sync_mcp_server_to_agentpod_insert ON mcp_servers;
    DROP TRIGGER IF EXISTS sync_mcp_server_to_agentpod_update ON mcp_servers;
    DROP TRIGGER IF EXISTS sync_mcp_server_to_agentpod_delete ON mcp_servers;

    CREATE TRIGGER sync_mcp_server_to_agentpod_insert AFTER INSERT ON mcp_servers
      FOR EACH ROW EXECUTE FUNCTION sync_mcp_server_to_agentpod_insert();
    CREATE TRIGGER sync_mcp_server_to_agentpod_update AFTER UPDATE ON mcp_servers
      FOR EACH ROW EXECUTE FUNCTION sync_mcp_server_to_agentpod_update();
    CREATE TRIGGER sync_mcp_server_to_agentpod_delete AFTER DELETE ON mcp_servers
      FOR EACH ROW EXECUTE FUNCTION sync_mcp_server_to_agentpod_delete();
  `);

  log.info("Reverse sync triggers created in MetaMCP database");
}

async function initialReverseSync(agentpodClient: postgres.Sql, metamcpClient: postgres.Sql): Promise<void> {
  log.info("Running initial reverse sync (MetaMCP → AgentPod)...");

  const metamcpServers = await metamcpClient`
    SELECT uuid, user_id, name, description, type, command, args, url, env, bearer_token, headers, created_at 
    FROM mcp_servers
  `;

  let synced = 0;
  for (const server of metamcpServers) {
    try {
      const exists = await agentpodClient`
        SELECT 1 FROM mcp_servers WHERE id = ${server.uuid.toString()}
      `;
      
      if (exists.length > 0) {
        continue;
      }

      const argsJsonb = JSON.stringify(server.args || []);
      const authConfig = JSON.stringify({
        bearer_token: server.bearer_token || "",
        headers: server.headers || {}
      });
      const typeVal = server.type || "STDIO";
      const authType = server.bearer_token ? "bearer_token" : "none";

      await agentpodClient`
        INSERT INTO mcp_servers (id, user_id, name, description, type, command, args, url, environment, auth_config, auth_type, enabled, created_at, updated_at)
        VALUES (
          ${server.uuid.toString()},
          ${server.user_id},
          ${server.name},
          ${server.description},
          ${typeVal}::mcp_server_type,
          ${server.command},
          ${argsJsonb}::jsonb,
          ${server.url},
          ${JSON.stringify(server.env || {})}::jsonb,
          ${authConfig}::jsonb,
          ${authType}::mcp_auth_type,
          true,
          ${server.created_at},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `;
      synced++;
    } catch (err) {
      log.warn("Failed to reverse sync MCP server", { serverId: server.uuid, error: err });
    }
  }
  
  log.info(`Reverse synced ${synced} new MCP servers from MetaMCP to AgentPod (${metamcpServers.length} total in MetaMCP)`);
}
