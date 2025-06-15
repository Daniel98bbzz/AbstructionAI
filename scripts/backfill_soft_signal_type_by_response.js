import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillSoftSignalType() {
  const { data: usageRows, error: usageError } = await supabase
    .from('prompt_template_usage')
    .select('id, response_id')
    .is('soft_signal_type', null);

  if (usageError) {
    console.error('Error fetching usage rows:', usageError);
    return;
  }

  let updated = 0;

  for (const row of usageRows) {
    if (!row.response_id) continue;

    const { data: interaction, error: interactionError } = await supabase
      .from('interactions')
      .select('soft_signal')
      .eq('id', row.response_id) // match by response_id (same as interaction id)
      .single();

    if (interactionError || !interaction) {
      console.log(`No matching interaction for usage id ${row.id}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('prompt_template_usage')
      .update({ soft_signal_type: interaction.soft_signal })
      .eq('id', row.id);

    if (!updateError) {
      updated++;
    }
  }

  console.log(` ✅ Backfill complete. Updated ${updated} rows.`);
}

backfillSoftSignalType(); 