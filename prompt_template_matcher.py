import os
import json
import numpy as np
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import Counter

# --- Load environment variables ---
load_dotenv()
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Step 1: Fetch clustered interactions with prompt template and feedback ---
def fetch_clustered_interactions():
    print("\U0001F4E5 Fetching clustered interactions with templates and feedback...")
    response = supabase.table("interactions").select("id, cluster_id, prompt_template_id, verbal_feedback").neq("cluster_id", None).execute()
    return response.data

# --- Step 2: Calculate most successful template per cluster ---
def determine_best_templates(interactions):
    print("\U0001F50E Analyzing cluster  template effectiveness")
    cluster_map = {}
    for row in interactions:
        cluster_id = row["cluster_id"]
        template_id = row["prompt_template_id"]
        feedback = (row["verbal_feedback"] or "").lower()

        if cluster_id not in cluster_map:
            cluster_map[cluster_id] = []

        if template_id and any(kw in feedback for kw in ["thank", "clear", "help", "understood", "great"]):
            cluster_map[cluster_id].append(template_id)

    cluster_top_template = {
        cid: Counter(tmpls).most_common(1)[0][0]
        for cid, tmpls in cluster_map.items() if tmpls
    }
    return cluster_top_template

# --- Step 3: Save or print mappings ---
def print_summary(cluster_top_template):
    print("\n\U0001F3C6 Best prompt template per cluster:")
    for cluster_id, template_id in cluster_top_template.items():
        print(f"Cluster {cluster_id}: Template {template_id}")

# --- Main ---
def main():
    data = fetch_clustered_interactions()
    best_templates = determine_best_templates(data)
    print_summary(best_templates)
    # Optional: save to Supabase or to file here

if __name__ == "__main__":
    main() 