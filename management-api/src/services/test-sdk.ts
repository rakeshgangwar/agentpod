/**
 * Quick test of the OpenCode SDK
 */
import { createOpencodeClient } from '@opencode-ai/sdk';

async function test() {
  const client = createOpencodeClient({
    baseUrl: 'https://opencode-test123.superchotu.com',
  });

  console.log('Testing SDK...');
  
  // Test 1: List sessions
  console.log('\n1. Listing sessions...');
  const sessions = await client.session.list();
  console.log('Sessions:', JSON.stringify(sessions.data?.slice(0, 2), null, 2));
  
  // Test 2: Get config
  console.log('\n2. Getting config...');
  const config = await client.config.get();
  console.log('Config keys:', Object.keys(config.data || {}));
  
  // Test 3: Get current project
  console.log('\n3. Getting current project...');
  const project = await client.project.current();
  console.log('Project:', JSON.stringify(project.data, null, 2));
  
  // Test 4: Subscribe to events (briefly)
  console.log('\n4. Testing event subscription...');
  const eventResult = await client.event.subscribe();
  console.log('Event stream type:', typeof eventResult.stream);
  
  console.log('\nAll tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
