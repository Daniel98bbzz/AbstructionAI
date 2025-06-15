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
import argparse

# --- Config ---
CLUSTERING_VERSION = "v1-hdbscan-202406"
EXPORT_JSON_PATH = "semantic_clusters_export.json"

# --- Load environment variables from .env ---
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Step 1: Fetch all embeddings from Supabase ---
def fetch_embeddings(full_recluster=False):
    print("Fetching embeddings from Supabase...")
    query = supabase.table("interactions").select("id, query, embedding, cluster_id")
    if not full_recluster:
        query = query.is_("cluster_id", None)
    response = query.execute()
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
            "representative_query": rep_query,
            "clustering_version": CLUSTERING_VERSION
        })
    return semantic_clusters

# --- Step 4: Push updates to Supabase ---
def update_supabase(df, semantic_clusters):
    print("Updating cluster_id, clustering_version, and is_noise in interactions table...")
    for _, row in df.iterrows():
        is_noise = (row["cluster_id"] == -1)
        update_data = {
            "cluster_id": None if is_noise else int(row["cluster_id"]),
            "clustering_version": CLUSTERING_VERSION,
            "is_noise": is_noise
        }
        try:
            supabase.table("interactions").update(update_data).eq("id", row["id"]).execute()
        except Exception as e:
            print(f"[WARN] Failed to update interaction {row['id']}: {e}")
    print("Upserting semantic_clusters table...")
    for cluster in semantic_clusters:
        try:
            supabase.table("semantic_clusters").upsert(cluster).execute()
        except Exception as e:
            print(f"[WARN] Failed to upsert semantic_cluster {cluster['id']}: {e}")
    print("✅ Supabase tables updated.")

def export_clusters_to_json(semantic_clusters):
    print(f"Exporting cluster summary to {EXPORT_JSON_PATH} ...")
    try:
        with open(EXPORT_JSON_PATH, "w") as f:
            json.dump(semantic_clusters, f, indent=2)
        print(f"✅ Exported cluster summary to {EXPORT_JSON_PATH}")
    except Exception as e:
        print(f"[WARN] Failed to export cluster summary: {e}")

