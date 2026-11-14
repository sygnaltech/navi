interface ImportMetaEnv {
  /** Which Sanity dataset the site reads. Empty means project.jsonc's value. */
  readonly SANITY_DATASET?: string;
  /** Read-only token, needed only for drafts/preview. */
  readonly SANITY_READ_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
