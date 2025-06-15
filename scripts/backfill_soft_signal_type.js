import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function backfillSoftSignalType() {
  // 1. Fetch all prompt_template_usage rows that are missing soft_signal_type
  const { data: usageRows, error: usageError } = await supabase
    .from('prompt_template_usage')
    .select('id, session_id, query')
    .is('soft_signal_type', null);

  if (usageError) {
    console.error('Error fetching usage rows:', usageError);
    return;
  }

  let updated = 0;
  for (const row of usageRows) {
    // 2. Find the corresponding interaction
    const { data: interaction, error: interactionError } = await supabase
      .from('interactions')
      .select('soft_signal')
      .eq('session_id', row.session_id)
      .eq('query', row.query)
      .single();

    if (interactionError || !interaction) {
      console.log(`No interaction found for usage id ${row.id}`);
      continue;
    }

    // 3. Update prompt_template_usage with the found soft_signal
    const { error: updateError } = await supabase
      .from('prompt_template_usage')
      .update({ soft_signal_type: interaction.soft_signal })
      .eq('id', row.id);

    if (updateError) {
      console.error(`Error updating usage id ${row.id}:`, updateError);
    } else {
      updated++;
    }
  }

  console.log(`Backfill complete. Updated ${updated} rows.`);
}

backfillSoftSignalType(); 