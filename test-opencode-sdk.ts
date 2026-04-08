/**
 * Simple test script for OpenCode SDK
 * 
 * This script tests the OpenCode SDK client by:
 * 1. Initializing the client
 * 2. Sending a simple test prompt
 * 3. Displaying the response
 * 
 * Usage: npx tsx test-opencode-sdk.ts
 */

import { getOpenCodeClient, resetClient } from './src/main/opencode/client.js';

async function testOpenCodeSDK() {
  console.log('='.repeat(60));
  console.log('OpenCode SDK Test');
  console.log('='.repeat(60));
  console.log();

  try {
    // Step 1: Initialize the client
    console.log('📡 Initializing OpenCode client...');
    const client = await getOpenCodeClient();
    console.log('✅ Client initialized successfully');
    console.log();

    // Step 2: Send a test prompt
    console.log('💬 Sending test prompt...');
    const testPrompt = 'What is 2 + 2? Respond with just the number.';
    console.log(`Prompt: "${testPrompt}"`);
    console.log();

    // Step 3: Generate response
    console.log('⏳ Waiting for response...');
    const response = await client.generate({
      model: 'alibaba-coding-plan/qwen3-coder-plus',
      messages: [
        {
          role: 'user',
          content: testPrompt,
        },
      ],
    });

    // Step 4: Display the result
    console.log();
    console.log('='.repeat(60));
    console.log('✅ Response received:');
    console.log('='.repeat(60));
    console.log(response.text);
    console.log('='.repeat(60));
    console.log();

    // Step 5: Show usage statistics if available
    if (response.usage) {
      console.log('📊 Usage Statistics:');
      console.log(`   Prompt tokens: ${response.usage.promptTokens}`);
      console.log(`   Completion tokens: ${response.usage.completionTokens}`);
      console.log(`   Total tokens: ${response.usage.totalTokens}`);
      console.log();
    }

    console.log('✅ Test completed successfully!');
    return true;
  } catch (error) {
    console.error();
    console.error('❌ Test failed:');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    } else {
      console.error(`   Error: ${error}`);
    }
    console.error();
    return false;
  } finally {
    // Reset client for next test
    resetClient();
  }
}

// Run the test
(async () => {
  const success = await testOpenCodeSDK();
  process.exit(success ? 0 : 1);
})();
