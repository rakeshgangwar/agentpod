import { db, rawSql } from "../../src/db/drizzle";
import { user } from "../../src/db/schema/auth";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function createTestUser(
  userData: Partial<TestUser> = {}
): Promise<TestUser> {
  const testUser: TestUser = {
    id: userData.id || `test-user-${crypto.randomUUID().slice(0, 8)}`,
    email:
      userData.email || `test-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: userData.name || "Test User",
    emailVerified: userData.emailVerified ?? true,
    role: userData.role || "user",
    createdAt: userData.createdAt || new Date(),
    updatedAt: userData.updatedAt || new Date(),
  };

  await db.insert(user).values(testUser).onConflictDoNothing();

  return testUser;
}

export const TEST_USER_ID = "test-user-123";
export const DEFAULT_USER_ID = "default-user";

export async function getOrCreateDefaultTestUser(): Promise<TestUser> {
  const existing = await rawSql`
    SELECT id, email, name, email_verified, role, created_at, updated_at 
    FROM "user" 
    WHERE id = ${TEST_USER_ID} 
    LIMIT 1
  `;

  if (existing.length > 0) {
    const row = existing[0] as {
      id: string;
      email: string;
      name: string;
      email_verified: boolean;
      role: string;
      created_at: Date;
      updated_at: Date;
    };
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: row.email_verified,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  return createTestUser({
    id: TEST_USER_ID,
    email: "test@example.com",
    name: "Test User",
  });
}

export async function setupTestUsers(): Promise<{
  testUser: TestUser;
  apiKeyUser: TestUser;
}> {
  const testUser = await createTestUser({
    id: TEST_USER_ID,
    email: "test@example.com",
    name: "Test User",
  });

  const apiKeyUser = await createTestUser({
    id: DEFAULT_USER_ID,
    email: "default@example.com",
    name: "Default API User",
  });

  return { testUser, apiKeyUser };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await rawSql`DELETE FROM "user" WHERE id = ${userId}`;
}

export async function clearDatabase(): Promise<void> {
  await rawSql`DELETE FROM chat_messages`;
  await rawSql`DELETE FROM chat_sessions`;
  await rawSql`DELETE FROM activity_log`;
  await rawSql`DELETE FROM user_preferences`;
  await rawSql`DELETE FROM provider_credentials`;
  await rawSql`DELETE FROM oauth_state`;
  await rawSql`DELETE FROM sandboxes`;

  try {
    await rawSql`DELETE FROM settings`;
  } catch {
    /* empty */
  }

  await rawSql`DELETE FROM "user" WHERE id LIKE 'test-%'`;
}

export async function clearProviderData(): Promise<void> {
  await rawSql`DELETE FROM provider_credentials`;
  await rawSql`DELETE FROM oauth_state`;
  try {
    await rawSql`DELETE FROM settings WHERE key = 'default_provider'`;
  } catch {
    /* empty */
  }
}

export async function clearProviderDataForUser(userId: string): Promise<void> {
  await rawSql`DELETE FROM provider_credentials WHERE user_id = ${userId}`;
  await rawSql`DELETE FROM oauth_state WHERE user_id = ${userId}`;
}
