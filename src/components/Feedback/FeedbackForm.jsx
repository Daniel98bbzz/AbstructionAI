const fetchHighlyRatedQueries = async () => {
  try {
    const { data, error } = await supabase
      .from('queries')
      .select(`
        id,
        query,
        response,
        feedbacks!inner (
          rating
        )
      `)
      .gte('feedbacks.rating', 4)
      .order('feedbacks.rating', { ascending: false, foreignTable: 'feedbacks' })
      .limit(5);

    if (error) throw error;
    setHighlyRatedQueries(data || []);
  } catch (error) {
    console.error('Error fetching highly rated queries:', error);
  }
}; 