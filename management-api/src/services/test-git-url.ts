/**
 * Test git repository - dump all fields
 */
import { config } from '../config.ts';

const BASE_URL = `${config.coolify.url}/api/v1`;

async function testGitUrl() {
  console.log('Creating app and dumping ALL fields...\n');
  
  const gitUrl = 'https://github.com/sst/opencode';  // Use known good repo
  
  const payload = {
    project_uuid: config.coolify.projectUuid,
    server_uuid: config.coolify.serverUuid,
    environment_name: 'production',
    git_repository: gitUrl,
    git_branch: 'main',
    build_pack: 'dockerfile',
    ports_exposes: '4096',
    name: `test-dump-${Date.now()}`,
    instant_deploy: false,
  };
  
  const createResponse = await fetch(`${BASE_URL}/applications/public`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.coolify.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  if (createResponse.status !== 201) {
    console.log(`Failed: ${await createResponse.text()}`);
    return;
  }
  
  const created = await createResponse.json();
  
  // Get the app details
  const appResponse = await fetch(`${BASE_URL}/applications/${created.uuid}`, {
    headers: { 'Authorization': `Bearer ${config.coolify.token}` },
  });
  const app = await appResponse.json();
  
  // Dump all fields
  console.log('All application fields:');
  console.log(JSON.stringify(app, null, 2));
  
  // Clean up
  await fetch(`${BASE_URL}/applications/${created.uuid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${config.coolify.token}` },
  });
  console.log('\nCleaned up.');
}

testGitUrl();
