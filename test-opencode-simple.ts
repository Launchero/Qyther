/**
 * Simple standalone test for OpenCode SDK
 * 
 * This is a minimal test that directly uses the OpenCode SDK
 * without the Electron app context.
 * 
 * Prerequisites:
 * 1. Start the OpenCode server: opencode dev (or ensure server is running on port 4096)
 * 2. Set ALIBABA_CLOUD_API_KEY in your .env file
 * 
 * Usage: npx tsx test-opencode-simple.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testSimpleOpenCode() {
  console.log('='.repeat(60));
  console.log('OpenCode SDK - Simple Test');
  console.log('='.repeat(60));
  console.log();

  const openCodeUrl = process.env.OPENCODE_BASE_URL || 'http://localhost:4096';
  const apiKey = process.env.ALIBABA_CLOUD_API_KEY;

  console.log('📡 Configuration:');
  console.log(`   Server URL: ${openCodeUrl}`);
  console.log(`   API Key configured: ${apiKey ? 'Yes (****' + apiKey.slice(-8) + ')' : 'No'}`);
  console.log();

  if (!apiKey) {
    console.error('❌ Error: ALIBABA_CLOUD_API_KEY not set in .env file');
    console.error('   Please add your API key to .env and try again');
    console.error();
    return false;
  }

  try {
    // Dynamically import the SDK
    console.log('📦 Loading OpenCode SDK...');
    const { createOpencodeClient } = await import('@opencode-ai/sdk');
    console.log('✅ SDK loaded');
    console.log();

    // Create client
    console.log('🔌 Connecting to OpenCode server...');
    const client = await createOpencodeClient({
      baseUrl: openCodeUrl,
    });
    console.log('✅ Connected successfully');
    console.log();

    // Test prompt
    const testPrompt = 'Say "Hello, World!" and nothing else.';
    console.log('💬 Sending test prompt...');
    console.log(`   Prompt: "${testPrompt}"`);
    console.log();

    // Generate a proper session ID (must start with "ses")
    const sessionId = `ses-${Date.now()}`;
    console.log(`📝 Session ID: ${sessionId}`);
    console.log();

    // Generate response using session.prompt
    console.log('⏳ Generating response using client.session.prompt()...');
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text' as const, text: testPrompt }],
      },
    });

    console.log('✅ Prompt sent, waiting for response...');
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get the messages
    console.log('📥 Retrieving messages...');
    const messages = await client.session.messages({
      path: { id: sessionId }
    });

    // Display result
    console.log();
    console.log('='.repeat(60));
    console.log('✅ Messages retrieved:');
    console.log('='.repeat(60));
    
    if (Array.isArray(messages) && messages.length > 0) {
      console.log(`📊 Total messages: ${messages.length}`);
      console.log();
      
      messages.forEach((msg: any, index: number) => {
        console.log(`--- Message ${index + 1} ---`);
        if (msg.role) {
          console.log(`Role: ${msg.role}`);
        }
        if (msg.content || msg.parts) {
          console.log('Content:');
          const content = msg.content || msg.parts;
          if (Array.isArray(content)) {
            content.forEach((part: any) => {
              if (part.type === 'text') {
                console.log(`  ${part.text}`);
              } else {
                console.log(`  [${part.type}]:`, JSON.stringify(part));
              }
            });
          } else {
            console.log(`  ${content}`);
          }
        }
        console.log();
      });
    } else {
      console.log('No messages found or unexpected response format');
      console.log('Raw response:', JSON.stringify(messages, null, 2));
    }
    
    console.log('='.repeat(60));
    console.log();

    console.log('✅ Test PASSED!');
    console.log();
    return true;
  } catch (error) {
    console.error();
    console.error('❌ Test FAILED:');
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      if (error.message.includes('ECONNREFUSED')) {
        console.error();
        console.error('   💡 The OpenCode server is not running.');
        console.error('      Start it with: opencode dev');
        console.error('      Or update OPENCODE_BASE_URL in your .env file');
      }
    } else {
      console.error(`   Error: ${error}`);
    }
    console.error();
    return false;
  }
}

// Run test
(async () => {
  const success = await testSimpleOpenCode();
  process.exit(success ? 0 : 1);
})();
