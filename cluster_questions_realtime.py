"""
Semantic Clustering: Realtime Pipeline for AbstructionAI
- Fetch embeddings from Supabase
- Run HDBSCAN clustering
- Update cluster_id in interactions
- Update semantic_clusters with centroids and representatives
"""

import os
import json
import numpy as np
import pandas as pd
import hdbscan
from supabase import create_client, Client
from dotenv import load_dotenv

# --- Load environment variables from .env ---
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Step 1: Fetch all embeddings from Supabase ---
def fetch_embeddings():
    print("Fetching embeddings from Supabase...")
    response = supabase.table("interactions").select("id, query, embedding").execute()
    records = response.data
    # Filter out rows where embedding is None, 'None', or empty
    filtered_records = [
        r for r in records
        if r.get("embedding") not in (None, "None", "")
    ]
    df = pd.DataFrame(filtered_records)
    if df.empty:
        return df
    # Parse embedding if it's a string, and keep only valid lists
    def parse_embedding(x):
        if isinstance(x, str):
            try:
                val = json.loads(x)
                if isinstance(val, list):
                    return val
            except Exception:
                return None
        elif isinstance(x, list):
            return x
        return None
    df['embedding'] = df['embedding'].apply(parse_embedding)
    df = df[df['embedding'].apply(lambda x: isinstance(x, list))]
    return df

# --- Step 2: Run HDBSCAN clustering ---
def run_hdbscan(df):
    print(f"Running HDBSCAN on {len(df)} embeddings...")
    X = np.vstack(df["embedding"].to_list())
    # Dynamic min_cluster_size: at least 5, or 1% of data if large
    min_cluster_size = max(5, int(len(X) * 0.01))
    clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
    labels = clusterer.fit_predict(X)
    df["cluster_id"] = labels
    print(f"Found {len(set(labels)) - (1 if -1 in labels else 0)} clusters, {list(labels).count(-1)} noise points.")
    return df, labels

# --- Step 3: Calculate semantic_clusters table ---
def compute_clusters(df, labels):
    print("Computing centroids and representative queries for each cluster...")
    semantic_clusters = []
    for cluster_id in set(labels):
        if cluster_id == -1:
            continue
        cluster_points = df[df["cluster_id"] == cluster_id]
        embeddings = np.vstack(cluster_points["embedding"])
        centroid = embeddings.mean(axis=0)
        dists = np.linalg.norm(embeddings - centroid, axis=1)
        rep_idx = dists.argmin()
        rep_query = cluster_points.iloc[rep_idx]["query"]
        print(f"Cluster {cluster_id}: size={len(cluster_points)}, representative='{rep_query[:60]}...'")
        semantic_clusters.append({
            "id": int(cluster_id),
            "centroid": centroid.tolist(),
            "size": len(cluster_points),
            "representative_query": rep_query
        })
    return semantic_clusters

# --- Step 4: Push updates to Supabase ---
def update_supabase(df, semantic_clusters):
    print("Updating cluster_id in interactions table...")
    for _, row in df.iterrows():
        supabase.table("interactions").update({"cluster_id": int(row["cluster_id"]) if row["cluster_id"] != -1 else None}).eq("id", row["id"]).execute()
    print("Upserting semantic_clusters table...")
    for cluster in semantic_clusters:
        supabase.table("semantic_clusters").upsert(cluster).execute()
    print("✅ Supabase tables updated.")

# --- Main pipeline ---
def main():
    print("\n🚀 Starting semantic clustering pipeline...")
    df = fetch_embeddings()
    if df.empty:
        print("⚠️ No embeddings found. Exiting.")
        return
    df, labels = run_hdbscan(df)
    semantic_clusters = compute_clusters(df, labels)
    update_supabase(df, semantic_clusters)
    print(f"\n✅ Clustering completed. Clusters: {len(semantic_clusters)}")

if __name__ == "__main__":
    main() 