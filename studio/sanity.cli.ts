import {defineCliConfig} from 'sanity/cli';

// `../config/read-project.cjs`, not the ESM reader and not a direct import of
// project.jsonc: the CLI transpiles THIS file to CommonJS and `require`s its
// imports, so an ESM-only import fails with "require is not defined" and the
// CLI then reports the misleading "sanity.cli.ts does not contain a project
// identifier". See config/read-project.cjs for the full note.
import project from '../config/read-project.cjs';

export default defineCliConfig({
  api: {
    projectId: project.sanity.projectId,
    dataset: project.sanity.dataset,
  },

  // Pinned rather than answered at the prompt, so `npm run studio:deploy` is
  // reproducible and cannot silently publish to a second hostname. Deploying
  // needs a token with the "Deploy Studio" role; an Editor-only token is
  // refused.
  studioHost: project.sanity.studioHost,
});
