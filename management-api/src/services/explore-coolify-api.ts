/**
 * Explore Coolify API endpoints
 */
import { config } from '../config.ts';

const BASE_URL = `${config.coolify.url}/api/v1`;

async function exploreAPI() {
  console.log('Testing Coolify public git app creation...\n');

  // Try without dockerfile_location
  const gitPayload = {
    project_uuid: config.coolify.projectUuid,
    server_uuid: config.coolify.serverUuid,
    environment_name: 'production',
    git_repository: 'https://forgejo.superchotu.com/rakeshgangwar/CodeOpen.git',
    git_branch: 'main',
    build_pack: 'dockerfile',
    ports_exposes: '4096',
    name: 'test-api-app',
    base_directory: '/docker/opencode',
  };
  
  console.log('Payload:', JSON.stringify(gitPayload, null, 2));
  
  const response = await fetch(`${BASE_URL}/applications/public`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.coolify.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(gitPayload),
  });
  const text = await response.text();
  console.log(`Response: ${response.status}`);
  console.log(`Body: ${text}\n`);
  
  // Clean up if created
  if (response.status === 201) {
    const data = JSON.parse(text);
    console.log(`✅ Created app with UUID: ${data.uuid}`);
    
    // Get app details
    const appResponse = await fetch(`${BASE_URL}/applications/${data.uuid}`, {
      headers: {
        'Authorization': `Bearer ${config.coolify.token}`,
      },
    });
    const appData = await appResponse.json();
    console.log(`App status: ${appData.status}`);
    console.log(`Build pack: ${appData.build_pack}`);
    console.log(`Base directory: ${appData.base_directory}`);
    
    console.log('\nDeleting test app...');
    await fetch(`${BASE_URL}/applications/${data.uuid}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${config.coolify.token}`,
      },
    });
    console.log('Deleted.');
  }
}

exploreAPI();
