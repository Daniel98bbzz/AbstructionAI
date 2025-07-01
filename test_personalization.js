// Test script to validate personalization features
// Run with: node test_personalization.js

import { supabase } from './server/lib/supabaseClient.js';
import UserProfileManager from './server/managers/UserProfileManager.js';

async function testPersonalizationFeatures() {
  console.log('🧪 Starting Personalization Features Test');
  console.log('=' * 50);

  // Test User ID (you can replace with an actual user ID)
  const testUserId = 'test-user-' + Date.now();
  
  try {
    // Test 1: Create a profile with new toggles
    console.log('\n📝 Test 1: Creating user profile with toggles');
    const testProfile = {
      username: 'test_user',
      occupation: 'Student',
      age: 22,
      education_level: 'Undergraduate',
      interests: ['Technology', 'Gaming', 'Science'],
      learning_style: 'Visual',
      technical_depth: 75,
      preferred_analogy_domains: ['Gaming', 'Technology'],
      main_learning_goal: 'Professional Development',
      use_interests_for_analogies: true,
      use_profile_for_main_answer: true
    };

    const createdProfile = await UserProfileManager.createProfile(testUserId, testProfile);
    console.log('✅ Profile created:', {
      userId: testUserId,
      toggles: {
        use_interests_for_analogies: createdProfile.use_interests_for_analogies,
        use_profile_for_main_answer: createdProfile.use_profile_for_main_answer
      }
    });

    // Test 2: Retrieve and validate profile
    console.log('\n📖 Test 2: Retrieving user profile');
    const retrievedProfile = await UserProfileManager.getProfile(testUserId);
    console.log('✅ Profile retrieved:', {
      userId: testUserId,
      hasProfile: !!retrievedProfile,
      toggles: {
        use_interests_for_analogies: retrievedProfile?.use_interests_for_analogies,
        use_profile_for_main_answer: retrievedProfile?.use_profile_for_main_answer
      },
      interests: retrievedProfile?.interests,
      preferred_analogy_domains: retrievedProfile?.preferred_analogy_domains
    });

    // Test 3: Test analogy domain selection logic
    console.log('\n🎭 Test 3: Testing analogy domain selection logic');
    
    // Test case 1: Interests enabled
    const preferences1 = {
      use_interests_for_analogies: true,
      interests: ['Technology', 'Gaming'],
      preferred_analogy_domains: ['Sports', 'Cooking']
    };
    
    let analogyDomains = testAnalogySelection(preferences1);
    console.log('✅ Case 1 (interests enabled):', {
      input: preferences1,
      output: analogyDomains,
      expected: 'Should use interests'
    });

    // Test case 2: Interests disabled
    const preferences2 = {
      use_interests_for_analogies: false,
      interests: ['Technology', 'Gaming'],
      preferred_analogy_domains: ['Sports', 'Cooking']
    };
    
    analogyDomains = testAnalogySelection(preferences2);
    console.log('✅ Case 2 (interests disabled):', {
      input: preferences2,
      output: analogyDomains,
      expected: 'Should use preferred domains'
    });

    // Test case 3: No preferred domains, fallback to interests
    const preferences3 = {
      use_interests_for_analogies: false,
      interests: ['Technology', 'Gaming'],
      preferred_analogy_domains: []
    };
    
    analogyDomains = testAnalogySelection(preferences3);
    console.log('✅ Case 3 (fallback to interests):', {
      input: preferences3,
      output: analogyDomains,
      expected: 'Should fallback to interests'
    });

    // Test 4: Test personalization prompt building
    console.log('\n🎯 Test 4: Testing personalization prompt building');
    
    const personalizedPrefs = {
      use_profile_for_main_answer: true,
      age: 22,
      education_level: 'Undergraduate',
      main_learning_goal: 'Professional Development',
      technical_depth: 75,
      learning_style: 'Visual'
    };
    
    const personalizationPrompt = buildTestPersonalizationPrompt(personalizedPrefs);
    console.log('✅ Personalization prompt generated:', {
      enabled: personalizedPrefs.use_profile_for_main_answer,
      promptLength: personalizationPrompt.length,
      hasAgeInfo: personalizationPrompt.includes('22'),
      hasEducationInfo: personalizationPrompt.includes('Undergraduate'),
      hasGoalInfo: personalizationPrompt.includes('Professional Development')
    });

    // Test 5: Test with personalization disabled
    console.log('\n🔄 Test 5: Testing with personalization disabled');
    
    const disabledPrefs = {
      use_profile_for_main_answer: false,
      age: 22,
      education_level: 'Undergraduate'
    };
    
    const disabledPrompt = buildTestPersonalizationPrompt(disabledPrefs);
    console.log('✅ Disabled personalization test:', {
      enabled: disabledPrefs.use_profile_for_main_answer,
      promptLength: disabledPrompt.length,
      shouldBeEmpty: disabledPrompt === ''
    });

    // Test 6: Database validation
    console.log('\n💾 Test 6: Database validation');
    
    const { data: dbProfile, error } = await supabase
      .from('user_profiles')
      .select('use_interests_for_analogies, use_profile_for_main_answer, interests, preferred_analogy_domains')
      .eq('id', testUserId)
      .single();
    
    if (!error && dbProfile) {
      console.log('✅ Database validation passed:', {
        use_interests_for_analogies: dbProfile.use_interests_for_analogies,
        use_profile_for_main_answer: dbProfile.use_profile_for_main_answer,
        interests_type: Array.isArray(dbProfile.interests) ? 'array' : typeof dbProfile.interests,
        domains_type: Array.isArray(dbProfile.preferred_analogy_domains) ? 'array' : typeof dbProfile.preferred_analogy_domains
      });
    } else {
      console.log('❌ Database validation failed:', error);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data');
    await supabase
      .from('user_profiles')
      .delete()
      .eq('id', testUserId);
    
    console.log('✅ Test cleanup completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }

  console.log('\n🎉 Personalization features test completed!');
  console.log('=' * 50);
}

// Helper function to test analogy domain selection logic
function testAnalogySelection(preferences) {
  let analogyDomains = ['everyday life', 'nature', 'cooking', 'sports']; // fallback defaults
  let domainSource = 'default';

  if (preferences?.use_interests_for_analogies && preferences?.interests?.length) {
    analogyDomains = preferences.interests;
    domainSource = 'interests';
  } else if (preferences?.preferred_analogy_domains?.length) {
    analogyDomains = preferences.preferred_analogy_domains;
    domainSource = 'preferred_domains';
  } else if (preferences?.interests?.length) {
    analogyDomains = preferences.interests;
    domainSource = 'interests_fallback';
  }

  return { domains: analogyDomains, source: domainSource };
}

// Helper function to test personalization prompt building
function buildTestPersonalizationPrompt(preferences) {
  if (!preferences.use_profile_for_main_answer) {
    return '';
  }

  const personalizations = [];

  if (preferences.age) {
    personalizations.push(`User Age: ${preferences.age} years old`);
  }

  if (preferences.education_level) {
    personalizations.push(`Education Level: ${preferences.education_level}`);
  }

  if (preferences.main_learning_goal) {
    personalizations.push(`Learning Goal: ${preferences.main_learning_goal}`);
  }

  if (preferences.technical_depth !== undefined) {
    personalizations.push(`Technical Depth Preference: ${preferences.technical_depth}/100`);
  }

  if (preferences.learning_style) {
    personalizations.push(`Learning Style: ${preferences.learning_style}`);
  }

  if (personalizations.length > 0) {
    return `\n\n--- User Profile for Personalization ---\n${personalizations.join('\n')}\n\nPlease adapt your response appropriately for this user profile.`;
  }

  return '';
}

// Run the test
testPersonalizationFeatures().catch(console.error); 