# Phase 02: Code Quality and Build Verification

Verify the project's code quality tools and build process work correctly. This ensures the development workflow is robust before adding new features.

## Tasks

- [ ] Run type checking and verify TypeScript configuration:
  - Execute `pnpm typecheck`
  - Review any type errors reported
  - If errors exist, document them in `Auto Run Docs/Initiation/Working/typecheck-results.md` with file paths and error messages
  - Determine if errors are pre-existing or critical (critical = blocks build)

- [ ] Run linter and code formatter checks:
  - Execute `pnpm lint` to check code style
  - Execute `pnpm format --check` to verify formatting
  - Document any violations in `Auto Run Docs/Initiation/Working/lint-results.md`
  - If there are auto-fixable issues, run `pnpm lint:fix` and `pnpm format` then verify with `git diff`

- [ ] Test production build process for all platforms:
  - Run `pnpm build` to create production assets
  - Verify `out/` directory is created with main and renderer bundles
  - Check build logs for warnings or errors
  - Confirm build completes successfully (exit code 0)

- [ ] Build platform-specific installers (macOS focus, adapt for other platforms):
  - On macOS: Run `pnpm build:mac:unsigned` to create unsigned DMG
  - Verify `dist/` folder contains the installer (e.g., EnsoAI-0.2.15-arm64.dmg or EnsoAI-0.2.15.dmg)
  - Check installer size is reasonable (typically 100-300MB for Electron apps)
  - Document build artifacts in `Auto Run Docs/Initiation/Working/build-artifacts.md`

- [ ] Test the production build:
  - Locate the built app in `dist/mac-arm64/EnsoAI.app` or `dist/mac/EnsoAI.app`
  - Open the production build (not dev mode): `open dist/mac*/EnsoAI.app`
  - Verify the app launches without crashes
  - Test basic functionality: open terminal, load settings, create worktree dialog
  - Compare behavior to dev mode - should be similar but faster

- [ ] Verify pre-commit hooks and Git workflow:
  - Stage a test file change: `echo "// test" >> src/renderer/test.ts`
  - Attempt to commit: `git add src/renderer/test.ts && git commit -m "test: verify hooks"`
  - Verify Husky runs lint-staged and Biome checks the file
  - Unstage the test change: `git reset HEAD~ && git checkout src/renderer/test.ts`
  - Document hook behavior in `Auto Run Docs/Initiation/Working/git-hooks-verification.md`
