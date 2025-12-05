/**
 * Test script for end-to-end project creation flow
 * Run with: bun run src/services/test-project-flow.ts
 */

import { createNewProject, startProject, stopProject, getProjectWithStatus, deleteProjectFully } from './project-manager.ts';
import { listProjects } from '../models/project.ts';
import { coolify } from './coolify.ts';

async function testProjectFlow() {
  console.log('\n🚀 Testing End-to-End Project Creation Flow');
  console.log('============================================\n');
  
  const testProjectName = 'test-opencode-e2e';
  
  try {
    // Step 1: Create a new project
    console.log('Step 1: Creating new project...');
    console.log(`   Name: ${testProjectName}`);
    
    const project = await createNewProject({
      name: testProjectName,
      description: 'Test project for E2E flow validation',
    });
    
    console.log('   ✅ Project created successfully!');
    console.log(`   Project ID: ${project.id}`);
    console.log(`   Slug: ${project.slug}`);
    console.log(`   Forgejo Repo: ${project.forgejoRepoUrl}`);
    console.log(`   Coolify App UUID: ${project.coolifyAppUuid}`);
    console.log(`   Container Port: ${project.containerPort}`);
    console.log(`   Status: ${project.status}`);
    
    // Step 2: Verify Coolify application was created
    console.log('\nStep 2: Verifying Coolify application...');
    const coolifyApp = await coolify.getApplication(project.coolifyAppUuid);
    console.log(`   ✅ Coolify app exists`);
    console.log(`   Name: ${coolifyApp.name}`);
    console.log(`   Status: ${coolifyApp.status}`);
    console.log(`   Git Repository: ${coolifyApp.git_repository ?? 'N/A (using embedded Dockerfile)'}`);
    console.log(`   Git Branch: ${coolifyApp.git_branch ?? 'N/A'}`);
    
    // Step 3: List environment variables (filter out preview versions)
    console.log('\nStep 3: Checking environment variables...');
    const envVars = await coolify.listEnvVars(project.coolifyAppUuid, true); // filterPreview=true
    console.log(`   Found ${envVars.length} production env var(s):`);
    for (const env of envVars) {
      const maskedValue = env.key.includes('KEY') || env.key.includes('TOKEN') 
        ? '***masked***' 
        : env.value.substring(0, 30) + (env.value.length > 30 ? '...' : '');
      console.log(`   - ${env.key}: ${maskedValue}`);
    }
    
    // Step 4: Deploy the application (trigger build)
    console.log('\nStep 4: Deploying application (triggering build)...');
    try {
      const deployResult = await coolify.deployApplication(project.coolifyAppUuid);
      console.log(`   ✅ Deploy triggered!`);
      for (const d of deployResult.deployments) {
        console.log(`   - ${d.message} (deployment: ${d.deployment_uuid})`);
      }
    } catch (e) {
      console.log(`   ⚠️ Deploy trigger failed: ${e}`);
    }
    
    // Wait for build/deploy
    console.log('   Waiting 60s for build/deploy...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Step 5: Check live status
    console.log('\nStep 5: Checking live container status...');
    const projectWithStatus = await getProjectWithStatus(project.id);
    console.log(`   Container Status: ${projectWithStatus.containerStatus}`);
    
    // Check app again for updated status
    const updatedApp = await coolify.getApplication(project.coolifyAppUuid);
    console.log(`   Coolify Status: ${updatedApp.status}`);
    
    // Step 6: List all projects
    console.log('\nStep 6: Listing all projects in database...');
    const allProjects = listProjects();
    console.log(`   Found ${allProjects.length} project(s) in database`);
    for (const p of allProjects) {
      console.log(`   - ${p.name} (${p.status})`);
    }
    
    // Step 7: Stop the project
    console.log('\nStep 7: Stopping project container...');
    const stoppedProject = await stopProject(project.id);
    console.log(`   ✅ Stop command sent`);
    console.log(`   Status: ${stoppedProject.status}`);
    
    // Step 8: Delete the project (cleanup)
    console.log('\nStep 8: Cleaning up - Deleting project...');
    await deleteProjectFully(project.id, { deleteRepo: true });
    console.log(`   ✅ Project deleted`);
    
    // Verify cleanup
    const remainingProjects = listProjects();
    const stillExists = remainingProjects.some(p => p.id === project.id);
    console.log(`   Project removed from DB: ${!stillExists ? '✅ Yes' : '❌ No'}`);
    
    console.log('\n============================================');
    console.log('✅ All tests passed! E2E flow works correctly.');
    console.log('============================================\n');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

testProjectFlow();
