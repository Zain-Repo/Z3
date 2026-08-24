export interface Z3ChatEmbeddingModel {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly contextLength: number;
}

export const Z3CHAT_EMBEDDING_MODELS: readonly Z3ChatEmbeddingModel[] = [
  {
    id: "voyageai/voyage-4-large",
    label: "voyage-4-large",
    provider: "voyageai",
    contextLength: 32000,
  },
  { id: "voyageai/voyage-4", label: "voyage-4", provider: "voyageai", contextLength: 32000 },
  {
    id: "voyageai/voyage-4-lite",
    label: "voyage-4-lite",
    provider: "voyageai",
    contextLength: 32000,
  },
  {
    id: "voyageai/voyage-code-4",
    label: "voyage-code-4",
    provider: "voyageai",
    contextLength: 32000,
  },
  {
    id: "voyageai/voyage-multimodal-3.5",
    label: "voyage-multimodal-3.5",
    provider: "voyageai",
    contextLength: 32000,
  },
  {
    id: "google/gemini-embedding-2",
    label: "gemini-embedding-2",
    provider: "google",
    contextLength: 8192,
  },
  {
    id: "google/gemini-embedding-2-preview",
    label: "gemini-embedding-2-preview",
    provider: "google",
    contextLength: 8192,
  },
  {
    id: "google/gemini-embedding-001",
    label: "gemini-embedding-001",
    provider: "google",
    contextLength: 20000,
  },
  {
    id: "openai/text-embedding-3-large",
    label: "text-embedding-3-large",
    provider: "openai",
    contextLength: 8192,
  },
  {
    id: "openai/text-embedding-3-small",
    label: "text-embedding-3-small",
    provider: "openai",
    contextLength: 8192,
  },
  {
    id: "openai/text-embedding-ada-002",
    label: "text-embedding-ada-002",
    provider: "openai",
    contextLength: 8192,
  },
  {
    id: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    label: "llama-nemotron-embed-vl-1b-v2 (free)",
    provider: "nvidia",
    contextLength: 131072,
  },
  {
    id: "nvidia/nemotron-3-embed-1b:free",
    label: "nemotron-3-embed-1b (free)",
    provider: "nvidia",
    contextLength: 32768,
  },
  {
    id: "perplexity/pplx-embed-v1-4b",
    label: "pplx-embed-v1-4b",
    provider: "perplexity",
    contextLength: 32000,
  },
  {
    id: "perplexity/pplx-embed-v1-0.6b",
    label: "pplx-embed-v1-0.6b",
    provider: "perplexity",
    contextLength: 32000,
  },
  {
    id: "qwen/qwen3-embedding-8b",
    label: "qwen3-embedding-8b",
    provider: "qwen",
    contextLength: 32768,
  },
  {
    id: "qwen/qwen3-embedding-4b",
    label: "qwen3-embedding-4b",
    provider: "qwen",
    contextLength: 32768,
  },
  {
    id: "mistralai/codestral-embed-2505",
    label: "codestral-embed-2505",
    provider: "mistralai",
    contextLength: 8192,
  },
  {
    id: "mistralai/mistral-embed-2312",
    label: "mistral-embed-2312",
    provider: "mistralai",
    contextLength: 8192,
  },
  { id: "baai/bge-m3", label: "bge-m3", provider: "baai", contextLength: 8194 },
  {
    id: "baai/bge-large-en-v1.5",
    label: "bge-large-en-v1.5",
    provider: "baai",
    contextLength: 512,
  },
  { id: "baai/bge-base-en-v1.5", label: "bge-base-en-v1.5", provider: "baai", contextLength: 512 },
  {
    id: "liquid/lfm-2.5-embedding-350m:free",
    label: "lfm-2.5-embedding-350m (free)",
    provider: "liquid",
    contextLength: 512,
  },
  { id: "thenlper/gte-large", label: "gte-large", provider: "thenlper", contextLength: 512 },
  { id: "thenlper/gte-base", label: "gte-base", provider: "thenlper", contextLength: 512 },
  {
    id: "intfloat/multilingual-e5-large",
    label: "multilingual-e5-large",
    provider: "intfloat",
    contextLength: 512,
  },
  { id: "intfloat/e5-large-v2", label: "e5-large-v2", provider: "intfloat", contextLength: 512 },
  { id: "intfloat/e5-base-v2", label: "e5-base-v2", provider: "intfloat", contextLength: 512 },
  {
    id: "sentence-transformers/all-mpnet-base-v2",
    label: "all-mpnet-base-v2",
    provider: "sentence-transformers",
    contextLength: 512,
  },
  {
    id: "sentence-transformers/all-minilm-l12-v2",
    label: "all-minilm-l12-v2",
    provider: "sentence-transformers",
    contextLength: 512,
  },
  {
    id: "sentence-transformers/all-minilm-l6-v2",
    label: "all-minilm-l6-v2",
    provider: "sentence-transformers",
    contextLength: 512,
  },
  {
    id: "sentence-transformers/paraphrase-minilm-l6-v2",
    label: "paraphrase-minilm-l6-v2",
    provider: "sentence-transformers",
    contextLength: 512,
  },
  {
    id: "sentence-transformers/multi-qa-mpnet-base-dot-v1",
    label: "multi-qa-mpnet-base-dot-v1",
    provider: "sentence-transformers",
    contextLength: 512,
  },
];

export const Z3CHAT_EMBEDDING_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  openrouter: "OpenRouter (all models)",
  voyageai: "Voyage AI",
  google: "Google",
  openai: "OpenAI",
  nvidia: "NVIDIA",
  perplexity: "Perplexity",
  qwen: "Qwen",
  mistralai: "Mistral AI",
  baai: "BAAI",
  liquid: "Liquid AI",
  thenlper: "Thenlper",
  intfloat: "Intfloat",
  "sentence-transformers": "Sentence Transformers",
};

export const Z3CHAT_EMBEDDING_PROVIDERS = Object.keys(Z3CHAT_EMBEDDING_PROVIDER_LABELS).map(
  (id) => ({ id, label: Z3CHAT_EMBEDDING_PROVIDER_LABELS[id] ?? id }),
);

export function embeddingModelsForProvider(provider: string): readonly Z3ChatEmbeddingModel[] {
  if (provider === "openrouter") {
    return Z3CHAT_EMBEDDING_MODELS;
  }
  return Z3CHAT_EMBEDDING_MODELS.filter((model) => model.provider === provider);
}

export function embeddingProviderForModel(modelId: string): string | null {
  return Z3CHAT_EMBEDDING_MODELS.find((model) => model.id === modelId)?.provider ?? null;
}
