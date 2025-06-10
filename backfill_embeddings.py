import os
import time
import json
import openai
from supabase import create_client, Client
from dotenv import load_dotenv

# --- Load .env ---
load_dotenv()
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

openai.api_key = OPENAI_API_KEY
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Step 1: Fetch all missing embeddings ---
print("🔍 Fetching interactions without embedding...")
response = supabase.table("interactions").select("id, query").is_("embedding", "null").execute()
records = response.data

print(f"📄 Found {len(records)} entries to embed.")
if not records:
    exit()

# --- Step 2: Embed and update each one ---
for r in records:
    query = r["query"]
    interaction_id = r["id"]

    if not query or query.strip() == "":
        print(f"⚠️ Skipping empty query (id={interaction_id})")
        continue

    try:
        print(f"✨ Embedding query: {query[:50]}...")
        response = openai.embeddings.create(
            input=query,
            model="text-embedding-3-small"
        )
        embedding = response.data[0].embedding

        supabase.table("interactions").update({"embedding": embedding}).eq("id", interaction_id).execute()
        print(f" ✅ Updated id={interaction_id}")

        time.sleep(0.5)  # rate limiting safety

    except Exception as e:
        print(f"❌ Failed to embed id={interaction_id}: {e}") 