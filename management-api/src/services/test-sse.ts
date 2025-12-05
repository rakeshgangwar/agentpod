/**
 * Test SSE events via SDK
 */
import { createOpencodeClient } from '@opencode-ai/sdk';

async function test() {
  const client = createOpencodeClient({
    baseUrl: 'https://opencode-test123.superchotu.com',
  });

  console.log('Subscribing to events...');
  
  const eventResult = await client.event.subscribe();
  
  if (!eventResult.stream) {
    console.log('No stream available');
    return;
  }
  
  console.log('Stream available, waiting for events (10 seconds)...');
  
  // Set a timeout to exit after 10 seconds
  const timeout = setTimeout(() => {
    console.log('\nTimeout reached, exiting');
    process.exit(0);
  }, 10000);
  
  try {
    for await (const event of eventResult.stream) {
      console.log('Event received:', JSON.stringify(event, null, 2));
    }
  } catch (err) {
    console.log('Stream error or closed:', err);
  }
  
  clearTimeout(timeout);
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
