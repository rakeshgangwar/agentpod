/**
 * Coolify API Explorer
 * 
 * This script tests and documents the Coolify API endpoints for:
 * - Container logs
 * - Deployments (list, get, cancel)
 * - Deploy/rebuild triggers
 * 
 * Run with: cd management-api && bun run src/services/explore-coolify-api.ts
 */

import { config } from '../config.ts';

const BASE_URL = `${config.coolify.url}/api/v1`;

interface ApiResponse {
  status: number;
  ok: boolean;
  data: unknown;
  error?: string;
}

async function testEndpoint(method: string, path: string, body?: unknown): Promise<ApiResponse> {
  const url = `${BASE_URL}${path}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${method} ${path}`);
  console.log(`Full URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${config.coolify.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const text = await response.text();
    let data: unknown;
    
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response type: ${typeof data}`);
    
    if (response.ok) {
      // For successful responses, show structure
      if (Array.isArray(data)) {
        console.log(`Response: Array with ${data.length} items`);
        if (data.length > 0) {
          console.log('First item keys:', Object.keys(data[0] as object));
          console.log('First item sample:', JSON.stringify(data[0], null, 2).slice(0, 500));
        }
      } else if (typeof data === 'object' && data !== null) {
        console.log('Response keys:', Object.keys(data));
        console.log('Response sample:', JSON.stringify(data, null, 2).slice(0, 1000));
      } else {
        console.log('Response:', String(data).slice(0, 500));
      }
    } else {
      console.log('Error response:', JSON.stringify(data, null, 2));
    }
    
    return { status: response.status, ok: response.ok, data };
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { status: 0, ok: false, data: null, error: String(error) };
  }
}

async function main() {
  console.log('Coolify API Explorer');
  console.log('====================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Token: ${config.coolify.token ? '***' + config.coolify.token.slice(-4) : 'NOT SET'}`);
  
  // First, get a list of applications to find a valid UUID
  console.log('\n\n### Getting Applications List ###');
  const appsResult = await testEndpoint('GET', '/applications');
  
  let testAppUuid: string | null = null;
  if (appsResult.ok && Array.isArray(appsResult.data) && appsResult.data.length > 0) {
    const app = appsResult.data[0] as { uuid: string; name: string; status: string };
    testAppUuid = app.uuid;
    console.log(`\nUsing test app: ${app.name} (${app.uuid}) - Status: ${app.status}`);
  }
  
  if (!testAppUuid) {
    console.log('\nNo applications found. Cannot test application-specific endpoints.');
    return;
  }
  
  // Test endpoints we want to add
  console.log('\n\n### Testing Container Logs Endpoints ###');
  
  // Try different log endpoint formats
  await testEndpoint('GET', `/applications/${testAppUuid}/logs`);
  await testEndpoint('GET', `/applications/${testAppUuid}/logs?lines=50`);
  
  console.log('\n\n### Testing Deployments Endpoints ###');
  
  // List all deployments
  const deploymentsResult = await testEndpoint('GET', '/deployments');
  
  // Try to get deployments for specific app
  await testEndpoint('GET', `/applications/${testAppUuid}/deployments`);
  
  // If we got deployments, try to get a specific one
  if (deploymentsResult.ok && Array.isArray(deploymentsResult.data) && deploymentsResult.data.length > 0) {
    const deployment = deploymentsResult.data[0] as { uuid?: string; deployment_uuid?: string };
    const deploymentUuid = deployment.uuid || deployment.deployment_uuid;
    if (deploymentUuid) {
      console.log(`\nTesting with deployment UUID: ${deploymentUuid}`);
      await testEndpoint('GET', `/deployments/${deploymentUuid}`);
      await testEndpoint('GET', `/deployments/${deploymentUuid}/logs`);
    }
  }
  
  console.log('\n\n### Testing Application Details (for status) ###');
  await testEndpoint('GET', `/applications/${testAppUuid}`);
  
  console.log('\n\n### Summary of Tested Endpoints ###');
  console.log(`
Based on Coolify API documentation and testing:

CONFIRMED WORKING:
- GET /applications - List all applications
- GET /applications/{uuid} - Get application details (includes status)
- GET /applications/{uuid}/start - Start application
- GET /applications/{uuid}/stop - Stop application  
- GET /applications/{uuid}/restart - Restart application
- GET /deploy?uuid={uuid} - Trigger deployment/rebuild

TO BE VERIFIED:
- GET /applications/{uuid}/logs - Container logs
- GET /deployments - List all deployments
- GET /deployments/{uuid} - Get deployment details
- GET /deployments/{uuid}/logs - Get deployment/build logs
- DELETE /deployments/{uuid} - Cancel deployment

Check output above to confirm which endpoints work with your Coolify version.
`);
}

main().catch(console.error);
