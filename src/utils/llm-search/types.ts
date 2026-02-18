export interface SearchDocument {
  id: string;
  title: string;
  description: string;
  tags: string[];
  path: string;
  content: string;
  excerpt: string;
}

export interface SourceRef {
  title: string;
  titleEn?: string;
  slug: string;
}

export interface SearchRequestBody {
  prompt?: string;
  query?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  locale?: string;
}