# --- Main pipeline ---
def main():
    parser = argparse.ArgumentParser(description='Semantic clustering pipeline for AbstructionAI')
    parser.add_argument('--full-recluster', action='store_true', 
                       help='Cluster all questions, not just new ones')
    args = parser.parse_args()
    
    print("\nStarting semantic clustering pipeline...")
    
    # Load environment variables
    load_dotenv()
    
    # Initialize Supabase client
    url = os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("VITE_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("ERROR: Missing Supabase credentials in environment variables")
        return
    
    supabase = create_client(url, key)
    
    try:
        # Determine which interactions to cluster
        if args.full_recluster:
            print("Full re-clustering mode: Processing all interactions")
            response = supabase.table("interactions") \
                .select("id, query, embedding") \
                .execute()
        else:
            print("Incremental mode: Processing only unassigned interactions")
            response = supabase.table("interactions") \
                .select("id, query, embedding") \
                .is_("cluster_id", None) \
                .execute()
        
        if not response.data:
            print("No embeddings found to cluster.")
            return
        
        print(f"Found {len(response.data)} total interactions")
        
        # Filter out interactions with invalid embeddings
        valid_interactions = []
        for interaction in response.data:
            embedding = interaction.get('embedding')
            if embedding is not None and embedding != 'None' and embedding != '':
                # Try to parse the embedding to make sure it's valid
                try:
                    if isinstance(embedding, str):
                        parsed_embedding = json.loads(embedding)
                        if isinstance(parsed_embedding, list) and len(parsed_embedding) > 0:
                            valid_interactions.append(interaction)
                    elif isinstance(embedding, list) and len(embedding) > 0:
                        valid_interactions.append(interaction)
                except (json.JSONDecodeError, TypeError):
                    print(f"Skipping interaction {interaction['id']} with invalid embedding")
                    continue
        
        if not valid_interactions:
            print("No valid embeddings found to cluster.")
            return
        
        print(f"Found {len(valid_interactions)} interactions with valid embeddings")
        
        # Convert to DataFrame
        df = pd.DataFrame(valid_interactions)
        
        # Extract embeddings (assuming they're stored as arrays)
        embeddings = []
        for embedding in df['embedding']:
            if isinstance(embedding, str):
                # If stored as string, parse it
                embedding = json.loads(embedding)
            embeddings.append(embedding)
        
        X = np.array(embeddings)
        
        # Run HDBSCAN clustering
        # For small datasets, use smaller min_cluster_size
        if len(X) < 10:
            min_cluster_size = 2  # Very small for testing
            print(f"Small dataset detected ({len(X)} points), using min_cluster_size=2")
        else:
            min_cluster_size = max(2, len(X) // 10)  # Dynamic cluster size
            
        print(f"Using min_cluster_size={min_cluster_size}")
        clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
        labels = clusterer.fit_predict(X)
        
        # Add cluster labels to DataFrame
        df['cluster_id'] = labels
        
        # Count clusters and noise
        unique_labels = set(labels)
        n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
        n_noise = list(labels).count(-1)
        
        print(f"Clustering results:")
        print(f"  - Total points: {len(X)}")
        print(f"  - Clusters found: {n_clusters}")
        print(f"  - Noise points: {n_noise}")
        print(f"  - Cluster labels: {sorted(unique_labels)}")
        
        # Show cluster distribution
        for label in sorted(unique_labels):
            count = list(labels).count(label)
            if label == -1:
                print(f"  - Noise: {count} points")
            else:
                print(f"  - Cluster {label}: {count} points")
        
        # Update cluster_id, clustering_version, and is_noise in interactions table
        print("Updating cluster_id, clustering_version, and is_noise in interactions table...")
        for _, row in df.iterrows():
            cluster_id = None if row['cluster_id'] == -1 else int(row['cluster_id'])
            is_noise = row['cluster_id'] == -1
            
            supabase.table("interactions").update({
                "cluster_id": cluster_id,
                "clustering_version": CLUSTERING_VERSION,
                "is_noise": is_noise
            }).eq("id", row['id']).execute()
        
        # Create cluster summaries for semantic_clusters table
        cluster_summaries = []
        for cluster_id in unique_labels:
            if cluster_id == -1:  # Skip noise
                continue
                
            cluster_points = df[df['cluster_id'] == cluster_id]
            cluster_embeddings = X[labels == cluster_id]
            
            # Calculate centroid
            centroid = np.mean(cluster_embeddings, axis=0).tolist()
            
            # Find representative query (closest to centroid)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            representative_idx = np.argmin(distances)
            representative_query = cluster_points.iloc[representative_idx]['query']
            
            cluster_summaries.append({
                "id": int(cluster_id),
                "size": len(cluster_points),
                "centroid": centroid,
                "representative_query": representative_query,
                "clustering_version": CLUSTERING_VERSION
            })
        
        # Upsert semantic_clusters table
        print("Upserting semantic_clusters table...")
        if cluster_summaries:
            supabase.table("semantic_clusters").upsert(cluster_summaries).execute()
        
        print("SUCCESS: Supabase tables updated.")
        
        # Export cluster summary to JSON
        print(f"Exporting cluster summary to {EXPORT_JSON_PATH} ...")
        with open(EXPORT_JSON_PATH, 'w') as f:
            json.dump(cluster_summaries, f, indent=2)
        
        print(f"SUCCESS: Exported cluster summary to {EXPORT_JSON_PATH}")
        print(f"SUCCESS: Clustering completed. Clusters: {n_clusters}")
        
    except Exception as e:
        print(f"ERROR: Clustering failed: {str(e)}")
        raise

if __name__ == "__main__":
    main() 