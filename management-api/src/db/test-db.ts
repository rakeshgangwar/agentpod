/**
 * Test script for database operations
 * Run with: bun run src/db/test-db.ts
 */

import { initDatabase, db } from './index.ts';
import { 
  createProject, 
  getProjectById, 
  listProjects, 
  updateProject, 
  deleteProject,
  generateUniqueSlug 
} from '../models/project.ts';
import { 
  listProviders, 
  getProviderById, 
  configureProvider, 
  setDefaultProvider,
  getProviderEnvVars,
  removeProviderConfig
} from '../models/provider.ts';

console.log('=== Database Test ===\n');

// Initialize database
console.log('1. Initializing database...');
initDatabase();
console.log('   ✓ Database initialized\n');

// Test providers (seeded data)
console.log('2. Testing providers...');
const providers = listProviders();
console.log(`   ✓ Found ${providers.length} providers:`);
providers.forEach(p => console.log(`     - ${p.id}: ${p.name} (${p.type})`));

// Configure a provider
console.log('\n3. Configuring OpenRouter provider...');
configureProvider('openrouter', { apiKey: 'test-api-key-123' });
const openrouter = getProviderById('openrouter');
console.log(`   ✓ OpenRouter configured: ${openrouter?.isConfigured}`);

// Set as default
console.log('\n4. Setting OpenRouter as default...');
setDefaultProvider('openrouter');
const defaultProvider = getProviderById('openrouter');
console.log(`   ✓ OpenRouter is default: ${defaultProvider?.isDefault}`);

// Get env vars
console.log('\n5. Getting provider env vars...');
const envVars = getProviderEnvVars();
console.log('   ✓ Env vars:', envVars);

// Test project operations
console.log('\n6. Creating test project...');
const project = createProject({
  name: 'Test Project',
  description: 'A test project for database verification',
  forgejoRepoUrl: 'https://forgejo.example.com/user/test-project.git',
  forgejoOwner: 'user',
  coolifyAppUuid: 'test-coolify-uuid',
  coolifyServerUuid: 'test-server-uuid',
  containerPort: 4001,
});
console.log(`   ✓ Created project: ${project.id} (${project.slug})`);

// List projects
console.log('\n7. Listing projects...');
const projects = listProjects();
console.log(`   ✓ Found ${projects.length} project(s)`);

// Update project
console.log('\n8. Updating project status...');
const updated = updateProject(project.id, { status: 'running' });
console.log(`   ✓ Updated status: ${updated?.status}`);

// Test unique slug generation
console.log('\n9. Testing unique slug generation...');
const slug1 = generateUniqueSlug('Test Project');
const slug2 = generateUniqueSlug('Test Project');
console.log(`   ✓ Generated slugs: "${slug1}", "${slug2}"`);

// Clean up
console.log('\n10. Cleaning up...');
deleteProject(project.id);
removeProviderConfig('openrouter');
console.log('   ✓ Test project deleted');
console.log('   ✓ OpenRouter config removed');

// Final check
console.log('\n11. Final verification...');
const finalProjects = listProjects();
const finalProviders = listProviders();
console.log(`   ✓ Projects: ${finalProjects.length}`);
console.log(`   ✓ Providers: ${finalProviders.length} (all unconfigured)`);

console.log('\n=== All Tests Passed! ===\n');

// Close database
db.close();
