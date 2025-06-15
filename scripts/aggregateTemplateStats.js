import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function aggregateTemplateStats() {
  // 1. Fetch all prompt_template_usage grouped by cluster_id, template_id
  const { data: usageData, error: usageError } = await supabase
    .from('prompt_template_usage')
    .select('cluster_id, template_id, soft_signal_type')
    .not('cluster_id', 'is', null)
    .not('template_id', 'is', null);

  if (usageError) throw usageError;

  // 2. Aggregate stats using soft_signal_type
  const stats = {};
  const satisfactionSignals = ['satisfaction', 'positive', 'understanding'];
  const confusionSignals = ['confusion', 'negative', 'unclear'];
  usageData.forEach(row => {
    const key = `${row.cluster_id}::${row.template_id}`;
    if (!stats[key]) {
      stats[key] = {
        cluster_id: row.cluster_id,
        template_id: row.template_id,
        num_uses: 0,
        num_satisfactions: 0,
        num_confusions: 0,
        soft_signal_counts: {}
      };
    }
    stats[key].num_uses++;
    const signal = (row.soft_signal_type || '').toLowerCase();
    stats[key].soft_signal_counts[signal] = (stats[key].soft_signal_counts[signal] || 0) + 1;
    if (satisfactionSignals.includes(signal)) stats[key].num_satisfactions++;
    if (confusionSignals.includes(signal)) stats[key].num_confusions++;
  });

  // 3. Prepare upserts for template_cluster_stats
  const upserts = Object.values(stats).map(stat => {
    // efficacy_score = (num_satisfactions - num_confusions) / num_uses
    const efficacy_score = stat.num_uses === 0 ? 0 : (stat.num_satisfactions - stat.num_confusions) / stat.num_uses;
    return {
      cluster_id: stat.cluster_id,
      template_id: stat.template_id,
      num_uses: stat.num_uses,
      num_satisfactions: stat.num_satisfactions,
      soft_signal_distribution: stat.soft_signal_counts,
      efficacy_score,
      updated_at: new Date().toISOString()
    };
  });

  // 4. Upsert into template_cluster_stats
  const { error } = await supabase
    .from('template_cluster_stats')
    .upsert(upserts, { onConflict: ['cluster_id', 'template_id'] });

  if (error) {
    console.error('❌ Upsert error:', error);
  } else {
    console.log(`✅ Upsert succeeded. Inserted/Updated rows: ${upserts.length}`);
  }
}

// Always run aggregation when this script is executed directly (ESM compatible)
aggregateTemplateStats().catch(err => {
  console.error('Aggregation failed:', err);
  process.exit(1);
}); 