#!/usr/bin/env node

/**
 * Backfill Legacy Sessions with Topics
 * This script assigns secret_topic to sessions that were created before topic classification was implemented
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log('🔄 Legacy Session Topic Backfill Script');
console.log('=====================================\n');

async function backfillLegacySessions() {
  console.log('1️⃣ Finding legacy sessions without topics...');
  
  // Get sessions without secret_topic
  const { data: legacySessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, interactions, created_at, user_id')
    .is('secret_topic', null)
    .order('created_at', { ascending: false })
    .limit(200); // Process in batches to avoid overwhelming the API
  
  if (sessionsError) {
    console.error('❌ Error fetching legacy sessions:', sessionsError);
    return;
  }
  
  console.log(`   📊 Found ${legacySessions.length} legacy sessions without topics\n`);
  
  if (legacySessions.length === 0) {
    console.log('✅ No legacy sessions to backfill!');
    return;
  }
  
  // Get existing topics to use for classification
  const { data: existingTopics, error: topicsError } = await supabase
    .from('topics')
    .select('name, description')
    .eq('is_active', true);
  
  if (topicsError) {
    console.error('❌ Error fetching existing topics:', topicsError);
    return;
  }
  
  const topicsList = existingTopics?.map(t => t.name) || [];
  const topicsContext = existingTopics?.map(t => `${t.name}: ${t.description}`).join('\n') || '';
  
  console.log(`2️⃣ Processing sessions with ${topicsList.length} existing topics...\n`);
  
  let processedCount = 0;
  let successCount = 0;
  
  for (const session of legacySessions) {
    try {
      processedCount++;
      console.log(`   Processing session ${processedCount}/${legacySessions.length} (${session.id})`);
      
      // Extract query text from interactions
      let queryText = 'general conversation';
      if (session.interactions && Array.isArray(session.interactions)) {
        const queries = session.interactions
          .filter(i => i.type === 'query' && i.content)
          .map(i => i.content)
          .join(' ');
        if (queries) {
          queryText = queries.substring(0, 1000); // Limit length for API
        }
      }
      
      // Classify the session topic using OpenAI
      let secretTopic = 'general';
      
      if (queryText && queryText !== 'general conversation') {
        const topicClassificationPrompt = `You are a topic classifier for an educational AI tutoring system. 
Analyze the following conversation content to determine the most appropriate topic.

EXISTING TOPICS:
${topicsContext}

CONVERSATION CONTENT: ${queryText}

CLASSIFICATION RULES:
1. If the content fits one of the existing topics above, respond with EXACTLY that topic name
2. If no existing topic fits well, create a new descriptive topic name (use underscores, lowercase)
3. For mathematical content, use "mathematics" or specific math topics
4. For programming/coding content, use "computer_science" or "programming"
5. For science content, use the specific science field (physics, chemistry, biology)
6. For general greetings, thanks, or casual conversation, use "general"
7. Be specific when possible

TOPIC:`;

        try {
          const topicCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: topicClassificationPrompt }],
            temperature: 0.1,
            max_tokens: 50
          });
          
          secretTopic = topicCompletion.choices[0].message.content.trim();
          
          // Safeguard against invalid responses
          if (!secretTopic || secretTopic.length > 50 || secretTopic.includes(' ')) {
            secretTopic = 'general';
          }
          
        } catch (apiError) {
          console.log(`     ⚠️ OpenAI classification failed, using 'general'`);
          secretTopic = 'general';
        }
      }
      
      // If it's a new topic, add it to the topics table
      if (!topicsList.includes(secretTopic) && secretTopic !== 'general') {
        console.log(`     ➕ Adding new topic: ${secretTopic}`);
        const { error: insertError } = await supabase
          .from('topics')
          .insert({
            name: secretTopic,
            description: `Automatically generated topic for: ${secretTopic.replace(/_/g, ' ')}`
          });
        
        if (!insertError) {
          topicsList.push(secretTopic);
          
          // Update topic usage count
          await supabase
            .from('topics')
            .update({ 
              usage_count: 1,
              updated_at: new Date().toISOString()
            })
            .eq('name', secretTopic);
        }
      } else if (topicsList.includes(secretTopic)) {
        // Update existing topic usage count
        const { data: topicData } = await supabase
          .from('topics')
          .select('usage_count')
          .eq('name', secretTopic)
          .single();
        
        const currentCount = topicData?.usage_count || 0;
        await supabase
          .from('topics')
          .update({ 
            usage_count: currentCount + 1,
            updated_at: new Date().toISOString()
          })
          .eq('name', secretTopic);
      }
      
      // Update session with secret_topic
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ secret_topic: secretTopic })
        .eq('id', session.id);
      
      if (updateError) {
        console.log(`     ❌ Failed to update session: ${updateError.message}`);
      } else {
        successCount++;
        console.log(`     ✅ Assigned topic: "${secretTopic}"`);
      }
      
      // Add small delay to avoid overwhelming APIs
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`     ❌ Error processing session: ${error.message}`);
    }
  }
  
  console.log(`\n3️⃣ Backfill Complete!`);
  console.log(`   📊 Processed: ${processedCount} sessions`);
  console.log(`   ✅ Successfully updated: ${successCount} sessions`);
  console.log(`   ❌ Failed: ${processedCount - successCount} sessions`);
  
  // Verify the backfill
  console.log('\n4️⃣ Verifying backfill...');
  const { data: remainingNulls, error: verifyError } = await supabase
    .from('sessions')
    .select('id')
    .is('secret_topic', null);
  
  if (!verifyError) {
    console.log(`   📊 Remaining sessions without topics: ${remainingNulls.length}`);
    
    if (remainingNulls.length === 0) {
      console.log('   🎉 All sessions now have topics assigned!');
    } else {
      console.log('   💡 Run this script again to process remaining sessions');
    }
  }
}

async function showTopicStats() {
  console.log('\n5️⃣ Topic Distribution After Backfill:');
  console.log('====================================');
  
  const { data: topicStats, error } = await supabase
    .from('sessions')
    .select('secret_topic')
    .not('secret_topic', 'is', null);
  
  if (!error && topicStats) {
    const topicCounts = {};
    topicStats.forEach(session => {
      const topic = session.secret_topic;
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
    
    const sortedTopics = Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    console.log('Top 10 Topics:');
    sortedTopics.forEach(([topic, count], index) => {
      console.log(`   ${index + 1}. ${topic}: ${count} sessions`);
    });
    
    console.log(`\nTotal sessions with topics: ${topicStats.length}`);
  }
}

async function main() {
  try {
    await backfillLegacySessions();
    await showTopicStats();
    
    console.log('\n🎉 Legacy topic backfill completed!');
    console.log('Your Progress Dashboard should now work properly.');
    console.log('\nNext steps:');
    console.log('1. Refresh your Progress Dashboard');
    console.log('2. Verify that progress data is now displaying');
    console.log('3. If you have more legacy sessions, run this script again');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

main(); 