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
  slug: string;
}

export interface SearchRequestBody {
  prompt?: string;
  query?: string;
}
