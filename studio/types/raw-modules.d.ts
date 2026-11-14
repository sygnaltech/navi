// Vite's `?raw` suffix yields the file's text. TypeScript knows nothing about
// it, so declare the shape for the one file imported that way.
declare module '*.jsonc?raw' {
  const source: string;
  export default source;
}

// The config readers are plain untyped JS so that the Sanity CLI (CommonJS),
// the browser Studio (Vite) and the migration scripts (plain Node) can all use
// the same files without a build step.
declare module '*/parse-project.mjs' {
  const parseProject: (source: string) => {
    webflow?: {source?: string; siteId?: string};
    sanity: {projectId: string; dataset: string; studioHost?: string; apiVersion?: string};
    cloudflare?: Record<string, unknown>;
  };
  export default parseProject;
}
