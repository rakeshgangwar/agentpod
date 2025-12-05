/**
 * Test script for Coolify and Forgejo API clients
 * Run with: bun run src/services/test-clients.ts
 */

import { coolify } from './coolify.ts';
import { forgejo } from './forgejo.ts';
import { config } from '../config.ts';

async function testCoolify() {
  console.log('\n========================================');
  console.log('🔧 Testing Coolify Client');
  console.log('========================================');
  console.log(`URL: ${config.coolify.url}`);
  
  try {
    // Health check
    console.log('\n1. Health Check...');
    const healthy = await coolify.healthCheck();
    console.log(`   Status: ${healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    if (!healthy) {
      console.log('   Skipping remaining Coolify tests');
      return false;
    }
    
    // List servers (to get server UUID)
    console.log('\n2. Listing Servers...');
    const servers = await coolify.listServers();
    console.log(`   Found ${servers.length} server(s):`);
    for (const server of servers) {
      console.log(`   - ${server.name}`);
      console.log(`     UUID: ${server.uuid}`);
      console.log(`     IP: ${server.ip}`);
      console.log(`     Reachable: ${server.settings?.is_reachable ?? 'unknown'}`);
    }
    
    if (servers.length > 0 && !config.coolify.serverUuid) {
      console.log('\n   💡 TIP: Add this to your .env file:');
      console.log(`   COOLIFY_SERVER_UUID=${servers[0].uuid}`);
    }
    
    // List projects
    console.log('\n3. Listing Coolify Projects...');
    const projects = await coolify.listProjects();
    console.log(`   Found ${projects.length} project(s):`);
    for (const project of projects) {
      console.log(`   - ${project.name}`);
      console.log(`     UUID: ${project.uuid}`);
    }
    
    if (projects.length > 0 && !config.coolify.projectUuid) {
      console.log('\n   💡 TIP: Add this to your .env file:');
      console.log(`   COOLIFY_PROJECT_UUID=${projects[0].uuid}`);
    }
    
    // List applications
    console.log('\n4. Listing Applications...');
    const apps = await coolify.listApplications();
    console.log(`   Found ${apps.length} application(s):`);
    for (const app of apps) {
      console.log(`   - ${app.name}`);
      console.log(`     UUID: ${app.uuid}`);
      console.log(`     Status: ${app.status}`);
      console.log(`     FQDN: ${app.fqdn || 'none'}`);
    }
    
    console.log('\n✅ Coolify client tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Coolify test failed:', error);
    return false;
  }
}

async function testForgejo() {
  console.log('\n========================================');
  console.log('🔧 Testing Forgejo Client');
  console.log('========================================');
  console.log(`URL: ${config.forgejo.url}`);
  console.log(`Owner: ${config.forgejo.owner}`);
  
  try {
    // Health check (get current user)
    console.log('\n1. Health Check (Get Current User)...');
    const healthy = await forgejo.healthCheck();
    console.log(`   Status: ${healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    if (!healthy) {
      console.log('   Skipping remaining Forgejo tests');
      return false;
    }
    
    // Get user details
    console.log('\n2. Getting User Details...');
    const user = await forgejo.getCurrentUser();
    console.log(`   Username: ${user.login}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Admin: ${user.is_admin}`);
    
    // List repositories
    console.log('\n3. Listing Repositories...');
    const repos = await forgejo.listUserRepos();
    console.log(`   Found ${repos.length} repository(ies):`);
    for (const repo of repos) {
      console.log(`   - ${repo.full_name}`);
      console.log(`     Clone URL: ${repo.clone_url}`);
      console.log(`     Private: ${repo.private}`);
    }
    
    // Get API settings
    console.log('\n4. Getting API Settings...');
    try {
      const settings = await forgejo.getApiSettings();
      console.log(`   Max response items: ${settings.max_response_items}`);
      console.log(`   Default paging: ${settings.default_paging_num}`);
    } catch {
      console.log('   (API settings endpoint not available)');
    }
    
    console.log('\n✅ Forgejo client tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Forgejo test failed:', error);
    return false;
  }
}

async function main() {
  console.log('🚀 Management API - Client Tests');
  console.log('=================================');
  
  const coolifyOk = await testCoolify();
  const forgejoOk = await testForgejo();
  
  console.log('\n========================================');
  console.log('📊 Summary');
  console.log('========================================');
  console.log(`Coolify: ${coolifyOk ? '✅ OK' : '❌ Failed'}`);
  console.log(`Forgejo: ${forgejoOk ? '✅ OK' : '❌ Failed'}`);
  
  if (!coolifyOk || !forgejoOk) {
    process.exit(1);
  }
}

main();
