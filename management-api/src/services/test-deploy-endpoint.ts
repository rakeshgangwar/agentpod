/**
 * Test deploy endpoint - corrected version
 */
import { config } from '../config.ts';

const BASE_URL = `${config.coolify.url}/api/v1`;

async function testDeployEndpoint() {
  console.log('Testing Coolify deploy endpoint (corrected)...\n');
  
  // Create a test app
  console.log('Creating test app...');
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
      name: 'test-deploy-corrected',
      base_directory: '/docker/opencode',
      instant_deploy: false,
    }),
  });
  
  if (createResponse.status !== 201) {
    console.log(`Failed to create app: ${await createResponse.text()}`);
    return;
  }
  
  const created = await createResponse.json();
  console.log(`Created test app: ${created.uuid}`);
  
  // Test the corrected deploy endpoint
  console.log('\n--- Testing corrected deploy endpoint ---\n');
  
  // Test 1: GET /deploy?uuid={uuid}
  console.log('1. GET /deploy?uuid={uuid}');
  try {
    const response = await fetch(`${BASE_URL}/deploy?uuid=${created.uuid}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.coolify.token}` },
    });
    console.log(`   Status: ${response.status}`);
    const body = await response.text();
    console.log(`   Body: ${body}`);
  } catch (e) {
    console.log(`   Error: ${e}`);
  }
  
  // Test 2: GET /deploy?uuid={uuid}&force=true
  console.log('\n2. GET /deploy?uuid={uuid}&force=true');
  try {
    const response = await fetch(`${BASE_URL}/deploy?uuid=${created.uuid}&force=true`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.coolify.token}` },
    });
    console.log(`   Status: ${response.status}`);
    const body = await response.text();
    console.log(`   Body: ${body}`);
  } catch (e) {
    console.log(`   Error: ${e}`);
  }
  
  // Wait a bit
  console.log('\nWaiting 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check deployments
  console.log('\n3. GET /deployments (checking recent)');
  try {
    const response = await fetch(`${BASE_URL}/deployments`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.coolify.token}` },
    });
    console.log(`   Status: ${response.status}`);
    const data = await response.json();
    console.log(`   Total deployments: ${data.length}`);
    // Show deployments for our app
    const ourDeployments = data.filter((d: any) => d.application_uuid === created.uuid);
    console.log(`   Deployments for our app: ${ourDeployments.length}`);
    for (const d of ourDeployments.slice(0, 3)) {
      console.log(`   - ${d.status} (${d.uuid})`);
    }
  } catch (e) {
    console.log(`   Error: ${e}`);
  }
  
  // Clean up
  console.log('\nCleaning up...');
  await fetch(`${BASE_URL}/applications/${created.uuid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${config.coolify.token}` },
  });
  console.log('Deleted test app.');
}

testDeployEndpoint();
