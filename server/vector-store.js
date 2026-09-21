import { createHash } from "node:crypto";

const DEFAULT_COLLECTION = "game_signal_lab";
const DEFAULT_DIMENSIONS = 384;

export class VectorStoreError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "VectorStoreError";
  }
}

/**
 * Qdrant-backed vector storage for the Linux/Node adapter.
 *
 * Every point carries a `user_id` payload and every read/delete operation
 * includes an exact payload filter. The application never trusts a user id
 * supplied by the browser for retrieval: callers pass the authenticated id.
 */
export class QdrantVectorStore {
  constructor({
    baseUrl,
    collection = DEFAULT_COLLECTION,
    apiKey = "",
    dimensions = DEFAULT_DIMENSIONS,
    embeddingUrl = "",
    embeddingApiKey = "",
    embeddingModel = "",
    fetchImpl = globalThis.fetch,
  }) {
    if (!baseUrl) throw new Error("Qdrant baseUrl is required");
    if (typeof fetchImpl !== "function") throw new Error("fetch is required");
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    this.collection = encodeURIComponent(collection);
    this.collectionName = collection;
    this.apiKey = apiKey;
    this.dimensions = dimensions;
    this.embeddingUrl = embeddingUrl;
    this.embeddingApiKey = embeddingApiKey;
    this.embeddingModel = embeddingModel;
    this.fetch = fetchImpl;
    this.ready = null;
  }

  static fromEnv(env = process.env, options = {}) {
    const baseUrl = String(env.VECTOR_DB_URL ?? "").trim();
    if (!baseUrl) return null;
    const dimensions = Number(env.VECTOR_DIMENSIONS ?? DEFAULT_DIMENSIONS);
    if (!Number.isInteger(dimensions) || dimensions < 32 || dimensions > 4096) {
      throw new Error("VECTOR_DIMENSIONS must be an integer between 32 and 4096");
    }
    return new QdrantVectorStore({
      baseUrl,
      collection: String(env.VECTOR_DB_COLLECTION ?? DEFAULT_COLLECTION).trim() || DEFAULT_COLLECTION,
      apiKey: String(env.VECTOR_DB_API_KEY ?? "").trim(),
      dimensions,
      embeddingUrl: String(env.EMBEDDING_API_URL ?? "").trim(),
      embeddingApiKey: String(env.EMBEDDING_API_KEY ?? "").trim(),
      embeddingModel: String(env.EMBEDDING_MODEL ?? "").trim(),
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
    });
  }

  async replaceUser(userId, documents) {
    await this.ensureReady();
    await this.deleteUser(userId);
    if (!documents.length) return;
    const vectors = await this.embed(documents.map((document) => `${document.title}\n${document.content}`));
    const points = documents.map((document, index) => ({
      id: pointId(userId, document.externalId),
      vector: vectors[index],
      payload: {
        user_id: String(userId),
        external_id: document.externalId,
        kind: document.kind,
        title: document.title,
        content: document.content,
        content_hash: sha256(document.content),
        updated_at: new Date().toISOString(),
      },
    }));
    await this.request(`/collections/${this.collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ points }),
    });
  }

  async deleteUser(userId) {
    await this.ensureReady();
    await this.request(`/collections/${this.collection}/points/delete?wait=true`, {
      method: "POST",
      body: JSON.stringify({
        filter: { must: [{ key: "user_id", match: { value: String(userId) } }] },
      }),
    });
  }

  async search(userId, query, limit) {
    await this.ensureReady();
    const [vector] = await this.embed([query]);
    const result = await this.request(`/collections/${this.collection}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        filter: { must: [{ key: "user_id", match: { value: String(userId) } }] },
      }),
    });
    return Array.isArray(result?.result) ? result.result : [];
  }

  async ensureReady() {
    if (!this.ready) this.ready = this.ensureCollection().catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  async ensureCollection() {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}collections/${this.collection}`, {
        headers: this.headers(),
      });
    } catch (error) {
      throw new VectorStoreError("Qdrant collection check failed", error);
    }
    if (response.ok) return;
    if (response.status !== 404) {
      throw new VectorStoreError(`Qdrant collection check failed (${response.status})`);
    }
    await this.request(`/collections/${this.collection}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: { size: this.dimensions, distance: "Cosine" },
        optimizers_config: { default_segment_number: 2 },
        on_disk_payload: true,
      }),
    });
  }

  async embed(texts) {
    if (this.embeddingUrl) return this.embedWithProvider(texts);
    return texts.map((text) => hashedEmbedding(text, this.dimensions));
  }

  async embedWithProvider(texts) {
    const headers = { "content-type": "application/json" };
    if (this.embeddingApiKey) headers.authorization = `Bearer ${this.embeddingApiKey}`;
    const response = await this.fetch(this.embeddingUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...(this.embeddingModel ? { model: this.embeddingModel } : {}),
        input: texts,
      }),
    });
    if (!response.ok) throw new VectorStoreError(`Embedding provider failed (${response.status})`);
    const body = await response.json();
    const vectors = body?.data?.map((item) => item?.embedding);
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new VectorStoreError("Embedding provider returned an invalid vector batch");
    }
    for (const vector of vectors) {
      if (!Array.isArray(vector) || vector.length !== this.dimensions || vector.some((value) => !Number.isFinite(value))) {
        throw new VectorStoreError("Embedding provider returned a vector with the wrong dimensions");
      }
    }
    return vectors;
  }

  async request(path, init = {}) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path.replace(/^\//, "")}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
      });
    } catch (error) {
      throw new VectorStoreError("Qdrant request failed", error);
    }
    if (!response.ok) {
      throw new VectorStoreError(`Qdrant request failed (${response.status})`);
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch (error) {
      throw new VectorStoreError("Qdrant returned invalid JSON", error);
    }
  }

  headers() {
    return {
      accept: "application/json",
      "content-type": "application/json",
      ...(this.apiKey ? { "api-key": this.apiKey } : {}),
    };
  }
}

function pointId(userId, externalId) {
  const hex = sha256(`${userId}:${externalId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function hashedEmbedding(value, dimensions) {
  const vector = new Array(dimensions).fill(0);
  const normalized = String(value ?? "").normalize("NFKC").toLocaleLowerCase();
  const tokens = normalized.match(/[\p{L}\p{N}]{1,32}/gu) ?? [];
  const units = tokens.length ? tokens : [...normalized].filter((char) => !/\s/u.test(char));
  for (const unit of units) {
    const digest = createHash("sha256").update(unit).digest();
    const first = digest.readUInt32BE(0) % dimensions;
    const second = digest.readUInt32BE(4) % dimensions;
    vector[first] += 1;
    vector[second] += 0.5;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
