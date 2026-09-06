import { QdrantVectorStore } from "./vector-store.js";
export const scopedFilter = (userId, storyId, revision) => ({
  must: [
    { key: "user_id", match: { value: String(userId) } },
    { key: "story_id", match: { value: storyId } },
    { key: "story_revision", match: { value: revision } },
    { key: "deleted", match: { value: false } },
  ],
});
export class CompanionMemoryIndex {
  constructor(base) {
    this.base = base;
  }
  static fromEnv(env, fetchImpl) {
    if (!env.VECTOR_DB_URL) return null;
    const fetchBounded = (url, options = {}) =>
      fetchImpl(url, { ...options, signal: AbortSignal.timeout(2500) });
    return new CompanionMemoryIndex(
      QdrantVectorStore.fromEnv(
        {
          ...env,
          VECTOR_DB_COLLECTION: `${env.VECTOR_DB_COLLECTION || "game_signal_lab"}_companion_v1`,
        },
        { fetchImpl: fetchBounded },
      ),
    );
  }
  async remove(userId) {
    await this.base.deleteUser(userId);
  }
  async replace(userId, story) {
    const base = this.base;
    await base.ensureReady();
    // Replacing this one active story never touches the legacy collection.
    await base.request(
      `/collections/${base.collection}/points/delete?wait=true`,
      {
        method: "POST",
        body: JSON.stringify({
          filter: scopedFilter(userId, story.id, story.revision),
        }),
      },
    );
    if (!story.memories.length) return;
    const vectors = await base.embed(story.memories.map((m) => m.content));
    const points = story.memories.map((m, i) => ({
      id: m.id,
      vector: vectors[i],
      payload: {
        user_id: String(userId),
        story_id: story.id,
        story_revision: story.revision,
        deleted: false,
        memory_id: m.id,
        content: m.content,
      },
    }));
    await base.request(`/collections/${base.collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ points }),
    });
  }
  async search(userId, story, query) {
    const base = this.base;
    await base.ensureReady();
    const [vector] = await base.embed([query]);
    const result = await base.request(
      `/collections/${base.collection}/points/search`,
      {
        method: "POST",
        body: JSON.stringify({
          vector,
          limit: 12,
          with_payload: true,
          filter: scopedFilter(userId, story.id, story.revision),
        }),
      },
    );
    // SQL truth is revalidated even when an index contains stale/malicious points.
    return (result.result || [])
      .flatMap((hit) => {
        const p = hit.payload;
        if (
          p?.user_id !== String(userId) ||
          p.story_id !== story.id ||
          p.story_revision !== story.revision ||
          p.deleted !== false
        )
          return [];
        const memory = story.memories.find(
          (m) => m.id === p.memory_id && m.content === p.content,
        );
        return memory ? [memory] : [];
      })
      .slice(0, 8);
  }
}
