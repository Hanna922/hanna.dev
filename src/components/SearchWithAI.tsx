import type { CollectionEntry } from "astro:content";
import { useCompletion } from "@ai-sdk/react";

export type SearchWithAIItem = {
  title: string;
  description: string;
  data: CollectionEntry<"blog">["data"];
  slug: string;
};

export default function SearchWithAIComponent() {
  const {
    input,
    handleInputChange,
    handleSubmit,
    completion,
    isLoading,
    error,
  } = useCompletion({
    api: "/api/search",
  });

  return (
    <div>
      <form
        onSubmit={e => {
          e.preventDefault();
          handleSubmit(e);
        }}
      >
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder="Search with AI"
        />
        <button type="submit" disabled={isLoading}>
          Search
        </button>
      </form>
      <div>
        {isLoading && <p>Searching...</p>}
        {error && <p>Error: {error.message}</p>}
        {completion && (
          <div>
            <h2>Search Results:</h2>
            <p>{completion}</p>
          </div>
        )}
      </div>
    </div>
  );
}
