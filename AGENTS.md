# eslint-plugin-vue-contentmapper

## Releasing

Releases are published from a pull request by the `Release` workflow (`.github/workflows/release.yml`) through npm trusted publishing. Never publish from a local machine.

1. Branch from an up-to-date `main` as `release-<version>`, set `version` in `package.json`, and commit it as `Release <version>`.
2. Push the branch to `origin` and open an internal pull request against `main`, titled `Release <version>` with an empty body.
3. Run the workflow from `main` with the pull request number:

   ```sh
   gh workflow run release.yml --ref main -f pr=<number>
   ```

4. Wait for the run to pass, then let the user merge the pull request. The published package is the pull request's head commit, so merge only after publishing.

The workflow:

- Accepts only an open, non-draft pull request from this repository targeting `main`, and releases its head commit.
- Requires a valid semver version and a non-private `package.json`, and refuses a version or `v<version>` tag that already exists on another commit. A rerun on the same commit is allowed.
- Picks the npm dist-tag from the prerelease identifier: none is `latest`; `alpha`, `beta`, and `rc` use their own name; anything else is `next`.
- Runs `pnpm test`, `pnpm check`, and `pnpm build`, then `pnpm publish --provenance`.
- Tags the commit `v<version>` and creates a GitHub Release with an empty body, marked as a prerelease for prerelease versions. The user writes the release notes.

npm may take a while to serve a new version; a missing version right after a successful run is not a failure.

Pushing the branch, opening the pull request, and running the workflow each act as the user. Get explicit authorization for each, and confirm the version, pull request title, and body first.
