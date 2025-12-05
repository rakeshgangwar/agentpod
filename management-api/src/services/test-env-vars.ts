/**
 * Test environment variable behavior - using single POST calls
 */
import { config } from '../config.ts';

const BASE_URL = `${config.coolify.url}/api/v1`;

async function testEnvVars() {
  console.log('Testing environment variable behavior (single POST calls)...\n');
  
  // Create a test app
  console.log('1. Creating test app...');
  const createResponse = await fetch(`${BASE_URL}/applications/public`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.coolify.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      project_uuid: config.coolify.projectUuid,
      server_uuid: config.coolify.serverUuid,
      environment_name: 'production',
      git_repository: 'https://forgejo.superchotu.com/rakeshgangwar/CodeOpen.git',
      git_branch: 'main',
      build_pack: 'dockerfile',
      ports_exposes: '4096',
      name: 'test-env-single',
      base_directory: '/docker/opencode',
      instant_deploy: false,
    }),
  });
  
  if (createResponse.status !== 201) {
    console.log(`Failed to create app: ${await createResponse.text()}`);
    return;
  }
  
  const created = await createResponse.json();
  console.log(`   Created: ${created.uuid}`);
  
  // Check existing env vars
  console.log('\n2. Checking initial env vars...');
  let envResponse = await fetch(`${BASE_URL}/applications/${created.uuid}/envs`, {
    headers: { 'Authorization': `Bearer ${config.coolify.token}` },
  });
  let envVars = await envResponse.json();
  console.log(`   Initial env vars: ${envVars.length}`);
  
  // Create env vars one by one with single POST calls
  console.log('\n3. Creating env vars using single POST calls (with delay)...');
  const varsToSet = [
    { key: 'REPO_URL', value: 'https://example.com/repo.git' },
    { key: 'REPO_BRANCH', value: 'main' },
    { key: 'PROJECT_NAME', value: 'test-project' },
    { key: 'ANTHROPIC_API_KEY', value: 'sk-test-key' },
  ];
  
  for (const v of varsToSet) {
    console.log(`   Creating ${v.key}...`);
    const resp = await fetch(`${BASE_URL}/applications/${created.uuid}/envs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.coolify.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: v.key,
        value: v.value,
        is_preview: false,
        is_literal: true,
      }),
    });
    console.log(`      Status: ${resp.status}`);
    // Small delay to avoid race conditions
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Check env vars after
  console.log('\n4. Checking env vars after creating...');
  envResponse = await fetch(`${BASE_URL}/applications/${created.uuid}/envs`, {
    headers: { 'Authorization': `Bearer ${config.coolify.token}` },
  });
  envVars = await envResponse.json();
  console.log(`   Env vars count: ${envVars.length}`);
  for (const env of envVars) {
    console.log(`   - ${env.key}: ${env.value.substring(0, 30)}... (is_preview: ${env.is_preview})`);
  }
  
  // Check for duplicates
  const keys = envVars.map((e: any) => e.key);
  const uniqueKeys = new Set(keys);
  if (keys.length !== uniqueKeys.size) {
    console.log('\n   ⚠️ DUPLICATES FOUND!');
  } else {
    console.log('\n   ✅ No duplicates! All env vars are unique.');
  }
  
  // Clean up
  console.log('\n5. Cleaning up...');
  await fetch(`${BASE_URL}/applications/${created.uuid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${config.coolify.token}` },
  });
  console.log('   Deleted test app.');
}

testEnvVars();
