/**
 * Debug SSE events via SDK
 */
import { createOpencodeClient } from '@opencode-ai/sdk';

async function test() {
  const client = createOpencodeClient({
    baseUrl: 'https://opencode-test123.superchotu.com',
  });

  console.log('Subscribing to events...');
  console.log('Time:', new Date().toISOString());
  
  const eventResult = await client.event.subscribe();
  
  console.log('Subscription result:', {
    hasStream: !!eventResult.stream,
    hasData: !!eventResult.data,
    hasError: !!eventResult.error,
    type: typeof eventResult.stream,
  });
  
  console.log('Time after subscribe:', new Date().toISOString());
  
  if (!eventResult.stream) {
    console.log('No stream available');
    return;
  }
  
  console.log('Stream available, type:', eventResult.stream.constructor?.name);
  
  // Try to get the first event with a timeout
  const timeout = setTimeout(() => {
    console.log('Timeout waiting for first event');
    process.exit(0);
  }, 5000);
  
  try {
    const iterator = eventResult.stream[Symbol.asyncIterator]();
    console.log('Got iterator, waiting for next...');
    const first = await iterator.next();
    clearTimeout(timeout);
    console.log('First event:', first);
  } catch (err) {
    clearTimeout(timeout);
    console.log('Error getting first event:', err);
  }
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
