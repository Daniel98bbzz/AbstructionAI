import { supabase } from '../lib/supabaseClient';

/**
 * A utility to test the feedback submission functionality.
 * Run this script with a valid session ID to test if the feedback 
 * submission works correctly.
 */
async function testFeedbackSubmission() {
  const messageId = 'test-message-id-' + Date.now();
  const sessionId = '11111111-1111-1111-1111-111111111111'; // Replace with a valid session ID
  const userId = 'test-user-id'; // Replace with a valid user ID
  
  const feedbackContent = {
    rating: 4,
    explanationClear: 'yes',
    explanationDetail: 'exactly_right',
    analogyHelpful: 'yes',
    comments: 'This is a test feedback submission.'
  };

  console.log('Testing feedback submission with:');
  console.log('- Message ID:', messageId);
  console.log('- Session ID:', sessionId);
  console.log('- User ID:', userId);
  console.log('- Feedback content:', feedbackContent);

  try {
    // Attempt to call the submit_feedback RPC function
    const { data, error } = await supabase.rpc('submit_feedback', {
      p_message_id: messageId,
      p_session_id: sessionId,
      p_feedback_content: feedbackContent,
      p_user_id: userId
    });

    if (error) {
      console.error('Error submitting feedback:', error);
      return;
    }

    console.log('Feedback submitted successfully:', data);

    // Verify the feedback was actually stored in the database
    const { data: verifyData, error: verifyError } = await supabase
      .from('interactions')
      .select('*')
      .eq('message_id', messageId)
      .single();

    if (verifyError) {
      console.error('Error verifying feedback in database:', verifyError);
      return;
    }

    console.log('Feedback found in database:', verifyData);
  } catch (error) {
    console.error('Unexpected error during feedback test:', error);
  }
}

// Run the test
testFeedbackSubmission();

export default testFeedbackSubmission; 