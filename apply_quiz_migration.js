import { supabase } from './server/lib/supabaseClient.js';
import fs from 'fs';

async function applyQuizMigration() {
  try {
    console.log('🚀 Starting quiz tables migration...');
    
    // Read the migration file
    const migrationSQL = fs.readFileSync('./supabase/migrations/20250229_create_quiz_tables.sql', 'utf8');
    
    console.log('📖 Migration SQL loaded, applying to database...');
    
    // Apply the migration using the correct RPC function parameter name
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: migrationSQL
    });
    
    if (error) {
      console.error('❌ Error applying migration with RPC:', error);
      
      // Try alternative approach - split into individual statements
      console.log('🔄 Trying alternative approach...');
      
      // Split the SQL into individual statements and execute them one by one
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      console.log(`📝 Found ${statements.length} SQL statements to execute`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
          console.log(`   ${statement.substring(0, 100)}...`);
          
          try {
            const { error: stmtError } = await supabase.rpc('exec_sql', {
              sql_text: statement + ';'
            });
            
            if (stmtError) {
              console.error(`❌ Error in statement ${i + 1}:`, stmtError);
              // Continue with other statements
            } else {
              console.log(`✅ Statement ${i + 1} executed successfully`);
            }
          } catch (stmtErr) {
            console.error(`❌ Exception in statement ${i + 1}:`, stmtErr);
          }
        }
      }
    } else {
      console.log('✅ Migration applied successfully!');
    }
    
    // Verify the tables were created
    console.log('🔍 Verifying quiz tables exist...');
    
    const { data: quizzesCheck, error: quizzesError } = await supabase
      .from('quizzes')
      .select('*')
      .limit(1);
    
    const { data: resultsCheck, error: resultsError } = await supabase
      .from('quiz_results')
      .select('*')
      .limit(1);
    
    if (!quizzesError) {
      console.log('✅ quizzes table is accessible');
    } else {
      console.log('❌ quizzes table check failed:', quizzesError);
    }
    
    if (!resultsError) {
      console.log('✅ quiz_results table is accessible');
    } else {
      console.log('❌ quiz_results table check failed:', resultsError);
    }
    
    // Test inserting a sample quiz to verify RLS policies work
    console.log('🧪 Testing quiz insertion...');
    
    // Get a test user ID (using one from the cluster logs)
    const testUserId = '3fb1a0c8-7069-4133-ab99-d3b7bdb33675';
    
    const sampleQuiz = {
      user_id: testUserId,
      title: 'Test Quiz Migration',
      description: 'Testing if RLS policies work correctly',
      questions: [
        {
          question: 'What is 2 + 2?',
          options: ['3', '4', '5', '6'],
          correctAnswer: 1,
          explanation: '2 + 2 equals 4'
        }
      ],
      query: 'Basic Math',
      difficulty: 'easy'
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('quizzes')
      .insert([sampleQuiz])
      .select();
    
    if (insertError) {
      console.log('❌ Quiz insertion test failed:', insertError);
      console.log('This indicates RLS policies may need adjustment');
      
      // Try to check if the tables exist but RLS is blocking
      console.log('🔍 Checking table structure...');
      const { data: tableInfo, error: tableError } = await supabase
        .rpc('exec_sql', { 
          sql_text: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'quizzes' ORDER BY ordinal_position;" 
        });
      
      if (!tableError && tableInfo) {
        console.log('📋 Quiz table structure:', tableInfo);
      }
      
    } else {
      console.log('✅ Quiz insertion test successful!');
      console.log('📊 Sample quiz created:', insertData[0]?.id);
      
      // Test quiz result insertion
      console.log('🧪 Testing quiz result insertion...');
      const sampleResult = {
        user_id: testUserId,
        quiz_id: insertData[0].id,
        score: 100,
        answers: [1],
        results: { correct: 1, total: 1 }
      };
      
      const { data: resultData, error: resultError } = await supabase
        .from('quiz_results')
        .insert([sampleResult])
        .select();
      
      if (resultError) {
        console.log('❌ Quiz result insertion test failed:', resultError);
      } else {
        console.log('✅ Quiz result insertion test successful!');
        console.log('📊 Sample result created:', resultData[0]?.id);
        
        // Clean up test data
        await supabase.from('quiz_results').delete().eq('id', resultData[0].id);
        console.log('🧹 Test result data cleaned up');
      }
      
      // Clean up test quiz data
      await supabase.from('quizzes').delete().eq('id', insertData[0].id);
      console.log('🧹 Test quiz data cleaned up');
    }
    
    console.log('🎉 Migration process completed!');
    
  } catch (error) {
    console.error('💥 Fatal error during migration:', error);
  }
}

// Run the migration
applyQuizMigration().then(() => {
  console.log('✨ Migration script finished');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Migration script failed:', error);
  process.exit(1);
}); 